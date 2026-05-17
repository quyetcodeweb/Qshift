import db from "../config/db.js";

async function ensureShiftColorColumn() {
  const [columns] = await db.query(
    `SELECT COLUMN_NAME
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = 'shifts'
       AND COLUMN_NAME = 'color'`
  );

  if (columns.length === 0) {
    await db.query("ALTER TABLE shifts ADD COLUMN color VARCHAR(20) DEFAULT '#2563eb'");
  }
}

export const getAllShifts = async () => {
  await ensureShiftColorColumn();
  const [rows] = await db.query("SELECT * FROM shifts");
  return rows;
};

export const createShift = async ({ shift_name, start_time, end_time, description, color }) => {
  await ensureShiftColorColumn();
  await db.query(
    "INSERT INTO shifts (shift_name, start_time, end_time, description, color) VALUES (?, ?, ?, ?, ?)",
    [shift_name, start_time, end_time, description, color || "#2563eb"]
  );
};

export const updateShift = async (id, { shift_name, start_time, end_time, description, color }) => {
  await ensureShiftColorColumn();
  await db.query(
    "UPDATE shifts SET shift_name=?, start_time=?, end_time=?, description=?, color=? WHERE shift_id=?",
    [shift_name, start_time, end_time, description, color || "#2563eb", id]
  );
};

export const deleteShift = async (id) => {
  await db.query("DELETE FROM shift_requirements WHERE shift_id=?", [id]);
  await db.query("DELETE FROM employee_availability WHERE shift_id=?", [id]);
  await db.query("DELETE FROM schedules WHERE shift_id=?", [id]);
  await db.query("DELETE FROM shifts WHERE shift_id=?", [id]);
};
