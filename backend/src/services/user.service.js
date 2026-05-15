import bcrypt from "bcrypt";
import * as userModel from "../models/user.model.js";

export const getUsers = async () => {
  return await userModel.getUsers();
};

export const updateUser = async (id, data) => {
  let password = data.password;

  if (password) {
    password = await bcrypt.hash(password, 10);
  }

  return await userModel.updateUser(id, {
    ...data,
    password,
  });
};

export const deleteUser = async (id) => {
  return await userModel.deleteUser(id);
};

export const toggleUserStatus = async (id, status) => {
  return await userModel.toggleUserStatus(id, status);
};