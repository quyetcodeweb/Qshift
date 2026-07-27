import db from "../config/db.js";

export const getUsers = async () => {
  const [rows] = await db.query(`
    SELECT
      u.user_id,
      u.username,
      u.role,
      u.status,
      u.created_at,
      e.employee_id,
      e.name AS employee_name
    FROM users u
    LEFT JOIN employees e ON e.user_id = u.user_id
    ORDER BY u.user_id ASC
  `);
  return rows;
};

export const getUserById = async (id) => {
  const [rows] = await db.query("SELECT * FROM users WHERE user_id=?", [id]);
  return rows[0] || null;
};

export const getEmployeeByUserId = async (userId) => {
  const [rows] = await db.query(
    "SELECT employee_id, email, name FROM employees WHERE user_id=? LIMIT 1",
    [userId],
  );
  return rows[0] || null;
};

export const countAdmins = async () => {
  const [rows] = await db.query(
    "SELECT COUNT(*) as total FROM users WHERE role='ADMIN'"
  );
  return Number(rows[0]?.total || 0);
};

export const updateUser = async (id, data) => {
  const { username, password, role, status } = data;

  await db.query(
    `UPDATE users 
     SET username=?, password=?, role=?, status=?
     WHERE user_id=?`,
    [username, password, role, status, id]
  );
};

export const deleteUser = async (id) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const [employees] = await connection.query(
      "SELECT employee_id FROM employees WHERE user_id = ?",
      [id]
    );
    const employeeIds = employees.map((employee) => employee.employee_id);

    if (employeeIds.length) {
      const employeePlaceholders = employeeIds.map(() => "?").join(",");
      const [schedules] = await connection.query(
        `SELECT schedule_id FROM schedules WHERE employee_id IN (${employeePlaceholders})`,
        employeeIds
      );
      const scheduleIds = schedules.map((schedule) => schedule.schedule_id);
      const schedulePlaceholders = scheduleIds.map(() => "?").join(",");

      if (await tableExists(connection, "shift_swap_requests")) {
        const scheduleFilter = scheduleIds.length
          ? ` OR requester_schedule_id IN (${schedulePlaceholders}) OR target_schedule_id IN (${schedulePlaceholders})`
          : "";
        await connection.query(
          `DELETE FROM shift_swap_requests
           WHERE requester_employee_id IN (${employeePlaceholders})
              OR target_employee_id IN (${employeePlaceholders})
              ${scheduleFilter}`,
          [
            ...employeeIds,
            ...employeeIds,
            ...(scheduleIds.length ? [...scheduleIds, ...scheduleIds] : []),
          ]
        );
      }

      if (await tableExists(connection, "requests")) {
        const scheduleFilter = scheduleIds.length
          ? ` OR schedule_id IN (${schedulePlaceholders})`
          : "";
        await connection.query(
          `DELETE FROM requests
           WHERE employee_id IN (${employeePlaceholders})
              OR target_employee_id IN (${employeePlaceholders})
              ${scheduleFilter}`,
          [
            ...employeeIds,
            ...employeeIds,
            ...(scheduleIds.length ? scheduleIds : []),
          ]
        );
      }

      await deleteFromIfExists(
        connection,
        "attendance",
        `employee_id IN (${employeePlaceholders})${
          scheduleIds.length ? ` OR schedule_id IN (${schedulePlaceholders})` : ""
        }`,
        [...employeeIds, ...(scheduleIds.length ? scheduleIds : [])]
      );
      await deleteFromIfExists(
        connection,
        "draft_schedule_items",
        `employee_id IN (${employeePlaceholders})`,
        employeeIds
      );
      await deleteFromIfExists(
        connection,
        "schedules",
        `employee_id IN (${employeePlaceholders})`,
        employeeIds
      );
      await deleteFromIfExists(
        connection,
        "employee_availability",
        `employee_id IN (${employeePlaceholders})`,
        employeeIds
      );
      await deleteFromIfExists(
        connection,
        "availability_requests",
        `employee_id IN (${employeePlaceholders}) OR user_id = ?`,
        [...employeeIds, id]
      );
      await deleteFromIfExists(
        connection,
        "payroll_feedback",
        `employee_id IN (${employeePlaceholders})`,
        employeeIds
      );
      await deleteFromIfExists(
        connection,
        "payroll",
        `employee_id IN (${employeePlaceholders})`,
        employeeIds
      );
      await deleteFromIfExists(
        connection,
        "employee_role_assignments",
        `employee_id IN (${employeePlaceholders})`,
        employeeIds
      );

      await connection.query(
        `DELETE FROM employees WHERE employee_id IN (${employeePlaceholders})`,
        employeeIds
      );
    } else {
      await deleteFromIfExists(connection, "availability_requests", "user_id = ?", [id]);
    }

    await deleteFromIfExists(connection, "notifications", "user_id = ?", [id]);
    await connection.query("DELETE FROM users WHERE user_id=?", [id]);

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};

export const toggleUserStatus = async (id, status) => {
  await db.query(
    "UPDATE users SET status=? WHERE user_id=?",
    [status, id]
  );
};

async function tableExists(connection, tableName) {
  const [rows] = await connection.query(
    `SELECT TABLE_NAME
     FROM INFORMATION_SCHEMA.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [tableName]
  );
  return rows.length > 0;
}

async function deleteFromIfExists(connection, tableName, whereClause, params) {
  if (!(await tableExists(connection, tableName))) return;
  await connection.query(`DELETE FROM ${tableName} WHERE ${whereClause}`, params);
}
