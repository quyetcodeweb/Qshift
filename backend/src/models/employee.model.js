import db from "../config/db.js";

function toMysqlDate(value) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    return value.slice(0, 10) || null;
  }
  return null;
}

export const createEmployee = async (data) => {
  const {
    user_id,
    name,
    email,
    phone,
    avatar_url,
    address,
    birth_date,
    gender,
    emergency_contact,
    emergency_phone,
    hourly_rate,
    hire_date,
    status,
  } = data;

  await db.query(
    `INSERT INTO employees 
    (user_id, name, email, phone, avatar_url, address, birth_date, gender, emergency_contact, emergency_phone, hourly_rate, hire_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      user_id,
      name,
      email,
      phone,
      avatar_url || null,
      address || null,
      birth_date || null,
      gender || null,
      emergency_contact || null,
      emergency_phone || null,
      hourly_rate,
      toMysqlDate(hire_date),
      status,
    ]
  );
};

export const getEmployees = async () => {
  const [rows] = await db.query(`
    SELECT
      e.employee_id,
      e.user_id,
      e.name,
      e.email,
      e.phone,
      CAST(e.hourly_rate AS CHAR) AS hourly_rate,
      DATE_FORMAT(e.birth_date, '%Y-%m-%d') AS birth_date,
      DATE_FORMAT(e.hire_date, '%Y-%m-%d') AS hire_date,
      e.status,
      FALSE AS has_avatar,
      u.username
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
      SELECT
        e.employee_id,
        e.user_id,
        e.name,
        e.email,
        e.phone,
        e.address,
        e.birth_date,
        e.gender,
        e.emergency_contact,
        e.emergency_phone,
        e.hourly_rate,
        e.hire_date,
        e.status,
        FALSE AS has_avatar,
        u.username
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
    address,
    birth_date,
    gender,
    emergency_contact,
    emergency_phone,
    hourly_rate,
    hire_date,
    status,
  } = data;

  await db.query(
    `UPDATE employees
     SET name = ?, email = ?, phone = ?, avatar_url = ?, address = ?, birth_date = ?, gender = ?, emergency_contact = ?, emergency_phone = ?, hourly_rate = ?, hire_date = ?, status = ?
     WHERE employee_id = ?`,
    [
      name,
      email,
      phone,
      avatar_url || null,
      address || null,
      toMysqlDate(birth_date),
      gender || null,
      emergency_contact || null,
      emergency_phone || null,
      hourly_rate,
      toMysqlDate(hire_date),
      status,
      employeeId,
    ]
  );

  return getEmployeeById(employeeId);
};
