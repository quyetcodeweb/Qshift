import database from "../config/db.js";

const LOCAL_NOW_SQL = "(UTC_TIMESTAMP() + INTERVAL 7 HOUR)";
const TODAY_SQL = `DATE(${LOCAL_NOW_SQL})`;
const VIETNAM_TIMEZONE_OFFSET = "+07:00";

function toVietnamDateTime(date, time) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}${VIETNAM_TIMEZONE_OFFSET}`);
}

async function getCurrentUser(userId) {
  const [users] = await database.query(
    "SELECT user_id, role FROM users WHERE user_id = ?",
    [userId]
  );
  return users[0] || null;
}

async function getEmployeeByUserId(userId) {
  const [employees] = await database.query(
    "SELECT employee_id FROM employees WHERE user_id = ?",
    [userId]
  );
  return employees[0] || null;
}

async function getAdminUsers() {
  const [admins] = await database.query(
    "SELECT user_id FROM users WHERE role = 'ADMIN'"
  );
  return admins;
}

async function notifyAdmins({ type, message, refId = null, dedupe = false }) {
  const admins = await getAdminUsers();

  for (const admin of admins) {
    if (dedupe) {
      const [existing] = await database.query(
        `SELECT notification_id
         FROM notifications
         WHERE user_id = ? AND type = ? AND ref_id <=> ?
           AND message = ?
         LIMIT 1`,
        [admin.user_id, type, refId, message]
      );

      if (existing.length) {
        continue;
      }
    }

    await database.query(
      `INSERT INTO notifications (user_id, message, type, ref_id)
       VALUES (?, ?, ?, ?)`,
      [admin.user_id, message, type, refId]
    );
  }
}

async function notifyAttendanceCheckIn(schedule, attendanceStatus) {
  const isLate = attendanceStatus === "LATE";
  const message = isLate
    ? `${schedule.employee_name} đã chấm công trễ ca ${schedule.shift_name} (${schedule.start_time.slice(0, 5)} - ${schedule.end_time.slice(0, 5)}) ngày ${schedule.work_date}.`
    : `${schedule.employee_name} đã chấm công đúng giờ ca ${schedule.shift_name} (${schedule.start_time.slice(0, 5)} - ${schedule.end_time.slice(0, 5)}) ngày ${schedule.work_date}.`;

  await notifyAdmins({
    type: isLate ? "ATTENDANCE_LATE" : "ATTENDANCE_ON_TIME",
    message,
    refId: schedule.schedule_id,
    dedupe: true,
  });
}

export async function scanMissingAttendanceNotifications() {
  try {
    const [groups] = await database.query(
      `SELECT
        DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
        s.shift_id,
        sh.shift_name,
        TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
        TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time,
        COUNT(*) AS missing_count,
        GROUP_CONCAT(e.name ORDER BY e.name SEPARATOR ', ') AS employee_names
       FROM schedules s
       JOIN employees e ON s.employee_id = e.employee_id
       JOIN shifts sh ON s.shift_id = sh.shift_id
       LEFT JOIN attendance a ON a.schedule_id = s.schedule_id
       WHERE s.status = 'PUBLISHED'
         AND a.check_in IS NULL
         AND (
           CASE
             WHEN sh.end_time > sh.start_time
               THEN TIMESTAMP(s.work_date, sh.end_time)
             ELSE DATE_ADD(TIMESTAMP(s.work_date, sh.end_time), INTERVAL 1 DAY)
           END
         ) <= ${LOCAL_NOW_SQL}
         AND DATE(
           CASE
             WHEN sh.end_time > sh.start_time
               THEN TIMESTAMP(s.work_date, sh.end_time)
             ELSE DATE_ADD(TIMESTAMP(s.work_date, sh.end_time), INTERVAL 1 DAY)
           END
         ) = ${TODAY_SQL}
       GROUP BY s.work_date, s.shift_id, sh.shift_name, sh.start_time, sh.end_time`
    );

    for (const group of groups) {
      const message = `Ca ${group.shift_name} (${group.start_time.slice(0, 5)} - ${group.end_time.slice(0, 5)}) ngày ${group.work_date} có ${group.missing_count} nhân viên chưa chấm công: ${group.employee_names}.`;

      await notifyAdmins({
        type: "ATTENDANCE_MISSING",
        message,
        refId: group.shift_id,
        dedupe: true,
      });
    }
  } catch (error) {
    console.error("[scanMissingAttendanceNotifications] Error:", error);
  }
}

function buildAttendanceSelect(extraWhere = "") {
  return `
    SELECT
      s.schedule_id,
      s.employee_id,
      e.name AS employee_name,
      e.email,
      s.shift_id,
      sh.shift_name,
      TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
      TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time,
      DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
      s.status AS schedule_status,
      a.attendance_id,
      DATE_FORMAT(a.check_in, '%Y-%m-%d %H:%i:%s') AS check_in,
      DATE_FORMAT(a.check_out, '%Y-%m-%d %H:%i:%s') AS check_out,
      a.status AS attendance_status,
      CASE
        WHEN a.check_in IS NULL THEN 'NOT_CHECKED_IN'
        WHEN a.check_out IS NULL THEN 'CHECKED_IN'
        ELSE 'COMPLETED'
      END AS progress_status
    FROM schedules s
    JOIN employees e ON s.employee_id = e.employee_id
    JOIN shifts sh ON s.shift_id = sh.shift_id
    LEFT JOIN attendance a ON a.schedule_id = s.schedule_id
    WHERE s.status = 'PUBLISHED'
      ${extraWhere}
  `;
}

export async function getTodayAttendance(req, res) {
  try {
    await scanMissingAttendanceNotifications();

    const user = await getCurrentUser(req.user?.user_id);

    if (!user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const params = [];
    let where = `AND s.work_date = ${TODAY_SQL}`;

    if (user.role !== "ADMIN") {
      const employee = await getEmployeeByUserId(user.user_id);

      if (!employee) {
        return res.json([]);
      }

      where += " AND s.employee_id = ?";
      params.push(employee.employee_id);
    }

    const [rows] = await database.query(
      `${buildAttendanceSelect(where)}
       ORDER BY sh.start_time ASC, e.name ASC`,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error("[getTodayAttendance] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getAttendanceHistory(req, res) {
  try {
    const user = await getCurrentUser(req.user?.user_id);

    if (!user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const { employee_id, startDate, endDate } = req.query;
    const params = [];
    let where = "";

    if (startDate && endDate) {
      where += " AND s.work_date BETWEEN ? AND ?";
      params.push(startDate, endDate);
    }

    if (user.role === "ADMIN") {
      if (employee_id) {
        where += " AND s.employee_id = ?";
        params.push(employee_id);
      }
    } else {
      const employee = await getEmployeeByUserId(user.user_id);

      if (!employee) {
        return res.json({
          records: [],
          stats: { total: 0, on_time: 0, late: 0, missing: 0 },
        });
      }

      where += " AND s.employee_id = ?";
      params.push(employee.employee_id);
    }

    const [records] = await database.query(
      `${buildAttendanceSelect(where)}
       ORDER BY s.work_date DESC, sh.start_time DESC`,
      params
    );

    const stats = records.reduce(
      (acc, record) => {
        acc.total += 1;

        if (!record.check_in) {
          acc.missing += 1;
        } else if (record.attendance_status === "LATE") {
          acc.late += 1;
        } else {
          acc.on_time += 1;
        }

        return acc;
      },
      { total: 0, on_time: 0, late: 0, missing: 0 }
    );

    res.json({ records, stats });
  } catch (error) {
    console.error("[getAttendanceHistory] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function markAttendance(req, res) {
  try {
    const user = await getCurrentUser(req.user?.user_id);

    if (!user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const employee = await getEmployeeByUserId(user.user_id);
    const { schedule_id, action } = req.body;

    if (!employee) {
      return res.status(403).json({ message: "Không tìm thấy hồ sơ nhân viên" });
    }

    if (!schedule_id || !["check_in", "check_out"].includes(action)) {
      return res.status(400).json({ message: "schedule_id và action không hợp lệ" });
    }

    const [schedules] = await database.query(
      `SELECT
        s.schedule_id,
        s.employee_id,
        e.name AS employee_name,
        DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
        sh.shift_name,
        TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
        TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time
       FROM schedules s
       JOIN employees e ON s.employee_id = e.employee_id
       JOIN shifts sh ON s.shift_id = sh.shift_id
       WHERE s.schedule_id = ?
         AND s.employee_id = ?
         AND s.status = 'PUBLISHED'
         AND s.work_date = ${TODAY_SQL}`,
      [schedule_id, employee.employee_id]
    );

    if (!schedules.length) {
      return res.status(404).json({ message: "Không tìm thấy ca làm hôm nay" });
    }

    const schedule = schedules[0];
    const shiftStart = toVietnamDateTime(schedule.work_date, schedule.start_time);
    let shiftEnd = toVietnamDateTime(schedule.work_date, schedule.end_time);

    if (shiftEnd <= shiftStart) {
      shiftEnd = new Date(shiftEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    const checkInOpenAt = new Date(shiftStart.getTime() - 15 * 60 * 1000);
    const now = new Date();
    const [existingRows] = await database.query(
      "SELECT * FROM attendance WHERE schedule_id = ?",
      [schedule_id]
    );
    const existing = existingRows[0];

    if (action === "check_in") {
      if (existing?.check_in) {
        return res.status(400).json({ message: "Ca này đã được chấm công vào" });
      }

      if (now < checkInOpenAt || now >= shiftEnd) {
        return res.status(400).json({
          message: "Chỉ có thể chấm công vào trong vòng 15 phút trước khi ca bắt đầu",
        });
      }

      const attendanceStatus = now > shiftStart ? "LATE" : "ON_TIME";

      await database.query(
        `INSERT INTO attendance (employee_id, schedule_id, check_in, status)
         VALUES (?, ?, ${LOCAL_NOW_SQL}, ?)`,
        [employee.employee_id, schedule_id, attendanceStatus]
      );

      await notifyAttendanceCheckIn(schedule, attendanceStatus);

      return res.json({ message: "Đã ghi nhận chấm công vào", status: attendanceStatus });
    }

    if (!existing?.check_in) {
      return res.status(400).json({ message: "Bạn cần chấm công vào trước" });
    }

    if (existing.check_out) {
      return res.status(400).json({ message: "Ca này đã được chấm công ra" });
    }

    if (now < shiftEnd) {
      return res.status(400).json({ message: "Chỉ có thể chấm công ra khi ca vừa kết thúc" });
    }

    await database.query(
      `UPDATE attendance
       SET check_out = ${LOCAL_NOW_SQL}
       WHERE schedule_id = ?`,
      [schedule_id]
    );

    res.json({ message: "Đã ghi nhận chấm công ra" });
  } catch (error) {
    console.error("[markAttendance] Error:", error);
    res.status(500).json({ message: error.message });
  }
}
