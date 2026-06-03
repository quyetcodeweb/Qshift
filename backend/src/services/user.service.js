import bcrypt from "bcrypt";
import * as userModel from "../models/user.model.js";
import { createAndSendOtp, verifyOtp } from "./emailNotification.service.js";

function normalizeEmail(value) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

export const getUsers = async () => {
  return await userModel.getUsers();
};

export const getUserById = async (id) => {
  return await userModel.getUserById(id);
};

export const updateUser = async (id, data) => {
  const existingUser = await userModel.getUserById(id);

  if (!existingUser) {
    throw new Error("User not found");
  }

  const adminCount = await userModel.countAdmins();

  if (
    existingUser.role === "ADMIN" &&
    adminCount <= 1 &&
    data.role !== "ADMIN"
  ) {
    const error = new Error("Không thể đổi vai trò của admin cuối cùng");
    error.statusCode = 403;
    throw error;
  }

  if ((existingUser.role === "ADMIN" || data.role === "ADMIN") && data.status === false) {
    const error = new Error("Không thể vô hiệu hóa tài khoản admin");
    error.statusCode = 403;
    throw error;
  }

  let password = data.password;

  if (password) {
    password = await bcrypt.hash(password, 10);
  } else {
    password = existingUser.password;
  }

  return await userModel.updateUser(id, {
    ...data,
    password,
  });
};

export const changeOwnPassword = async (userId, data) => {
  const existingUser = await userModel.getUserById(userId);

  if (!existingUser) {
    const error = new Error("Không tìm thấy tài khoản");
    error.statusCode = 404;
    throw error;
  }

  if (!data.currentPassword || !data.newPassword) {
    const error = new Error("Vui lòng nhập mật khẩu cũ và mật khẩu mới");
    error.statusCode = 400;
    throw error;
  }

  const isCurrentPasswordValid = await bcrypt.compare(
    data.currentPassword,
    existingUser.password || "",
  );

  if (!isCurrentPasswordValid) {
    const error = new Error("Mật khẩu cũ không đúng");
    error.statusCode = 400;
    throw error;
  }

  if (String(data.newPassword).length < 6) {
    const error = new Error("Mật khẩu mới cần ít nhất 6 ký tự");
    error.statusCode = 400;
    throw error;
  }

  if (!data.otp) {
    const error = new Error("Vui lòng nhập mã OTP đã gửi tới email");
    error.statusCode = 400;
    throw error;
  }

  await verifyOtp({
    userId,
    purpose: "password_change",
    code: data.otp,
  });

  const password = await bcrypt.hash(data.newPassword, 10);

  return await userModel.updateUser(userId, {
    username: existingUser.username,
    password,
    role: existingUser.role,
    status: existingUser.status,
  });
};

export const sendPasswordOtp = async (userId) => {
  const existingUser = await userModel.getUserById(userId);
  if (!existingUser) {
    const error = new Error("Không tìm thấy tài khoản");
    error.statusCode = 404;
    throw error;
  }

  const employee = await userModel.getEmployeeByUserId(userId);
  const targetEmail =
    normalizeEmail(employee?.email) ||
    normalizeEmail(existingUser.email) ||
    normalizeEmail(existingUser.username);

  if (!targetEmail) {
    const error = new Error("Tài khoản chưa có email để nhận mã OTP");
    error.statusCode = 400;
    throw error;
  }

  return createAndSendOtp({
    userId,
    employeeId: employee?.employee_id,
    purpose: "password_change",
    targetEmail,
  });
};

export const deleteUser = async (id) => {
  const user = await userModel.getUserById(id);

  if (!user) {
    throw new Error("User not found");
  }

  const adminCount = await userModel.countAdmins();

  if (user.role === "ADMIN" && adminCount <= 1) {
    const error = new Error("Không thể xóa admin cuối cùng");
    error.statusCode = 403;
    throw error;
  }

  return await userModel.deleteUser(id);
};

export const toggleUserStatus = async (id, status) => {
  const user = await userModel.getUserById(id);

  if (!user) {
    throw new Error("User not found");
  }

  if (user.role === "ADMIN") {
    const error = new Error("Không thể vô hiệu hóa tài khoản admin");
    error.statusCode = 403;
    throw error;
  }

  return await userModel.toggleUserStatus(id, status);
};
