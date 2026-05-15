import database from "../config/db.js";
import { getShiftsByIds, getEmployeeAvailability } from "../models/schedule.model.js";

export async function generateSchedule({ month, year, shifts, constraints, detailed_requirements, availability: frontendAvailability }) {

  console.log("[generateSchedule] ====== SCHEDULE GENERATION START ======");
  console.log("[generateSchedule] Input params:", { 
    month, 
    year, 
    shiftsCount: shifts?.length,
    shiftsData: shifts,
    constraintsKeys: Object.keys(constraints || {}),
    frontendAvailabilityEmployees: frontendAvailability ? Object.keys(frontendAvailability).length : 0,
    frontendAvailabilityData: frontendAvailability ? JSON.stringify(frontendAvailability).slice(0, 500) : 'none'
  });

  if (!shifts || shifts.length === 0) {
    throw new Error("No shifts provided for schedule generation");
  }

  if (!month || !year) {
    throw new Error("Month and year are required");
  }

  const normalizedShifts = (shifts || []).map(s => ({
    shift_id: Number(s.shift_id),
    required_employees: Math.max(1, Number(s.required_employees) || 1)
  }));

  console.log("[generateSchedule] Normalized shifts:", normalizedShifts);

  const shiftDetails = await getShiftsByIds(normalizedShifts.map((s) => s.shift_id));
  console.log("[generateSchedule] Got", shiftDetails.length, "shift details from DB");
  
  if (shiftDetails.length === 0) {
    console.error("[generateSchedule] NO SHIFT DETAILS FOUND");
    console.error("[generateSchedule] Requested shift IDs:", normalizedShifts.map(s => s.shift_id));
    console.error("[generateSchedule] Shift IDs types:", normalizedShifts.map(s => `${s.shift_id}(${typeof s.shift_id})`));
    throw new Error(`Không tìm thấy ca trên hệ thống. IDs yêu cầu: ${normalizedShifts.map(s => s.shift_id).join(", ")}`);
  }

  const [employees] = await database.query(
    "SELECT e.employee_id, e.user_id, e.name FROM employees e"
  );
  console.log("[generateSchedule] Found", employees.length, "active employees");
  
  if (employees.length === 0) {
    throw new Error("Không có nhân viên nào để xếp lịch");
  }

  let availability = [];
  let employeeAvailability = {};
  let hasAvailabilityData = false;

  // Use frontend availability if provided, otherwise fetch from database
  if (frontendAvailability && Object.keys(frontendAvailability).length > 0) {
    console.log("[generateSchedule] Using availability data from frontend");
    
    // Convert frontend format to internal format
    Object.entries(frontendAvailability).forEach(([employeeId, dateShifts]) => {
      Object.entries(dateShifts).forEach(([workDate, shiftIds]) => {
        const empId = Number(employeeId);
        
        if (!employeeAvailability[empId]) {
          employeeAvailability[empId] = {};
        }
        
        if (!employeeAvailability[empId][workDate]) {
          employeeAvailability[empId][workDate] = new Set();
        }
        
        // Handle both array and non-array values
        if (Array.isArray(shiftIds)) {
          shiftIds.forEach(sid => {
            employeeAvailability[empId][workDate].add(Number(sid));
          });
        } else {
          employeeAvailability[empId][workDate].add(Number(shiftIds));
        }
      });
    });
    
    hasAvailabilityData = true;
    console.log("[generateSchedule] Converted frontend availability:", Object.keys(employeeAvailability).length, "employees");
  } else {
    // Fallback to database availability
    availability = await getEmployeeAvailability(month, year);
    console.log("[generateSchedule] Got availability for", availability.length, "records from database");
    
    if (availability.length > 0) {
      availability.forEach(record => {
        const { employee_id, shift_id, work_date } = record;

        if (!employeeAvailability[employee_id]) {
          employeeAvailability[employee_id] = {};
        }

        if (!employeeAvailability[employee_id][work_date]) {
          employeeAvailability[employee_id][work_date] = new Set();
        }

        employeeAvailability[employee_id][work_date].add(shift_id);
      });
      hasAvailabilityData = true;
      console.log("[generateSchedule] Using submitted availability data from database");
    } else {
      console.log("[generateSchedule] ℹ️ No availability data - assuming all employees available");
    }
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const workDates = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateObj = new Date(year, month - 1, day);
    if (dateObj.getDay() !== 0 && dateObj.getDay() !== 6) {
      const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      workDates.push(dateStr);
    }
  }
  console.log("[generateSchedule] Work days in month:", workDates.length);

  const employeeShiftCount = {};
  employees.forEach((emp) => {
    employeeShiftCount[emp.employee_id] = 0;
  });

  const generatedSchedule = [];
  const { 
    max_shifts_per_week = 6, 
    max_shifts_per_month = 25 
  } = constraints || {};

  console.log("[generateSchedule] Processing detailed requirements:", {
    datesInRequirements: Object.keys(detailed_requirements || {}).length,
    sampleDates: Object.keys(detailed_requirements || {}).slice(0, 3),
  });

  const requirementsByDateShift = {};
  if (detailed_requirements && typeof detailed_requirements === 'object') {
    Object.entries(detailed_requirements).forEach(([dateStr, dayConfig]) => {
      if (!dayConfig || typeof dayConfig !== 'object') {
        console.warn(`[generateSchedule] Invalid config for date ${dateStr}:`, dayConfig);
        return;
      }
      
      Object.entries(dayConfig).forEach(([shiftIdStr, count]) => {
        const shiftId = Number(shiftIdStr);
        const numCount = Number(count) || 0;
        
        if (numCount > 0) {
          if (!requirementsByDateShift[dateStr]) {
            requirementsByDateShift[dateStr] = {};
          }
          requirementsByDateShift[dateStr][shiftId] = numCount;
        }
      });
    });
  }

  console.log("[generateSchedule] Parsed requirements:", {
    datesWithRequirements: Object.keys(requirementsByDateShift).length,
    sampleRequirements: Object.entries(requirementsByDateShift)
      .slice(0, 2)
      .map(([date, shifts]) => ({ date, shifts })),
  });

  const assignmentsByDateShift = {};

  for (const [dateStr, shiftRequirements] of Object.entries(requirementsByDateShift)) {
    if (!assignmentsByDateShift[dateStr]) {
      assignmentsByDateShift[dateStr] = {};
    }

    const dateObj = new Date(dateStr + 'T00:00:00');
    
    for (const [shiftId, requiredCount] of Object.entries(shiftRequirements)) {
      const shiftIdNum = Number(shiftId);
      const shiftDetail = shiftDetails.find((s) => s.shift_id === shiftIdNum);

      if (!shiftDetail) {
        console.warn(`[generateSchedule] Shift ${shiftIdNum} not found in database for ${dateStr}`);
        continue;
      }

      if (!assignmentsByDateShift[dateStr][shiftIdNum]) {
        assignmentsByDateShift[dateStr][shiftIdNum] = [];
      }

      let assigned = 0;
      const sortedEmployees = [...employees].sort(
        (a, b) =>
          employeeShiftCount[a.employee_id] -
          employeeShiftCount[b.employee_id]
      );

      for (const emp of sortedEmployees) {
        if (assigned >= requiredCount) break;

        const empId = emp.employee_id;
        const canAssignResult = canAssign({
          empId,
          shift_id: shiftIdNum,
          workDate: dateStr,
          generatedSchedule,
          employeeAvailability,
          employeeShiftCount,
          max_shifts_per_week,
          max_shifts_per_month,
          hasAvailabilityData,
          employees
        });

        if (!canAssignResult.can) {
          console.log(`[generateSchedule] ❌ Date ${dateStr} Shift ${shiftIdNum} - Employee ${emp.name} (ID: ${empId}): ${canAssignResult.reason}`);
          continue;
        }

        const assignment = {
          employee_id: empId,
          shift_id: shiftIdNum,
          work_date: dateStr,
          status: "DRAFT"
        };

        generatedSchedule.push(assignment);
        assignmentsByDateShift[dateStr][shiftIdNum].push(empId);
        employeeShiftCount[empId]++;
        assigned++;
      }

      if (assigned < requiredCount) {
        console.warn(`[generateSchedule] Date ${dateStr} Shift ${shiftIdNum}: Only assigned ${assigned}/${requiredCount} employees`);
      } else {
        console.log(`[generateSchedule] Date ${dateStr} Shift ${shiftIdNum}: Assigned ${assigned}/${requiredCount}`);
      }
    }
  }

  console.log("[generateSchedule] Generated", generatedSchedule.length, "total shifts from", Object.keys(requirementsByDateShift).length, "dates with requirements");

  if (generatedSchedule.length === 0) {
    console.error("[generateSchedule] ❌ ZERO SHIFTS GENERATED");
    console.error("[generateSchedule] Employees:", employees.length);
    console.error("[generateSchedule] Shifts:", normalizedShifts);
    console.error("[generateSchedule] Dates with requirements:", Object.keys(requirementsByDateShift).length);
    console.error("[generateSchedule] Available shifts in DB:", shiftDetails.map(s => `${s.shift_id}:${s.shift_name}`).join(", "));
  }

  const enrichedShifts = generatedSchedule.map(shift => {
    const employee = employees.find(e => e.employee_id === shift.employee_id);
    const shiftDetail = shiftDetails.find(s => s.shift_id === shift.shift_id);
    return {
      ...shift,
      employee_name: employee?.name || "Unknown",
      shift_name: shiftDetail?.shift_name || "Unknown",
      start_time: shiftDetail?.start_time || "00:00:00",
      end_time: shiftDetail?.end_time || "00:00:00",
    };
  });

  return {
    month,
    year,
    generated_shifts: enrichedShifts,
    stats: {
      total_shifts: generatedSchedule.length,
      unique_employees: new Set(generatedSchedule.map((s) => s.employee_id)).size,
      work_dates: workDates.length,
    },
  };
}

export async function saveDraftSchedule({ month, year, shifts }) {
  console.log(`[saveDraftSchedule] Saving ${shifts.length} shifts`);

  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    // Insert each shift as DRAFT
    for (const shift of shifts) {
      const {
        employee_id,
        shift_id,
        work_date,
        status = "DRAFT",
      } = shift;

      await connection.query(
        `INSERT INTO schedules (employee_id, shift_id, work_date, status)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = VALUES(status)`,
        [employee_id, shift_id, work_date, status]
      );
    }

    await connection.commit();
    console.log("[saveDraftSchedule] Saved successfully");

    return {
      message: "Bản nháp đã được lưu",
      count: shifts.length,
      status: "DRAFT",
    };
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function publishScheduleService({ month, year, shifts, schedule_id }) {
  console.log("[publishScheduleService] Publishing", shifts?.length || "all", "shifts");
  console.log("[publishScheduleService] Month:", month, "Year:", year);
  
  if (shifts && shifts.length > 0) {
    console.log("[publishScheduleService] Sample shifts (first 3):");
    shifts.slice(0, 3).forEach(s => {
      console.log("[publishScheduleService]   -", s.work_date, s.shift_id, s.employee_id);
    });
  }

  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    if (shifts && shifts.length > 0) {
      // Insert or update specific shifts to PUBLISHED status
      for (const shift of shifts) {
        const {
          employee_id,
          shift_id,
          work_date,
        } = shift;

        // Verify date format
        if (!/^\d{4}-\d{2}-\d{2}$/.test(work_date)) {
          console.warn("[publishScheduleService] Invalid date format:", work_date);
        }

        // Insert if not exists, update status to PUBLISHED
        const [result] = await connection.query(
          `INSERT INTO schedules (employee_id, shift_id, work_date, status)
           VALUES (?, ?, ?, 'PUBLISHED')
           ON DUPLICATE KEY UPDATE status = 'PUBLISHED'`,
          [employee_id, shift_id, work_date]
        );
      }
      console.log("[publishScheduleService] Inserted", shifts.length, "shifts");
    } else if (schedule_id) {
      // Update all shifts in this draft (by schedule_id or by month/year)
      console.log("[publishScheduleService] Updating drafts for month:", month, "year:", year);
      const [result] = await connection.query(
        `UPDATE schedules 
         SET status = 'PUBLISHED'
         WHERE status = 'DRAFT' AND MONTH(work_date) = ? AND YEAR(work_date) = ?`,
        [month, year]
      );
      console.log("[publishScheduleService] Updated", result.changedRows, "draft records");
    }

    await connection.commit();
    console.log("[publishScheduleService] Published successfully");

    return {
      message: "Lịch đã được công bố",
      status: "PUBLISHED",
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

  console.log("[getSchedulesForMonth] Querying for year:", year, "month:", month);
  
  // First, debug: check all schedules in DB regardless of status
  const [allDbSchedules] = await database.query(`
    SELECT 
      s.schedule_id,
      s.employee_id,
      s.shift_id,
      s.work_date,
      s.status,
      YEAR(s.work_date) as work_year,
      MONTH(s.work_date) as work_month
    FROM schedules s
    ORDER BY s.work_date DESC
    LIMIT 20
  `);
  console.log("[getSchedulesForMonth] [DEBUG] All schedules in DB (recent 20):", JSON.stringify(allDbSchedules, null, 2));
  
  const [schedules] = await database.query(query, [year, month]);
  console.log("[getSchedulesForMonth] Found", schedules.length, "schedules for month", month, year);
  
  // If no schedules found, debug by checking PUBLISHED for that month only
  if (schedules.length === 0) {
    console.log("[getSchedulesForMonth] No schedules found, debugging...");
    const [debugSchedules] = await database.query(`
      SELECT 
        s.schedule_id,
        s.work_date,
        s.status,
        YEAR(s.work_date) as work_year,
        MONTH(s.work_date) as work_month
      FROM schedules s
      WHERE YEAR(s.work_date) = ? AND MONTH(s.work_date) = ?
      ORDER BY s.work_date ASC
    `, [year, month]);
    console.log("[getSchedulesForMonth] All schedules for", month, '/', year, "(any status):", JSON.stringify(debugSchedules, null, 2));
  }
  
  if (schedules.length > 0) {
    console.log("[getSchedulesForMonth] First record:", JSON.stringify(schedules[0], null, 2));
  }
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

/**
 * Helper: Check if an employee can be assigned to a shift
 * Returns { can: boolean, reason: string }
 */
function canAssign({
  empId,
  shift_id,
  workDate,
  generatedSchedule,
  employeeAvailability,
  employeeShiftCount,
  max_shifts_per_week = 6,
  max_shifts_per_month = 25,
  hasAvailabilityData = false,
  employees = []
}) {
  // Check if already assigned to this shift on this date
  if (
    generatedSchedule.some(
      (s) => s.employee_id === empId && s.shift_id === shift_id && s.work_date === workDate
    )
  ) {
    return { can: false, reason: "Already assigned to this shift on this date" };
  }

  // Check availability - If availability data was provided, ONLY assigned employees can be scheduled
  if (hasAvailabilityData) {
    // Employee must have availability data for this date
    if (!employeeAvailability[empId] || !employeeAvailability[empId][workDate]) {
      return { can: false, reason: `Not available on ${workDate}` };
    }
    // Employee must have this shift marked as available
    if (!employeeAvailability[empId][workDate].has(shift_id)) {
      return { can: false, reason: `Not available for shift ${shift_id} on ${workDate}` };
    }
  }
  // If no availability data was submitted, assume all employees are available

  // Check max shifts per month
  if (employeeShiftCount[empId] >= max_shifts_per_month) {
    return { can: false, reason: `Reached max shifts per month (${max_shifts_per_month})` };
  }

  // Check max shifts per week
  const workDateObj = new Date(workDate);
  const shiftsThisWeek = generatedSchedule.filter((s) => {
    return (
      s.employee_id === empId &&
      isInSameWeek(new Date(s.work_date), workDateObj)
    );
  }).length;

  if (shiftsThisWeek + 1 > max_shifts_per_week) {
    return { can: false, reason: `Would exceed max shifts per week (${max_shifts_per_week})` };
  }

  return { can: true, reason: "OK" };
}

/**
 * Helper: Check if two dates are in the same week
 */
function isInSameWeek(date1, date2) {
  const getWeekNumber = (d) => {
    const tempDate = new Date(d);
    tempDate.setHours(0, 0, 0, 0);
    tempDate.setDate(tempDate.getDate() + 4 - (tempDate.getDay() || 7));
    const yearStart = new Date(tempDate.getFullYear(), 0, 1);
    return Math.ceil(((tempDate - yearStart) / 86400000 + 1) / 7);
  };

  return (
    getWeekNumber(date1) === getWeekNumber(date2) &&
    date1.getFullYear() === date2.getFullYear()
  );
}
