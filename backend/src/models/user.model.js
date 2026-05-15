import db from "../config/db.js";

export const getUsers = async () => {
  const [rows] = await db.query("SELECT * FROM users");
  return rows;
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
  await db.query("DELETE FROM users WHERE user_id=?", [id]);
};

export const toggleUserStatus = async (id, status) => {
  await db.query(
    "UPDATE users SET status=? WHERE user_id=?",
    [status, id]
  );
};