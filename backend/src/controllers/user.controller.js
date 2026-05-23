import * as userService from "../services/user.service.js";

export const getUsers = async (req, res) => {
  res.json(await userService.getUsers());
};

export const updateUser = async (req, res) => {
  try {
    await userService.updateUser(req.params.id, req.body);
    res.json({ message: "Updated" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

export const changeOwnPassword = async (req, res) => {
  try {
    await userService.changeOwnPassword(req.user.user_id, req.body);
    res.json({ message: "Password updated" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

export const deleteUser = async (req, res) => {
  try {
    await userService.deleteUser(req.params.id);
    res.json({ message: "Deleted" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

export const toggleUserStatus = async (req, res) => {
  try {
    const { status } = req.body;
    await userService.toggleUserStatus(req.params.id, status);
    res.json({ message: "Status updated" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};
