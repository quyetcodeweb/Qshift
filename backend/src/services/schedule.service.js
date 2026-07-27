import database from "../config/db.js";
import {
  getShiftsByIds,
  getEmployeeAvailability,
  getEmployeeRoles,
  getShiftRoleRequirements,
  getScheduleSettings,
  getEmployeeShiftCounts
} from "../models/schedule.model.js";

// ===== HELPER: Build published schedule lookup for duplicate prevention =====
async function buildPublishedScheduleSet(month, year) {
  console.log("[buildPublishedScheduleSet] 🔍 Loading published schedules to prevent duplicates...");
  try {
    const [published] = await database.query(
      `SELECT 
        CAST(employee_id AS CHAR) as emp_id,
        CAST(shift_id AS CHAR) as shift_id,
        DATE_FORMAT(work_date, '%Y-%m-%d') as work_date
       FROM schedules
       WHERE status = 'PUBLISHED'
         AND MONTH(work_date) = ?
         AND YEAR(work_date) = ?`,
      [month, year]
    );

    // ✅ FIX: Create keys with consistent types (as strings for Set compatibility)
    const publishedSet = new Set(
      published.map(row => `${Number(row.emp_id)}_${Number(row.shift_id)}_${row.work_date}`)
    );
    
    console.log(`[buildPublishedScheduleSet] ✅ Loaded ${publishedSet.size} published shifts`);
    return publishedSet;
  } catch (error) {
    console.error("[buildPublishedScheduleSet] ❌ Error:", error.message);
    return new Set();
  }
}

export async function generateSchedule({
  month,
  year,
  shifts,
  constraints,
  detailed_requirements,
  availability: frontendAvailability,
  role_requirements: roleRequirementsOverride,
  scheduling_settings: schedulingSettingsOverride
}) {
  console.log("[generateSchedule] 🚀 IMPROVED SCHEDULE GENERATION START");
  
  try {
    const validationErrors = [];
    
    if (!shifts || shifts.length === 0) {
      throw new Error("❌ Không có ca làm việc nào được cung cấp");
    }
    
    const targetMonth = Number(month);
    const targetYear = Number(year);
    if (!Number.isInteger(targetMonth) || targetMonth < 1 || targetMonth > 12 ||
        !Number.isInteger(targetYear) || targetYear < 2000 || targetYear > 2100) {
      throw new Error("❌ Tháng và năm được yêu cầu");
    }
    
    if (!detailed_requirements || Object.keys(detailed_requirements).length === 0) {
      throw new Error("❌ Vui lòng cấu hình ít nhất một ngày có ca làm việc");
    }

    for (const dateStr of Object.keys(detailed_requirements)) {
      const date = new Date(`${dateStr}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr) ||
          Number.isNaN(date.getTime()) ||
          date.getUTCFullYear() !== targetYear ||
          date.getUTCMonth() + 1 !== targetMonth) {
        validationErrors.push(`❌ Định dạng ngày không hợp lệ: ${dateStr}`);
      }
    }

    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join("; "));
    }

    const normalizedShifts = (shifts || []).map(s => ({
      shift_id: Number(s.shift_id),
      required_employees: Math.max(1, Number(s.required_employees) || 1)
    }));

    const shiftDetails = await getShiftsByIds(
      normalizedShifts.map((s) => s.shift_id)
    );

    if (shiftDetails.length === 0) {
      throw new Error(
        `❌ Không tìm thấy ca nào. IDs: ${normalizedShifts
          .map((s) => s.shift_id)
          .join(", ")}`
      );
    }

    const knownShiftIds = new Set(shiftDetails.map((shift) => Number(shift.shift_id)));
    const missingShiftIds = normalizedShifts
      .map((shift) => shift.shift_id)
      .filter((shiftId) => !knownShiftIds.has(shiftId));
    if (missingShiftIds.length) {
      throw new Error(`Unknown shift IDs: ${[...new Set(missingShiftIds)].join(", ")}`);
    }

    const [employees] = await database.query(
      `SELECT e.employee_id, e.user_id, e.name 
       FROM employees e`
    );

    if (employees.length === 0) {
      throw new Error("❌ Không có nhân viên nào để xếp lịch");
    }

    // ✅ FIX: Normalize all employee_id to numbers to prevent type mismatches
    for (const emp of employees) {
      emp.employee_id = Number(emp.employee_id);
    }

    console.log(
      `[generateSchedule] ✓ Dữ liệu cơ bản: ${employees.length} nhân viên, ${shiftDetails.length} ca`
    );

    const settings = await getScheduleSettings();
    const schedulingSettings = normalizeScheduleSettings(
      schedulingSettingsOverride || settings
    );
    console.log(
      `[generateSchedule] Scheduling settings: balance=${schedulingSettings.balance_scheduling}, consecutive=${schedulingSettings.prefer_consecutive_shifts}, workday=${schedulingSettings.balance_by_workday}, roleFallback=${schedulingSettings.allow_role_fallback}, productivity=${schedulingSettings.productivity_attention}`
    );

    // ✅ NEW: Load published shifts to prevent duplicates
    const publishedScheduleSet = await buildPublishedScheduleSet(targetMonth, targetYear);
    const existingAssignments = await getExistingAssignments(targetMonth, targetYear);
    const allShiftDetails = [
      ...shiftDetails,
      ...existingAssignments
        .filter((assignment) => !knownShiftIds.has(assignment.shift_id))
        .map((assignment) => ({
          shift_id: assignment.shift_id,
          start_time: assignment.start_time,
          end_time: assignment.end_time,
        })),
    ];

    const employeeRoles = {};
    for (const emp of employees) {
      employeeRoles[emp.employee_id] = await getEmployeeRoles(emp.employee_id);
    }

    const hasRoleRequirementOverride =
      roleRequirementsOverride &&
      typeof roleRequirementsOverride === "object";
    const shiftRoleRequirements = {};
    for (const shift of shiftDetails) {
      const savedRequirements = await getShiftRoleRequirements(
        shift.shift_id
      );
      const overrideRequirements = hasRoleRequirementOverride
        ? roleRequirementsOverride?.[shift.shift_id] ||
          roleRequirementsOverride?.[String(shift.shift_id)] ||
          {}
        : undefined;
      shiftRoleRequirements[shift.shift_id] = normalizeRoleRequirements(
        overrideRequirements,
        hasRoleRequirementOverride ? [] : savedRequirements
      );
    }

    // ✅ IMPROVED: Get both availability data AND employee tracking set
    const availabilityResult = await prepareAvailability(
      month,
      year,
      frontendAvailability
    );

    const { employeeAvailability, employeesWithData } = availabilityResult;

    console.log(
      `[generateSchedule] 📅 Khả dụng: ${employeesWithData.size} nhân viên có dữ liệu (từ ${availabilityResult.dataSource})`
    );

    const currentShiftCounts = await getEmployeeShiftCounts(
      employees,
      targetMonth,
      targetYear
    );

    const requirementsByDateShift = {};
    Object.entries(detailed_requirements).forEach(([dateStr, dayConfig]) => {
      if (!dayConfig || typeof dayConfig !== "object") {
        console.warn(`[generateSchedule] ⚠️ Cấu hình ngày không hợp lệ: ${dateStr}`);
        return;
      }

      // ✅ FIX: Normalize date format to ensure consistency
      // Expected format: YYYY-MM-DD, but be tolerant of other formats
      const dateObj = new Date(dateStr);
      let normalizedDate = dateStr;
      
      if (!Number.isNaN(dateObj.getTime())) {
        // Valid date - re-format to YYYY-MM-DD
        const year = dateObj.getFullYear();
        const month = String(dateObj.getMonth() + 1).padStart(2, '0');
        const day = String(dateObj.getDate()).padStart(2, '0');
        normalizedDate = `${year}-${month}-${day}`;
      }

      Object.entries(dayConfig).forEach(([shiftIdStr, count]) => {
        const shiftId = Number(shiftIdStr);
        const numCount = Number(count) || 0;

        if (numCount > 0) {
          if (!knownShiftIds.has(shiftId)) {
            validationErrors.push(`Unknown shift ID in detailed requirements: ${shiftId}`);
            return;
          }
          if (!requirementsByDateShift[normalizedDate]) {
            requirementsByDateShift[normalizedDate] = {};
          }
          requirementsByDateShift[normalizedDate][shiftId] = numCount;
        }
      });
    });

    if (validationErrors.length > 0) {
      throw new Error(validationErrors.join("; "));
    }

    console.log(
      `[generateSchedule] 📋 Yêu cầu: ${Object.keys(requirementsByDateShift).length} ngày, ` +
      `${Object.values(requirementsByDateShift).reduce((sum, day) => sum + Object.values(day).reduce((a, b) => a + b, 0), 0)} tổng ca`
    );

    const generatedSchedule = [];
    const assignmentDetails = {};
    const employeeAssignmentCount = { ...currentShiftCounts };
    const employeeGeneratedCount = employees.reduce((counts, employee) => {
      counts[employee.employee_id] = 0;
      return counts;
    }, {});
    const employeeGeneratedWorkdays = {};
    const employeeGeneratedWorkdayCount = employees.reduce((counts, employee) => {
      employeeGeneratedWorkdays[employee.employee_id] = new Set();
      counts[employee.employee_id] = 0;
      return counts;
    }, {});

    // Get constraints
    const {
      max_shifts_per_week,
      max_shifts_per_month
    } = constraints || {};

    // Pass 1: Role-based assignments
    console.log("[generateSchedule] 📍 Pass 1: Gán theo vai trò");
    for (const [dateStr, shiftRequirements] of getSortedRequirementEntries(requirementsByDateShift)) {
      for (const [shiftId, requiredCount] of getSortedShiftRequirementEntries(shiftRequirements, shiftDetails)) {
        const shiftIdNum = Number(shiftId);
        const shiftDetail = shiftDetails.find((s) => s.shift_id === shiftIdNum);

        if (!shiftDetail) continue;

        const requirements = prioritizeRoleRequirements(
          getRoleRequirementsForDate(shiftRoleRequirements[shiftIdNum] || [], dateStr),
          requiredCount
        );
        const roleAssignmentDetails = [];
        let assigned = 0;

        // If shift has role requirements, try to assign employees with those roles
        if (requirements.length > 0) {
          for (const req of requirements) {
            const roleCandidates = employees.filter((emp) => {
              const roles = employeeRoles[emp.employee_id] || [];
              return roles.some((r) => r.role_id === req.role_id);
            });

            const sortedRoleCandidates = sortCandidatesForSettings({
              candidates: roleCandidates,
              dateStr,
              shiftId: shiftIdNum,
              generatedSchedule,
              employeeAssignmentCount,
              employeeGeneratedCount,
              employeeGeneratedWorkdayCount,
              shiftDetails,
              settings: schedulingSettings
            });

            let roleAssigned = generatedSchedule.filter(
              (s) =>
                s.work_date === dateStr &&
                s.shift_id === shiftIdNum &&
                s.role_id === req.role_id
            ).length;

            for (const emp of sortedRoleCandidates) {
              if (
                assigned >= requiredCount ||
                roleAssigned >= req.effective_required_count
              ) break;

              const canAssignRes = canAssign({
                empId: emp.employee_id,
                shift_id: shiftIdNum,
                workDate: dateStr,
                generatedSchedule,
                publishedScheduleSet,
                existingAssignments,
                employeeAvailability,
                employeesWithData,
                employeeAssignmentCount,
                shiftDetails: allShiftDetails,
                max_shifts_per_week,
                max_shifts_per_month
              });

              if (!canAssignRes.can) {
                continue;
              }

              addAssignment(
                generatedSchedule,
                emp.employee_id,
                shiftIdNum,
                dateStr,
                req.role_id || null,
                employeeAssignmentCount,
                employeeGeneratedCount,
                employeeGeneratedWorkdays,
                employeeGeneratedWorkdayCount
              );
              assigned++;
              roleAssigned++;
            }

            roleAssignmentDetails.push({
              role_id: req.role_id,
              role_name: req.role_name,
              required: req.effective_required_count,
              requested: req.required_count,
              priority: req.priority,
              assigned: roleAssigned,
              shortfall: Math.max(0, req.effective_required_count - roleAssigned)
            });
          }
        }

        assignmentDetails[`${dateStr}_${shiftIdNum}`] = {
          required: requiredCount,
          assigned: assigned,
          role_requirements: roleAssignmentDetails,
          role_shortfall: roleAssignmentDetails.reduce(
            (sum, role) => sum + role.shortfall,
            0
          )
        };
      }
    }

    // Pass 2: Fill remaining slots with load balancing
    console.log("[generateSchedule] 📊 Pass 2: Cân bằng tải");
    
    // ✅ NEW: Initialize assignment cache for O(1) duplicate detection
    const assignmentCache = new Set(
      generatedSchedule.map(s => `${s.employee_id}_${s.shift_id}_${s.work_date}`)
    );
    
    for (const [dateStr, shiftRequirements] of getSortedRequirementEntries(requirementsByDateShift)) {
      for (const [shiftId, requiredCount] of getSortedShiftRequirementEntries(shiftRequirements, shiftDetails)) {
        const shiftIdNum = Number(shiftId);
        const assigned = (
          generatedSchedule.filter(
            (s) => s.work_date === dateStr && s.shift_id === shiftIdNum
          ) || []
        ).length;

        if (assigned >= requiredCount) continue;

        let toAssign = requiredCount - assigned;
        const requirements = prioritizeRoleRequirements(
          getRoleRequirementsForDate(shiftRoleRequirements[shiftIdNum] || [], dateStr),
          requiredCount
        );
        const roleTotal = requirements.reduce(
          (sum, req) => sum + req.effective_required_count,
          0
        );
        const generalSlots = Math.max(0, requiredCount - roleTotal);
        const generalAssigned = generatedSchedule.filter(
          (s) =>
            s.work_date === dateStr &&
            s.shift_id === shiftIdNum &&
            !s.role_id
        ).length;

        if (requirements.length > 0 && !schedulingSettings.allow_role_fallback) {
          toAssign = Math.max(0, generalSlots - generalAssigned);
        }
        
        const sortedEmployees = sortCandidatesForSettings({
          candidates: employees,
          dateStr,
          shiftId: shiftIdNum,
          generatedSchedule,
          employeeAssignmentCount,
          employeeGeneratedCount,
          employeeGeneratedWorkdayCount,
          shiftDetails,
          settings: schedulingSettings
        });

        for (const emp of sortedEmployees) {
          if (toAssign <= 0) break;

          const cacheKey = `${emp.employee_id}_${shiftIdNum}_${dateStr}`;
          
          // ✅ O(1) lookup instead of array search
          if (assignmentCache.has(cacheKey)) {
            continue;
          }

          const canAssignRes = canAssign({
            empId: emp.employee_id,
            shift_id: shiftIdNum,
            workDate: dateStr,
            generatedSchedule,
            publishedScheduleSet,
            existingAssignments,
            employeeAvailability,
            employeesWithData,
            employeeAssignmentCount,
            shiftDetails: allShiftDetails,
            max_shifts_per_week,
            max_shifts_per_month
          });

          if (!canAssignRes.can) {
            continue;
          }

          addAssignment(
            generatedSchedule,
            emp.employee_id,
            shiftIdNum,
            dateStr,
            null,
            employeeAssignmentCount,
            employeeGeneratedCount,
            employeeGeneratedWorkdays,
            employeeGeneratedWorkdayCount
          );
          
          assignmentCache.add(cacheKey);  // ✅ Update cache
          toAssign--;
        }

        // Update assignment details
        const actualAssigned = (
          generatedSchedule.filter(
            (s) => s.work_date === dateStr && s.shift_id === shiftIdNum
          ) || []
        ).length;

        const existingDetails = assignmentDetails[`${dateStr}_${shiftIdNum}`] || {};
        const roleShortfall = existingDetails.role_shortfall || 0;

        assignmentDetails[`${dateStr}_${shiftIdNum}`] = {
          required: requiredCount,
          assigned: actualAssigned,
          shortfall: Math.max(0, requiredCount - actualAssigned),
          role_requirements: existingDetails.role_requirements || [],
          role_shortfall: roleShortfall
        };
      }
    }

    console.log(
      `[generateSchedule] ✅ Tạo thành công: ${generatedSchedule.length} ca từ ${Object.keys(requirementsByDateShift).length} ngày`
    );

    // ===== STEP 6: ENRICH AND RETURN =====
    const enrichedShifts = generatedSchedule.map((shift) => {
      const employee = employees.find((e) => e.employee_id === shift.employee_id);
      const shiftDetail = shiftDetails.find((s) => s.shift_id === shift.shift_id);
      const roleDetail = (shiftRoleRequirements[shift.shift_id] || []).find(
        (role) => role.role_id === shift.role_id
      );
      return {
        ...shift,
        employee_name: employee?.name || "Unknown",
        role_name: roleDetail?.role_name || null,
        shift_name: shiftDetail?.shift_name || "Unknown",
        start_time: shiftDetail?.start_time || "00:00:00",
        end_time: shiftDetail?.end_time || "00:00:00"
      };
    });

    // Calculate statistics
    const stats = {
      total_shifts: generatedSchedule.length,
      unique_employees: new Set(generatedSchedule.map((s) => s.employee_id))
        .size,
      work_dates: Object.keys(requirementsByDateShift).length,
      unfulfilled: Object.values(assignmentDetails).reduce(
        (sum, d) => sum + (d.shortfall || 0),
        0
      ),
      role_unfulfilled: Object.values(assignmentDetails).reduce(
        (sum, d) => sum + (d.role_shortfall || 0),
        0
      ),
      fulfillment_rate: enrichedShifts.length > 0
        ? ((enrichedShifts.length /
            Object.values(assignmentDetails).reduce(
              (sum, d) => sum + d.required,
              0
            )) *
            100)
            .toFixed(1)
        : 0
    };

    console.log(
      `[generateSchedule] 📊 Thống kê: ${stats.total_shifts} ca, ${stats.unique_employees} nhân viên, tỷ lệ đáp ứng: ${stats.fulfillment_rate}%`
    );

    return {
      month,
      year,
      generated_shifts: enrichedShifts,
      stats,
      assignment_details: assignmentDetails,
      scheduling_settings: schedulingSettings,
      employee_generated_counts: employeeGeneratedCount,
      employee_generated_workday_counts: employeeGeneratedWorkdayCount
    };
  } catch (error) {
    console.error("[generateSchedule] ❌ Lỗi:", error.message);
    throw error;
  }
}

async function getExistingAssignments(month, year) {
  const [rows] = await database.query(
    `SELECT s.employee_id,
            s.shift_id,
            s.role_id,
            s.status,
            DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
            sh.start_time,
            sh.end_time
       FROM schedules s
       JOIN shifts sh ON sh.shift_id = s.shift_id
      WHERE s.status IN ('DRAFT', 'PUBLISHED')
        AND MONTH(s.work_date) = ?
        AND YEAR(s.work_date) = ?`,
    [month, year]
  );

  return rows.map((row) => ({
    ...row,
    employee_id: Number(row.employee_id),
    shift_id: Number(row.shift_id),
    role_id: row.role_id ? Number(row.role_id) : null,
  }));
}

function normalizeDbBoolean(value) {
  if (Buffer.isBuffer(value)) {
    return value.length > 0 && value[0] === 1;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true";
  }

  return false;
}

function normalizeScheduleSettings(settings = {}) {
  return {
    balance_scheduling: normalizeDbBoolean(settings.balance_scheduling),
    prefer_consecutive_shifts: normalizeDbBoolean(
      settings.prefer_consecutive_shifts
    ),
    balance_by_workday: normalizeDbBoolean(settings.balance_by_workday),
    allow_role_fallback: normalizeDbBoolean(settings.allow_role_fallback),
    productivity_attention: normalizeDbBoolean(settings.productivity_attention)
  };
}

function getSortedRequirementEntries(requirementsByDateShift) {
  return Object.entries(requirementsByDateShift).sort(([dateA], [dateB]) =>
    dateA.localeCompare(dateB)
  );
}

function getSortedShiftRequirementEntries(shiftRequirements, shiftDetails) {
  return Object.entries(shiftRequirements).sort(([shiftA], [shiftB]) => {
    const shiftDetailA = shiftDetails.find(
      (shift) => shift.shift_id === Number(shiftA)
    );
    const shiftDetailB = shiftDetails.find(
      (shift) => shift.shift_id === Number(shiftB)
    );

    return (
      getShiftStartMinutes(shiftDetailA) - getShiftStartMinutes(shiftDetailB) ||
      Number(shiftA) - Number(shiftB)
    );
  });
}

function getShiftStartMinutes(shift) {
  if (!shift?.start_time) return Number.MAX_SAFE_INTEGER;
  const [hours = 0, minutes = 0] = String(shift.start_time)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

function getShiftOrderIndex(shiftId, shiftDetails) {
  const sortedShiftIds = [...shiftDetails]
    .sort(
      (a, b) =>
        getShiftStartMinutes(a) - getShiftStartMinutes(b) ||
        Number(a.shift_id) - Number(b.shift_id)
    )
    .map((shift) => Number(shift.shift_id));

  return sortedShiftIds.indexOf(Number(shiftId));
}

function shiftDateTime(dateStr, timeValue) {
  const [hours = 0, minutes = 0, seconds = 0] = String(timeValue || "00:00:00")
    .split(":")
    .map(Number);
  const date = new Date(`${dateStr}T00:00:00`);
  date.setHours(hours, minutes, seconds, 0);
  return date;
}

function getShiftBoundsForAssignment(assignment, shiftDetails) {
  const shift = shiftDetails.find(
    (item) => Number(item.shift_id) === Number(assignment.shift_id)
  );
  if (!shift) return null;

  const start = shiftDateTime(assignment.work_date, shift.start_time);
  const end = shiftDateTime(assignment.work_date, shift.end_time);
  if (end <= start) {
    end.setDate(end.getDate() + 1);
  }

  return { start, end };
}

function getConsecutiveShiftCountIfAssigned({
  empId,
  dateStr,
  shiftId,
  generatedSchedule,
  shiftDetails
}) {
  const candidate = {
    employee_id: Number(empId),
    shift_id: Number(shiftId),
    work_date: dateStr,
    isCandidate: true
  };
  const assignments = [
    ...generatedSchedule.filter((item) => Number(item.employee_id) === Number(empId)),
    candidate
  ]
    .map((item) => ({
      ...item,
      bounds: getShiftBoundsForAssignment(item, shiftDetails)
    }))
    .filter((item) => item.bounds)
    .sort((a, b) => a.bounds.start - b.bounds.start);

  const toleranceMs = 15 * 60 * 1000;
  const candidateIndex = assignments.findIndex((item) => item.isCandidate);
  if (candidateIndex < 0) return 1;

  let consecutiveCount = 1;

  for (let index = candidateIndex - 1; index >= 0; index -= 1) {
    const previous = assignments[index];
    const current = assignments[index + 1];
    const gap = current.bounds.start.getTime() - previous.bounds.end.getTime();
    if (gap < 0 || gap > toleranceMs) break;
    consecutiveCount += 1;
  }

  for (let index = candidateIndex + 1; index < assignments.length; index += 1) {
    const previous = assignments[index - 1];
    const current = assignments[index];
    const gap = current.bounds.start.getTime() - previous.bounds.end.getTime();
    if (gap < 0 || gap > toleranceMs) break;
    consecutiveCount += 1;
  }

  return consecutiveCount;
}

function getProductivityFatigueRank({
  empId,
  dateStr,
  shiftId,
  generatedSchedule,
  shiftDetails
}) {
  const consecutiveCount = getConsecutiveShiftCountIfAssigned({
    empId,
    dateStr,
    shiftId,
    generatedSchedule,
    shiftDetails
  });

  return consecutiveCount >= 3 ? 1 : 0;
}

function getConsecutivePreferenceRank({
  empId,
  dateStr,
  shiftId,
  generatedSchedule,
  shiftDetails
}) {
  const sameDayAssignments = generatedSchedule.filter(
    (item) => item.employee_id === empId && item.work_date === dateStr
  );

  if (sameDayAssignments.length === 0) {
    return 1;
  }

  const newShiftIndex = getShiftOrderIndex(shiftId, shiftDetails);
  const hasAdjacentShift = sameDayAssignments.some((item) => {
    const assignedShiftIndex = getShiftOrderIndex(item.shift_id, shiftDetails);
    return (
      newShiftIndex >= 0 &&
      assignedShiftIndex >= 0 &&
      Math.abs(newShiftIndex - assignedShiftIndex) === 1
    );
  });

  return hasAdjacentShift ? 0 : 2;
}

function sortCandidatesForSettings({
  candidates,
  dateStr,
  shiftId,
  generatedSchedule,
  employeeAssignmentCount,
  employeeGeneratedCount,
  employeeGeneratedWorkdayCount,
  shiftDetails,
  settings
}) {
  return [...candidates].sort((a, b) => {
    if (settings.productivity_attention) {
      const productivityDiff =
        getProductivityFatigueRank({
          empId: a.employee_id,
          dateStr,
          shiftId,
          generatedSchedule,
          shiftDetails
        }) -
        getProductivityFatigueRank({
          empId: b.employee_id,
          dateStr,
          shiftId,
          generatedSchedule,
          shiftDetails
        });

      if (productivityDiff !== 0) return productivityDiff;
    }

    if (settings.balance_by_workday) {
      const workdayDiff =
        (employeeGeneratedWorkdayCount[a.employee_id] || 0) -
        (employeeGeneratedWorkdayCount[b.employee_id] || 0);

      if (workdayDiff !== 0) return workdayDiff;
    }

    if (
      settings.balance_scheduling ||
      settings.balance_by_workday ||
      settings.prefer_consecutive_shifts
    ) {
      const balanceDiff =
        (employeeGeneratedCount[a.employee_id] || 0) -
        (employeeGeneratedCount[b.employee_id] || 0);

      if (balanceDiff !== 0) return balanceDiff;
    }

    if (settings.prefer_consecutive_shifts) {
      const consecutiveDiff =
        getConsecutivePreferenceRank({
          empId: a.employee_id,
          dateStr,
          shiftId,
          generatedSchedule,
          shiftDetails
        }) -
        getConsecutivePreferenceRank({
          empId: b.employee_id,
          dateStr,
          shiftId,
          generatedSchedule,
          shiftDetails
        });

      if (consecutiveDiff !== 0) return consecutiveDiff;
    }

    if (settings.balance_scheduling) {
      const existingLoadDiff =
        (employeeAssignmentCount[a.employee_id] || 0) -
        (employeeAssignmentCount[b.employee_id] || 0);

      if (existingLoadDiff !== 0) return existingLoadDiff;
    }

    return Number(a.employee_id) - Number(b.employee_id);
  });
}

function normalizeRoleRequirements(override, savedRequirements) {
  const source = override && typeof override === "object" ? override : null;
  const rows = source
    ? Object.entries(source).map(([roleId, requirement]) => ({
        role_id: Number(roleId),
        role_name: requirement?.role_name,
        color: requirement?.color,
        priority: requirement?.priority,
        day_of_week: requirement?.day_of_week,
        required_count: Math.max(
          0,
          Number(requirement?.required_count ?? requirement) || 0
        ),
      }))
    : savedRequirements || [];

  const byRole = new Map();
  rows.forEach((row) => {
    const roleId = Number(row.role_id);
    const requiredCount = Math.max(0, Number(row.required_count) || 0);

    if (roleId <= 0 || requiredCount <= 0) {
      return;
    }

    const existing = byRole.get(roleId);
    byRole.set(roleId, {
      role_id: roleId,
      role_name: row.role_name || existing?.role_name,
      color: row.color || existing?.color,
      day_of_week: row.day_of_week ?? existing?.day_of_week ?? 0,
      priority: Math.max(
        1,
        Number(row.priority ?? existing?.priority ?? byRole.size + 1) || 1
      ),
      required_count: Math.max(requiredCount, existing?.required_count || 0),
    });
  });

  return Array.from(byRole.values());
}

function getRoleRequirementsForDate(requirements, dateStr) {
  // 0/null means every day; 1..7 follows Sunday..Saturday.
  const weekday = new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 1;
  return requirements.filter((requirement) => {
    const configuredDay = Number(requirement.day_of_week || 0);
    return configuredDay === 0 || configuredDay === weekday;
  });
}

function prioritizeRoleRequirements(requirements, totalRequired) {
  let remaining = Math.max(0, Number(totalRequired) || 0);

  return [...requirements]
    .sort(
      (a, b) =>
        Number(a.priority || 1) - Number(b.priority || 1) ||
        Number(a.role_id) - Number(b.role_id)
    )
    .map((requirement) => {
      const requested = Math.max(0, Number(requirement.required_count) || 0);
      const effective = Math.min(requested, remaining);
      remaining -= effective;

      return {
        ...requirement,
        effective_required_count: effective,
      };
    });
}

function normalizeDateKey(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }

  if (typeof value === "string") {
    const match = value.match(/^\d{4}-\d{2}-\d{2}/);
    if (match) return match[0];
  }

  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return date.toISOString().slice(0, 10);
  }

  return null;
}

async function prepareAvailability(month, year, frontendAvailability) {
  const employeeAvailability = {};
  const employeesWithData = new Set();
  let dataSource = "none";

  // Availability stored in the database is the only scheduling authority.
  // Client payloads can be stale or manipulated and must not make an employee eligible.
  const hasFrontendData = false;
  if (frontendAvailability && typeof frontendAvailability === "object") {
    console.warn("[prepareAvailability] Ignoring client-provided availability");
  }

  const addAvailabilityRecord = (employeeId, workDate, shiftId) => {
    const empId = Number(employeeId);
    const normalizedDate = normalizeDateKey(workDate);
    const numShiftId = Number(shiftId);

    if (
      Number.isNaN(empId) ||
      empId <= 0 ||
      !normalizedDate ||
      Number.isNaN(numShiftId) ||
      numShiftId <= 0
    ) {
      return false;
    }

    if (!employeeAvailability[empId]) {
      employeeAvailability[empId] = {};
    }

    if (!employeeAvailability[empId][normalizedDate]) {
      employeeAvailability[empId][normalizedDate] = new Set();
    }

    employeeAvailability[empId][normalizedDate].add(numShiftId);
    employeesWithData.add(empId);
    return true;
  };

  const availability = await getEmployeeAvailability(month, year);
  console.log(`[prepareAvailability] Found ${availability.length} database availability records`);

  availability.forEach((record) => {
    addAvailabilityRecord(record.employee_id, record.work_date, record.shift_id);
  });

  if (hasFrontendData) {
    dataSource = availability.length > 0 ? "database+frontend" : "frontend";
    console.log(`[prepareAvailability] 📥 Merging frontend data: ${Object.keys(frontendAvailability).length} employees`);

    Object.entries(frontendAvailability).forEach(([employeeIdStr, dateShifts]) => {
      const empId = Number(employeeIdStr);

      if (Number.isNaN(empId) || empId <= 0) {
        console.warn(`[prepareAvailability] ⚠️ Invalid employee ID: ${employeeIdStr}`);
        return;
      }

      // ✅ Mark employee as having submitted availability (even if empty)
      employeesWithData.add(empId);

      if (!dateShifts || typeof dateShifts !== "object" || Object.keys(dateShifts).length === 0) {
        console.log(`[prepareAvailability] ℹ️ Employee ${empId}: submitted but no available dates`);
        return;
      }

      if (!employeeAvailability[empId]) {
        employeeAvailability[empId] = {};
      }

      Object.entries(dateShifts).forEach(([workDate, shiftIds]) => {
        if (!normalizeDateKey(workDate)) {
          console.warn(`[prepareAvailability] ⚠️ Invalid date: ${workDate}`);
          return;
        }

        const shifts = Array.isArray(shiftIds) ? shiftIds : [shiftIds];
        shifts.forEach((shiftId) => {
          addAvailabilityRecord(empId, workDate, shiftId);
        });
      });
    });

    console.log(`[prepareAvailability] ✅ Merged: ${employeesWithData.size} employees with data`);
  } else {
    dataSource = "database";
    console.log(`[prepareAvailability] ✅ Database: ${employeesWithData.size} employees with availability`);
  }

  return {
    employeeAvailability,
    employeesWithData,
    dataSource,
    stats: {
      totalEmployeesWithData: employeesWithData.size,
      totalRecords: Object.values(employeeAvailability).reduce(
        (sum, empDates) => sum + Object.keys(empDates).length,
        0
      )
    }
  };
}

/**
 * Helper: Check if two shifts overlap in time
 */
function doShiftsOverlap(shift1, shift2) {
  const start1 = shift1.start_time; // "HH:MM:SS"
  const end1 = shift1.end_time;
  const start2 = shift2.start_time;
  const end2 = shift2.end_time;

  // Simple string comparison works for HH:MM:SS format
  // Shifts overlap if: start1 < end2 AND start2 < end1
  return start1 < end2 && start2 < end1;
}

/**
 * Helper: Check if an employee can be assigned to a shift
 * 
 * ✅ CRITICAL FIX: 
 * - Employees WITHOUT availability data are REJECTED
 * - Uses publishedScheduleSet to prevent duplicate assignments
 * - Optimized with Set for O(1) lookups
 */
function canAssign({
  empId,
  shift_id,
  workDate,
  generatedSchedule,
  publishedScheduleSet,
  existingAssignments,
  employeeAvailability,
  employeesWithData,
  employeeAssignmentCount,
  shiftDetails,
  max_shifts_per_week,
  max_shifts_per_month
}) {
  // ✅ FIX: Normalize empId to number (might be string from Object.entries)
  empId = Number(empId);
  shift_id = Number(shift_id);

  // ===== CHECK 1: Published shift duplicate =====
  const assignmentKey = `${empId}_${shift_id}_${workDate}`;
  if (publishedScheduleSet && publishedScheduleSet.has(assignmentKey)) {
    return { can: false, reason: "Already has published shift for this date/shift" };
  }

  // ===== CHECK 2: Already assigned in this generation =====
  if (
    generatedSchedule.some(
      (s) =>
        s.employee_id === empId &&
        s.shift_id === shift_id &&
        s.work_date === workDate
    )
  ) {
    return { can: false, reason: "Đã được gán ca này" };
  }

  // ===== CHECK 3: CRITICAL FIX - Availability check =====
  // 🚨 THIS IS THE KEY FIX:
  // Only allow assignment if employee is in employeesWithData Set
  // If employee has NO availability data, REJECT
  if (!employeesWithData.has(empId)) {
    return { can: false, reason: "Employee has not confirmed availability" };
  }

  // Employee has availability data - now check specific date/shift
  const empAvailability = employeeAvailability[empId];
  if (!empAvailability || !empAvailability[workDate]) {
    return { can: false, reason: "Không có sẵn" };
  }

  if (!empAvailability[workDate].has(shift_id)) {
    return { can: false, reason: "Không có sẵn cho ca này" };
  }

  const candidate = { employee_id: empId, shift_id, work_date: workDate };
  const candidateBounds = getShiftBoundsForAssignment(candidate, shiftDetails);
  const occupiedAssignments = [...generatedSchedule, ...(existingAssignments || [])];
  const conflictingAssignment = occupiedAssignments.find((assignment) => {
    if (Number(assignment.employee_id) !== empId) return false;
    const assignmentBounds = getShiftBoundsForAssignment(assignment, shiftDetails);
    return candidateBounds && assignmentBounds &&
      candidateBounds.start < assignmentBounds.end &&
      assignmentBounds.start < candidateBounds.end;
  });

  if (conflictingAssignment) {
    return { can: false, reason: "Shift time conflicts with an existing assignment" };
  }

  // ===== CHECK 4: Overlapping shifts on the same date =====
  if (shiftDetails && shiftDetails.length > 0) {
    const newShift = shiftDetails.find((s) => s.shift_id === shift_id);
    const conflictingShift = generatedSchedule.find((s) => {
      if (s.employee_id !== empId || s.work_date !== workDate) {
        return false;
      }
      const existingShift = shiftDetails.find((sd) => sd.shift_id === s.shift_id);
      return existingShift && newShift && doShiftsOverlap(newShift, existingShift);
    });

    if (conflictingShift) {
      return { can: false, reason: "Xung đột giờ ca trên cùng ngày" };
    }
  }

  // ===== CHECK 5: Max per month check =====
  const monthlyLimit = Number(max_shifts_per_month);
  if (
    Number.isFinite(monthlyLimit) &&
    monthlyLimit > 0 &&
    (employeeAssignmentCount[empId] || 0) >= monthlyLimit
  ) {
    return {
      can: false,
      reason: `Đạt giới hạn ca/tháng (${monthlyLimit})`
    };
  }

  // ===== CHECK 6: Max per week check =====
  const weeklyLimit = Number(max_shifts_per_week);
  if (Number.isFinite(weeklyLimit) && weeklyLimit > 0) {
    const workDateObj = new Date(`${workDate}T00:00:00Z`);
    const shiftsThisWeek = [...generatedSchedule, ...(existingAssignments || [])].filter((s) => {
      return (
        Number(s.employee_id) === empId &&
        isInSameWeek(new Date(`${s.work_date}T00:00:00Z`), workDateObj)
      );
    }).length;

    if (shiftsThisWeek + 1 > weeklyLimit) {
      return {
        can: false,
        reason: `Vượt giới hạn ca/tuần (${weeklyLimit})`
      };
    }
  }

  return { can: true, reason: "OK" };
}

/**
 * Helper: Add assignment to schedule
 */
function addAssignment(
  generatedSchedule,
  employeeId,
  shiftId,
  workDate,
  roleId,
  employeeAssignmentCount,
  employeeGeneratedCount,
  employeeGeneratedWorkdays,
  employeeGeneratedWorkdayCount
) {
  generatedSchedule.push({
    employee_id: employeeId,
    shift_id: shiftId,
    work_date: workDate,
    role_id: roleId || null,
    status: "DRAFT"
  });

  employeeAssignmentCount[employeeId] = (employeeAssignmentCount[employeeId] || 0) + 1;
  if (employeeGeneratedCount) {
    employeeGeneratedCount[employeeId] = (employeeGeneratedCount[employeeId] || 0) + 1;
  }
  if (employeeGeneratedWorkdays && employeeGeneratedWorkdayCount) {
    if (!employeeGeneratedWorkdays[employeeId]) {
      employeeGeneratedWorkdays[employeeId] = new Set();
    }
    employeeGeneratedWorkdays[employeeId].add(workDate);
    employeeGeneratedWorkdayCount[employeeId] =
      employeeGeneratedWorkdays[employeeId].size;
  }
}

/**
 * Helper: Check if two dates are in the same week
 */
function isInSameWeek(date1, date2) {
  const mondayKey = (date) => {
    const value = new Date(date);
    value.setUTCHours(0, 0, 0, 0);
    const offset = (value.getUTCDay() + 6) % 7;
    value.setUTCDate(value.getUTCDate() - offset);
    return value.toISOString().slice(0, 10);
  };

  return mondayKey(date1) === mondayKey(date2);
}

// ===== REST OF FUNCTIONS UNCHANGED =====

export async function saveDraftSchedule({ month, year, shifts }) {
  console.log(`[saveDraftSchedule] Lưu ${shifts.length} ca`);

  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    for (const shift of shifts) {
      const { employee_id, shift_id, work_date, role_id, status = "DRAFT" } =
        shift;

      await connection.query(
        `INSERT INTO schedules (employee_id, shift_id, work_date, role_id, status)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status), role_id = VALUES(role_id)`,
        [employee_id, shift_id, work_date, role_id || null, status]
      );
    }

    await connection.commit();
    console.log("[saveDraftSchedule] ✓ Lưu thành công");

    return {
      message: "Bản nháp đã được lưu",
      count: shifts.length,
      status: "DRAFT"
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function publishScheduleService({ month, year, shifts, schedule_id }) {
  console.log(
    "[publishScheduleService] Công bố",
    shifts?.length || "tất cả",
    "ca"
  );

  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    if (shifts && shifts.length > 0) {
      for (const shift of shifts) {
        const { employee_id, shift_id, work_date, role_id = null } = shift;

        if (!/^\d{4}-\d{2}-\d{2}$/.test(work_date)) {
          console.warn("[publishScheduleService] Định dạng ngày không hợp lệ:", work_date);
        }

        await connection.query(
          `INSERT INTO schedules (employee_id, shift_id, work_date, role_id, status)
           VALUES (?, ?, ?, ?, 'PUBLISHED')
           ON DUPLICATE KEY UPDATE status = 'PUBLISHED', role_id = VALUES(role_id)`,
          [employee_id, shift_id, work_date, role_id]
        );
      }
      console.log("[publishScheduleService] ✓ Công bố", shifts.length, "ca");
    } else if (schedule_id) {
      throw new Error("Publishing requires an explicit list of schedule assignments");
    }

    await connection.commit();
    console.log("[publishScheduleService] ✓ Công bố thành công");

    return {
      message: "Lịch đã được công bố",
      status: "PUBLISHED"
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function getSchedulesForEmployee(employeeId, month, year) {
  const query = `
    SELECT 
      s.schedule_id,
      s.employee_id,
      e.name as employee_name,
      s.shift_id,
      sh.shift_name,
      TIME_FORMAT(sh.start_time, '%H:%i:%s') as start_time,
      TIME_FORMAT(sh.end_time, '%H:%i:%s') as end_time,
      DATE_FORMAT(s.work_date, '%Y-%m-%d') as work_date,
      s.status
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.employee_id
    LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
    WHERE s.employee_id = ? 
      AND MONTH(s.work_date) = ?
      AND YEAR(s.work_date) = ?
    ORDER BY s.work_date ASC
  `;

  const [schedules] = await database.query(query, [employeeId, month, year]);
  return schedules;
}

export async function getSchedulesForMonth(month, year) {
  const query = `
    SELECT 
      s.schedule_id,
      s.employee_id,
      e.name as employee_name,
      s.shift_id,
      sh.shift_name,
      TIME_FORMAT(sh.start_time, '%H:%i:%s') as start_time,
      TIME_FORMAT(sh.end_time, '%H:%i:%s') as end_time,
      DATE_FORMAT(s.work_date, '%Y-%m-%d') as work_date,
      s.status
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.employee_id
    LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
    WHERE YEAR(s.work_date) = ?
      AND MONTH(s.work_date) = ?
    ORDER BY s.work_date ASC, sh.start_time ASC
  `;

  const [schedules] = await database.query(query, [year, month]);
  return schedules;
}

export async function getDraftSchedules() {
  const query = `
    SELECT 
      s.schedule_id,
      s.employee_id,
      e.name as employee_name,
      s.shift_id,
      sh.shift_name,
      s.work_date,
      s.status
    FROM schedules s
    JOIN employees e ON s.employee_id = e.employee_id
    JOIN shifts sh ON s.shift_id = sh.shift_id
    WHERE s.status = 'DRAFT'
    ORDER BY s.work_date DESC
    LIMIT 100
  `;

  const [drafts] = await database.query(query);
  return drafts;
}

export async function deleteDraftSchedule(scheduleId) {
  const query = `
    DELETE FROM schedules 
    WHERE schedule_id = ? AND status = 'DRAFT'
  `;

  await database.query(query, [scheduleId]);
}
