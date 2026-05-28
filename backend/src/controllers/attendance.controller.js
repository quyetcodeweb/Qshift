import database from "../config/db.js";

const LOCAL_NOW_SQL = "(UTC_TIMESTAMP() + INTERVAL 7 HOUR)";
const TODAY_SQL = `DATE(${LOCAL_NOW_SQL})`;
const VIETNAM_TIMEZONE_OFFSET = "+07:00";

function toVietnamDateTime(date, time) {
  if (!date || !time) return null;
  return new Date(`${date}T${time}${VIETNAM_TIMEZONE_OFFSET}`);
}

function getShiftBounds(schedule) {
  const start = toVietnamDateTime(schedule.work_date, schedule.start_time);
  let end = toVietnamDateTime(schedule.work_date, schedule.end_time);

  if (start && end && end <= start) {
    end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
  }

  return { start, end };
}

function getAttendanceProgressStatus(record, attendance) {
  if (attendance.check_in) {
    return attendance.check_out ? "COMPLETED" : "CHECKED_IN";
  }

  const { start } = getShiftBounds(record);

  if (start && start > new Date()) {
    return "UPCOMING";
  }

  return "NOT_CHECKED_IN";
}

function getAttendanceBucket(record) {
  if (!record.check_in && record.progress_status === "UPCOMING") {
    return "UPCOMING";
  }

  if (!record.check_in) {
    return "MISSING";
  }

  if (record.attendance_status === "LATE") {
    return "LATE";
  }

  return "ON_TIME";
}

async function getTodaySchedulesForEmployee(employeeId) {
  const [schedules] = await database.query(
    `SELECT
      CAST(s.schedule_id AS CHAR) AS schedule_id,
      CAST(s.employee_id AS CHAR) AS employee_id,
      e.name AS employee_name,
      DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
      sh.shift_name,
      TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
      TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time
     FROM schedules s
     JOIN employees e ON s.employee_id = e.employee_id
     JOIN shifts sh ON s.shift_id = sh.shift_id
     WHERE s.employee_id = ?
       AND s.status = 'PUBLISHED'
       AND s.work_date = ${TODAY_SQL}`,
    [employeeId]
  );

  return schedules
    .map((schedule) => {
      const { start, end } = getShiftBounds(schedule);
      return { ...schedule, shiftStart: start, shiftEnd: end };
    })
    .sort((a, b) => a.shiftStart - b.shiftStart || a.schedule_id - b.schedule_id);
}

function findContiguousScheduleGroup(schedules, scheduleId) {
  const selectedIndex = schedules.findIndex(
    (schedule) => Number(schedule.schedule_id) === Number(scheduleId)
  );

  if (selectedIndex === -1) return [];

  let firstIndex = selectedIndex;
  while (
    firstIndex > 0 &&
    schedules[firstIndex - 1].shiftEnd.getTime() === schedules[firstIndex].shiftStart.getTime()
  ) {
    firstIndex -= 1;
  }

  let lastIndex = selectedIndex;
  while (
    lastIndex < schedules.length - 1 &&
    schedules[lastIndex].shiftEnd.getTime() === schedules[lastIndex + 1].shiftStart.getTime()
  ) {
    lastIndex += 1;
  }

  return schedules.slice(firstIndex, lastIndex + 1);
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

async function ensureLateRequestTable() {
  await database.query(
    `CREATE TABLE IF NOT EXISTS attendance_late_requests (
      late_request_id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      schedule_id INT NOT NULL,
      requested_minutes INT NOT NULL,
      late_until DATETIME NOT NULL,
      status VARCHAR(20) DEFAULT 'PENDING',
      reason TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      decided_at DATETIME NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
      FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE CASCADE,
      INDEX idx_late_request_employee (employee_id),
      INDEX idx_late_request_schedule (schedule_id),
      INDEX idx_late_request_status (status)
    )`
  );
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

async function notifyUser(userId, type, message, refId = null) {
  if (!userId) return;
  await database.query(
    `INSERT INTO notifications (user_id, message, type, ref_id)
     VALUES (?, ?, ?, ?)`,
    [userId, message, type, refId]
  );
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

async function getAttendanceRecords(extraWhere = "", params = [], orderBy = "") {
  const [schedules] = await database.query(
    `SELECT
      CAST(s.schedule_id AS CHAR) AS schedule_id,
      CAST(s.employee_id AS CHAR) AS employee_id,
      e.name AS employee_name,
      e.email,
      CAST(s.shift_id AS CHAR) AS shift_id
     FROM schedules s
     JOIN employees e ON s.employee_id = e.employee_id
     JOIN shifts sh ON s.shift_id = sh.shift_id
     WHERE s.status = 'PUBLISHED'
       ${extraWhere}
     ${orderBy}`,
    params
  );

  if (!schedules.length) return [];

  const scheduleIds = schedules.map((schedule) => schedule.schedule_id);
  const placeholders = scheduleIds.map(() => "?").join(",");
  const [shiftRows] = await database.query(
    `SELECT
      CAST(s.schedule_id AS CHAR) AS schedule_id,
      sh.shift_name,
      TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
      TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time,
      DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
      s.status AS schedule_status
     FROM schedules s
     JOIN shifts sh ON s.shift_id = sh.shift_id
     WHERE s.schedule_id IN (${placeholders})`,
    scheduleIds
  );
  const [attendanceRows] = await database.query(
    `SELECT
      CAST(schedule_id AS CHAR) AS schedule_id,
      CAST(attendance_id AS CHAR) AS attendance_id,
      DATE_FORMAT(check_in, '%Y-%m-%d %H:%i:%s') AS check_in,
      DATE_FORMAT(check_out, '%Y-%m-%d %H:%i:%s') AS check_out,
      status AS attendance_status
     FROM attendance
     WHERE schedule_id IN (${placeholders})`,
    scheduleIds
  );

  const shiftByScheduleId = new Map(
    shiftRows.map((row) => [row.schedule_id, row])
  );
  const attendanceByScheduleId = new Map(
    attendanceRows.map((row) => [row.schedule_id, row])
  );

  return schedules.map((schedule) => {
    const shift = shiftByScheduleId.get(schedule.schedule_id) || {};
    const attendance = attendanceByScheduleId.get(schedule.schedule_id) || {};
    const scheduleRecord = { ...schedule, ...shift };
    const progressStatus = getAttendanceProgressStatus(scheduleRecord, attendance);
    const record = {
      ...scheduleRecord,
      attendance_id: attendance.attendance_id || null,
      check_in: attendance.check_in || null,
      check_out: attendance.check_out || null,
      attendance_status: attendance.attendance_status || null,
      progress_status: progressStatus,
    };

    return {
      ...record,
      attendance_bucket: getAttendanceBucket(record),
    };
  });
}

export async function getTodayAttendance(req, res) {
  try {
    await ensureLateRequestTable();
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

    const rows = await getAttendanceRecords(
      where,
      params,
      "ORDER BY sh.start_time ASC, e.name ASC"
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
          stats: { total: 0, on_time: 0, late: 0, missing: 0, upcoming: 0 },
        });
      }

      where += " AND s.employee_id = ?";
      params.push(employee.employee_id);
    }

    const records = await getAttendanceRecords(
      where,
      params,
      "ORDER BY s.work_date DESC, sh.start_time DESC"
    );

    const stats = records.reduce(
      (acc, record) => {
        acc.total += 1;

        if (record.attendance_bucket === "UPCOMING") {
          acc.upcoming += 1;
        } else if (!record.check_in) {
          acc.missing += 1;
        } else if (record.attendance_status === "LATE") {
          acc.late += 1;
        } else {
          acc.on_time += 1;
        }

        return acc;
      },
      { total: 0, on_time: 0, late: 0, missing: 0, upcoming: 0 }
    );

    res.json({ records, stats });
  } catch (error) {
    console.error("[getAttendanceHistory] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function markAttendance(req, res) {
  try {
    await ensureLateRequestTable();
    const user = await getCurrentUser(req.user?.user_id);

    if (!user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const employee = await getEmployeeByUserId(user.user_id);
    const { schedule_id, action } = req.body;

    if (!employee) {
      return res.status(403).json({ message: "Khong tim thay ho so nhan vien" });
    }

    if (!schedule_id || !["check_in", "check_out"].includes(action)) {
      return res.status(400).json({ message: "schedule_id va action khong hop le" });
    }

    const todaySchedules = await getTodaySchedulesForEmployee(employee.employee_id);
    const groupSchedules = findContiguousScheduleGroup(todaySchedules, schedule_id);

    if (!groupSchedules.length) {
      return res.status(404).json({ message: "Khong tim thay ca lam hom nay" });
    }

    const schedule = groupSchedules[0];
    const groupStart = groupSchedules[0].shiftStart;
    const groupEnd = groupSchedules[groupSchedules.length - 1].shiftEnd;
    const checkInOpenAt = new Date(groupStart.getTime() - 15 * 60 * 1000);
    const now = new Date();
    const scheduleIds = groupSchedules.map((item) => item.schedule_id);
    const schedulePlaceholders = scheduleIds.map(() => "?").join(",");
    const [existingRows] = await database.query(
      `SELECT * FROM attendance WHERE schedule_id IN (${schedulePlaceholders})`,
      scheduleIds
    );
    const existingByScheduleId = new Map(
      existingRows.map((row) => [Number(row.schedule_id), row])
    );

    if (action === "check_in") {
      if (existingRows.some((row) => row.check_in)) {
        return res.status(400).json({ message: "Cum ca nay da duoc cham cong vao" });
      }

      if (now < checkInOpenAt || now >= groupEnd) {
        return res.status(400).json({
          message: "Chi co the cham cong vao trong vong 15 phut truoc khi cum ca bat dau",
        });
      }

      const [approvedLateRequests] = await database.query(
        `SELECT late_until
         FROM attendance_late_requests
         WHERE employee_id = ?
           AND schedule_id IN (${schedulePlaceholders})
           AND status = 'APPROVED'
         ORDER BY late_until DESC
         LIMIT 1`,
        [employee.employee_id, ...scheduleIds]
      );
      const approvedLateUntil = approvedLateRequests[0]?.late_until
        ? new Date(approvedLateRequests[0].late_until)
        : null;
      const lateLimit = approvedLateUntil && approvedLateUntil > groupStart
        ? approvedLateUntil
        : groupStart;
      const attendanceStatus = now > lateLimit ? "LATE" : "ON_TIME";

      for (const groupSchedule of groupSchedules) {
        const existing = existingByScheduleId.get(Number(groupSchedule.schedule_id));

        if (existing) {
          await database.query(
            `UPDATE attendance
             SET check_in = ${LOCAL_NOW_SQL}, status = ?
             WHERE attendance_id = ?`,
            [attendanceStatus, existing.attendance_id]
          );
        } else {
          await database.query(
            `INSERT INTO attendance (employee_id, schedule_id, check_in, status)
             VALUES (?, ?, ${LOCAL_NOW_SQL}, ?)`,
            [employee.employee_id, groupSchedule.schedule_id, attendanceStatus]
          );
        }
      }

      await notifyAttendanceCheckIn(schedule, attendanceStatus);

      return res.json({ message: "Da ghi nhan cham cong vao", status: attendanceStatus });
    }

    if (!existingRows.length || existingRows.some((row) => !row.check_in)) {
      return res.status(400).json({ message: "Ban can cham cong vao truoc" });
    }

    if (existingRows.every((row) => row.check_out)) {
      return res.status(400).json({ message: "Cum ca nay da duoc cham cong ra" });
    }

    if (now < groupEnd) {
      return res.status(400).json({ message: "Chi co the cham cong ra khi cum ca vua ket thuc" });
    }

    await database.query(
      `UPDATE attendance
       SET check_out = ${LOCAL_NOW_SQL}
       WHERE schedule_id IN (${schedulePlaceholders})`,
      scheduleIds
    );

    res.json({ message: "Da ghi nhan cham cong ra" });
  } catch (error) {
    console.error("[markAttendance] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function requestLateAttendance(req, res) {
  try {
    await ensureLateRequestTable();
    const user = await getCurrentUser(req.user?.user_id);

    if (!user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const employee = await getEmployeeByUserId(user.user_id);
    const { schedule_id, requested_minutes, reason = "" } = req.body;

    if (!employee) {
      return res.status(403).json({ message: "Không tìm thấy hồ sơ nhân viên" });
    }

    const minutes = Number(requested_minutes);
    if (!schedule_id || !Number.isFinite(minutes) || minutes <= 0 || minutes > 240) {
      return res.status(400).json({ message: "Ca làm và số phút xin trễ không hợp lệ" });
    }

    const todaySchedules = await getTodaySchedulesForEmployee(employee.employee_id);
    const groupSchedules = findContiguousScheduleGroup(todaySchedules, schedule_id);

    if (!groupSchedules.length) {
      return res.status(404).json({ message: "Không tìm thấy ca làm hôm nay" });
    }

    const groupStart = groupSchedules[0].shiftStart;
    const now = new Date();

    if (now >= groupStart) {
      return res.status(400).json({ message: "Chỉ có thể xin trễ trước khi ca bắt đầu" });
    }

    const scheduleIds = groupSchedules.map((item) => item.schedule_id);
    const schedulePlaceholders = scheduleIds.map(() => "?").join(",");
    const [existing] = await database.query(
      `SELECT late_request_id
       FROM attendance_late_requests
       WHERE employee_id = ?
         AND schedule_id IN (${schedulePlaceholders})
         AND status = 'PENDING'
       LIMIT 1`,
      [employee.employee_id, ...scheduleIds]
    );

    if (existing.length) {
      return res.status(400).json({ message: "Bạn đã có yêu cầu xin trễ đang chờ duyệt cho cụm ca này" });
    }

    const lateUntil = new Date(groupStart.getTime() + minutes * 60 * 1000);
    const groupName = groupSchedules.map((item) => item.shift_name).join("-");
    const groupTime = `${groupSchedules[0].start_time.slice(0, 5)}-${groupSchedules[groupSchedules.length - 1].end_time.slice(0, 5)}`;
    const [result] = await database.query(
      `INSERT INTO attendance_late_requests
        (employee_id, schedule_id, requested_minutes, late_until, reason)
       VALUES (?, ?, ?, ?, ?)`,
      [
        employee.employee_id,
        groupSchedules[0].schedule_id,
        minutes,
        lateUntil,
        reason,
      ]
    );

    await notifyAdmins({
      type: "ATTENDANCE_LATE_REQUEST",
      message: `${groupSchedules[0].employee_name} xin trễ ${minutes} phút cho ${groupName} (${groupTime}) ngày ${groupSchedules[0].work_date}.`,
      refId: result.insertId,
    });

    res.json({ message: "Đã gửi yêu cầu xin trễ", request_id: result.insertId });
  } catch (error) {
    console.error("[requestLateAttendance] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function respondLateAttendance(req, res) {
  try {
    await ensureLateRequestTable();
    const user = await getCurrentUser(req.user?.user_id);

    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ message: "Bạn không có quyền xử lý yêu cầu này" });
    }

    const { id } = req.params;
    const { action } = req.body;
    const nextStatus = action === "approve" ? "APPROVED" : action === "reject" ? "REJECTED" : "";

    if (!nextStatus) {
      return res.status(400).json({ message: "Hành động không hợp lệ" });
    }

    const [requests] = await database.query(
      `SELECT lr.*, e.name AS employee_name, e.user_id, sh.shift_name,
              DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
              TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time
       FROM attendance_late_requests lr
       JOIN employees e ON lr.employee_id = e.employee_id
       JOIN schedules s ON lr.schedule_id = s.schedule_id
       JOIN shifts sh ON s.shift_id = sh.shift_id
       WHERE lr.late_request_id = ?`,
      [id]
    );
    const request = requests[0];

    if (!request) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu xin trễ" });
    }

    if (request.status !== "PENDING") {
      return res.status(400).json({ message: "Yêu cầu này đã được xử lý" });
    }

    await database.query(
      `UPDATE attendance_late_requests
       SET status = ?, decided_at = ${LOCAL_NOW_SQL}
       WHERE late_request_id = ?`,
      [nextStatus, id]
    );

    await notifyUser(
      request.user_id,
      nextStatus === "APPROVED" ? "ATTENDANCE_LATE_APPROVED" : "ATTENDANCE_LATE_REJECTED",
      nextStatus === "APPROVED"
        ? `Admin đã duyệt xin trễ ${request.requested_minutes} phút cho ca ${request.shift_name} ngày ${request.work_date}.`
        : `Admin đã từ chối xin trễ ca ${request.shift_name} ngày ${request.work_date}.`,
      id
    );

    res.json({ message: nextStatus === "APPROVED" ? "Đã duyệt xin trễ" : "Đã từ chối xin trễ" });
  } catch (error) {
    console.error("[respondLateAttendance] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

async function markAttendanceLegacy(req, res) {
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

void markAttendanceLegacy;
