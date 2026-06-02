import bcrypt from "bcrypt";
import db from "../config/db.js";
import * as employeeModel from "../models/employee.model.js";
import * as userService from "./user.service.js";
import { verifyOtp } from "./emailNotification.service.js";
export const createEmployee = async (data) => {
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
        hire_date,
        status,
      ]
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

export const verifyEmployeeEmailChangeOtp = async (userId, otpCode) => {
  if (!otpCode) {
    const error = new Error("Vui lòng nhập mã OTP đã gửi tới email cũ");
    error.statusCode = 400;
    throw error;
  }
  return verifyOtp({
    userId,
    purpose: "email_change",
    code: otpCode,
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
