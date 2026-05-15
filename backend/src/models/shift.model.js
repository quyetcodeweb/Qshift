import db from "../config/db.js";

export const getAllShifts = async () => {
  const [rows] = await db.query("SELECT * FROM shifts");
  return rows;
};

export const createShift = async ({ shift_name, start_time, end_time, description }) => {
  await db.query(
    "INSERT INTO shifts (shift_name, start_time, end_time, description) VALUES (?, ?, ?, ?)",
    [shift_name, start_time, end_time, description]
  );
};

export const updateShift = async (id, { shift_name, start_time, end_time, description }) => {
  await db.query(
    "UPDATE shifts SET shift_name=?, start_time=?, end_time=?, description=? WHERE shift_id=?",
    [shift_name, start_time, end_time, description, id]
  );
};

export const deleteShift = async (id) => {
  await db.query("DELETE FROM shift_requirements WHERE shift_id=?", [id]);
  await db.query("DELETE FROM employee_availability WHERE shift_id=?", [id]);
  await db.query("DELETE FROM schedules WHERE shift_id=?", [id]);
  await db.query("DELETE FROM shifts WHERE shift_id=?", [id]);
};