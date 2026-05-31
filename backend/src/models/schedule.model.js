import database from "../config/db.js";

export async function getShiftsByIds(shiftIds) {
  if (!shiftIds || shiftIds.length === 0) return [];

  const placeholders = shiftIds.map(() => "?").join(",");
  const query = `
    SELECT shift_id, shift_name, start_time, end_time 
    FROM shifts 
    WHERE shift_id IN (${placeholders})
  `;

  const [shifts] = await database.query(query, shiftIds);
  return shifts;
}

export async function getEmployeeAvailability(month, year) {
  const query = `
    SELECT DISTINCT 
      ea.employee_id,
      ea.shift_id,
      DATE_FORMAT(ea.work_date, '%Y-%m-%d') as work_date
    FROM employee_availability ea
    WHERE MONTH(ea.work_date) = ? AND YEAR(ea.work_date) = ?
  `;

  const [availability] = await database.query(query, [month, year]);
  return availability;
}

export async function createSchedule(employeeId, shiftId, workDate, status = "DRAFT") {
  const query = `
    INSERT INTO schedules (employee_id, shift_id, work_date, status)
    VALUES (?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE status = VALUES(status)
  `;

  const [result] = await database.query(query, [
    employeeId,
    shiftId,
    workDate,
    status,
  ]);

  return result;
}

export async function getScheduleById(scheduleId) {
  const query = `
    SELECT * FROM schedules WHERE schedule_id = ?
  `;

  const [schedule] = await database.query(query, [scheduleId]);
  return schedule[0];
}

export async function updateScheduleStatus(scheduleId, status) {
  const query = `
    UPDATE schedules SET status = ? WHERE schedule_id = ?
  `;

  await database.query(query, [status, scheduleId]);
}

/**
 * Get all roles for an employee
 */
export async function getEmployeeRoles(employeeId) {
  const query = `
    SELECT 
      era.role_id,
      r.role_name,
      r.description,
      r.color
    FROM employee_role_assignments era
    LEFT JOIN roles r ON era.role_id = r.role_id
    WHERE era.employee_id = ?
  `;

  const [roles] = await database.query(query, [employeeId]);
  return roles;
}

/**
 * Get role requirements for a shift
 */
export async function getShiftRoleRequirements(shiftId) {
  const query = `
    SELECT 
      srr.id,
      srr.shift_id,
      srr.role_id,
      srr.required_count,
      r.role_name,
      r.color
    FROM shift_role_requirements srr
    LEFT JOIN roles r ON srr.role_id = r.role_id
    WHERE srr.shift_id = ?
  `;

  const [requirements] = await database.query(query, [shiftId]);
  return requirements;
}

/**
 * Get all active schedule settings
 */
export async function getScheduleSettings() {
  const query = `
    SELECT * FROM schedule_settings LIMIT 1
  `;

  const [settings] = await database.query(query);
  return settings[0] || {
    balance_scheduling: false,
    prefer_consecutive_shifts: false,
    balance_by_workday: false,
    allow_role_fallback: false,
    productivity_attention: false
  };
}

/**
 * Check if employee has any conflicting shifts on a date
 */
export async function hasConflictOnDate(employeeId, workDate) {
  const query = `
    SELECT COUNT(*) as count
    FROM schedules s
    WHERE s.employee_id = ? 
      AND s.work_date = ? 
      AND s.status IN ('DRAFT', 'PUBLISHED')
  `;

  const [result] = await database.query(query, [employeeId, workDate]);
  return result[0].count > 0;
}

/**
 * Get all employee shift counts (for load balancing)
 */
export async function getEmployeeShiftCounts(employees) {
  const placeholders = employees.map(() => "?").join(",");
  const query = `
    SELECT 
      e.employee_id,
      COUNT(s.schedule_id) as shift_count
    FROM employees e
    LEFT JOIN schedules s ON e.employee_id = s.employee_id 
      AND s.status IN ('DRAFT', 'PUBLISHED')
    WHERE e.employee_id IN (${placeholders})
    GROUP BY e.employee_id
  `;

  const [counts] = await database.query(query, employees.map(e => e.employee_id));
  
  // Return as object keyed by employee_id
  const result = {};
  counts.forEach(row => {
    result[row.employee_id] = row.shift_count;
  });
  
  return result;
}

/**
 * Get shifts assigned to employee in a specific week
 */
export async function getEmployeeShiftsInWeek(employeeId, weekStart, weekEnd) {
  const query = `
    SELECT COUNT(*) as count
    FROM schedules s
    WHERE s.employee_id = ? 
      AND s.work_date >= ? 
      AND s.work_date <= ?
      AND s.status IN ('DRAFT', 'PUBLISHED')
  `;

  const [result] = await database.query(query, [employeeId, weekStart, weekEnd]);
  return result[0].count;
}
