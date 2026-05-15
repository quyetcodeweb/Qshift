import * as userService from "../services/user.service.js";

export const getUsers = async (req, res) => {
  res.json(await userService.getUsers());
};

export const updateUser = async (req, res) => {
  await userService.updateUser(req.params.id, req.body);
  res.json({ message: "Updated" });
};

export const deleteUser = async (req, res) => {
  await userService.deleteUser(req.params.id);
  res.json({ message: "Deleted" });
};

export const toggleUserStatus = async (req, res) => {
  const { status } = req.body;
  await userService.toggleUserStatus(req.params.id, status);
  res.json({ message: "Status updated" });
};