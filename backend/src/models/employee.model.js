import db from "../config/db.js";

export const createEmployee = async (data) => {
  const {
    user_id,
    name,
    email,
    phone,
    hourly_rate,
    hire_date,
    status,
  } = data;

  await db.query(
    `INSERT INTO employees 
    (user_id, name, email, phone, hourly_rate, hire_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [user_id, name, email, phone, hourly_rate, hire_date, status]
  );
};

export const getEmployees = async () => {
  const [rows] = await db.query(`
    SELECT e.*, u.username 
    FROM employees e
    JOIN users u ON e.user_id = u.user_id
    ORDER BY e.name ASC
  `);
  return rows;
};

export const getEmployeeByUserId = async (userId) => {
  const [rows] = await db.query(
    `
      SELECT e.*, u.username
      FROM employees e
      JOIN users u ON e.user_id = u.user_id
      WHERE e.user_id = ?
    `,
    [userId]
  );
  return rows[0] || null;
};

export const getEmployeeById = async (employeeId) => {
  const [rows] = await db.query(
    `
      SELECT e.*, u.username
      FROM employees e
      JOIN users u ON e.user_id = u.user_id
      WHERE e.employee_id = ?
    `,
    [employeeId]
  );
  return rows[0] || null;
};

export const updateEmployee = async (employeeId, data) => {
  const {
    name,
    email,
    phone,
    avatar_url,
    hourly_rate,
  } = data;

  await db.query(
    `UPDATE employees
     SET name = ?, email = ?, phone = ?, avatar_url = ?, hourly_rate = ?
     WHERE employee_id = ?`,
    [name, email, phone, avatar_url || null, hourly_rate, employeeId]
  );

  return getEmployeeById(employeeId);
};
