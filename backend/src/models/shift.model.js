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

function timeToMinutes(value) {
  const [hours = 0, minutes = 0] = String(value || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  return hours * 60 + minutes;
}

function timeRanges(startTime, endTime) {
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);

  if (start === end) return [];
  if (end > start) return [[start, end]];
  return [
    [start, 1440],
    [0, end],
  ];
}

function rangesOverlap(a, b) {
  return a.some(([aStart, aEnd]) =>
    b.some(([bStart, bEnd]) => aStart < bEnd && bStart < aEnd)
  );
}

async function ensureNoShiftOverlap({ start_time, end_time, excludeId = null }) {
  const [rows] = await db.query(
    excludeId
      ? "SELECT shift_id, shift_name, start_time, end_time FROM shifts WHERE shift_id <> ?"
      : "SELECT shift_id, shift_name, start_time, end_time FROM shifts",
    excludeId ? [excludeId] : []
  );
  const incoming = timeRanges(start_time, end_time);
  const conflict = rows.find((shift) =>
    rangesOverlap(incoming, timeRanges(shift.start_time, shift.end_time))
  );

  if (conflict) {
    const error = new Error(
      `Ca bị trùng thời gian với "${conflict.shift_name}" (${String(conflict.start_time).slice(0, 5)} - ${String(conflict.end_time).slice(0, 5)})`
    );
    error.statusCode = 400;
    throw error;
  }
}

export const createShift = async ({ shift_name, start_time, end_time, description, color }) => {
  await ensureShiftColorColumn();
  await ensureNoShiftOverlap({ start_time, end_time });
  await db.query(
    "INSERT INTO shifts (shift_name, start_time, end_time, description, color) VALUES (?, ?, ?, ?, ?)",
    [shift_name, start_time, end_time, description, color || "#2563eb"]
  );
};

export const updateShift = async (id, { shift_name, start_time, end_time, description, color }) => {
  await ensureShiftColorColumn();
  await ensureNoShiftOverlap({ start_time, end_time, excludeId: id });
  await db.query(
    "UPDATE shifts SET shift_name=?, start_time=?, end_time=?, description=?, color=? WHERE shift_id=?",
    [shift_name, start_time, end_time, description, color || "#2563eb", id]
  );
};

export const deleteShift = async (id) => {
  const connection = await db.getConnection();
  const scheduleSubquery = "SELECT schedule_id FROM schedules WHERE shift_id = ?";

  const safeDelete = async (sql, params) => {
    try {
      await connection.query(sql, params);
    } catch (error) {
      if (error.code !== "ER_NO_SUCH_TABLE") {
        throw error;
      }
    }
  };

  try {
    await connection.beginTransaction();

    await safeDelete(
      `DELETE FROM shift_swap_requests
       WHERE requester_schedule_id IN (${scheduleSubquery})
          OR target_schedule_id IN (${scheduleSubquery})`,
      [id, id]
    );
    await safeDelete(
      `DELETE FROM attendance_late_requests
       WHERE schedule_id IN (${scheduleSubquery})`,
      [id]
    );
    await safeDelete(
      `DELETE FROM payroll_resolutions
       WHERE schedule_id IN (${scheduleSubquery})`,
      [id]
    );
    await safeDelete(
      `DELETE FROM attendance
       WHERE schedule_id IN (${scheduleSubquery})`,
      [id]
    );
    await safeDelete("DELETE FROM draft_schedule_items WHERE shift_id = ?", [id]);
    await safeDelete("DELETE FROM shift_role_requirements WHERE shift_id = ?", [id]);
    await safeDelete("DELETE FROM shift_requirements WHERE shift_id = ?", [id]);
    await safeDelete("DELETE FROM employee_availability WHERE shift_id = ?", [id]);
    await safeDelete("DELETE FROM schedules WHERE shift_id = ?", [id]);
    const [result] = await connection.query("DELETE FROM shifts WHERE shift_id = ?", [id]);

    if (result.affectedRows === 0) {
      const error = new Error("Không tìm thấy ca làm cần xóa");
      error.statusCode = 404;
      throw error;
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
};
