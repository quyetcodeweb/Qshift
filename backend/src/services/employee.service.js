import bcrypt from "bcrypt";
import db from "../config/db.js";
import * as employeeModel from "../models/employee.model.js";
import * as userService from "./user.service.js";
export const createEmployee = async (data) => {
  const {
    name,
    email,
    phone,
    hourly_rate,
    hire_date,
    status,
  } = data;

  // validate
  if (!phone) throw new Error("Phone is required");

  // tạo username + password
  const username = phone;
  const last5 = phone.slice(-5);
  const rawPassword = "A" + last5;

  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    // 1. tạo user
    const [userResult] = await conn.query(
      `INSERT INTO users (username, password, role)
       VALUES (?, ?, 'EMPLOYEE')`,
      [username, hashedPassword]
    );

    const user_id = userResult.insertId;

    // 2. tạo employee
    const [employeeResult] = await conn.query(
      `INSERT INTO employees 
      (user_id, name, email, phone, hourly_rate, hire_date, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [user_id, name, email, phone, hourly_rate, hire_date, status]
    );

    await conn.commit();

    return {
      employee_id: employeeResult.insertId,
      user_id,
      username,
      rawPassword, // trả về để test (sau này nên bỏ)
    };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
  
};
export const getEmployees = async () => {
  return await employeeModel.getEmployees();
};

export const getMyProfile = async (userId) => {
  return await employeeModel.getEmployeeByUserId(userId);
};

export const updateEmployee = async (employeeId, data) => {
  const existing = await employeeModel.getEmployeeById(employeeId);
  return await employeeModel.updateEmployee(employeeId, {
    ...existing,
    ...data,
  });
};

export const getEmployeeById = async (employeeId) => {
  return await employeeModel.getEmployeeById(employeeId);
};

export const deleteEmployee = async (employeeId) => {
  const employee = await employeeModel.getEmployeeById(employeeId);

  if (!employee) {
    throw new Error("Employee not found");
  }

  return await userService.deleteUser(employee.user_id);
};
