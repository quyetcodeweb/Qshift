import database from "../config/db.js";
import {
  generateSchedule,
  saveDraftSchedule,
  publishScheduleService,
  getDraftSchedules,
  deleteDraftSchedule,
} from "../services/schedule.service.js";
import {
  buildScheduleExportPreview,
  createScheduleExportWorkbook,
} from "../services/scheduleExport.service.js";
import { sendUserEmail } from "../services/emailNotification.service.js";

async function ensureDraftTables() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS roles (
      role_id INT AUTO_INCREMENT PRIMARY KEY,
      role_name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      color VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS draft_schedules (
      draft_id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      month INT NOT NULL,
      year INT NOT NULL,
      created_by INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
    )
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS draft_schedule_items (
      id INT AUTO_INCREMENT PRIMARY KEY,
      draft_id INT NOT NULL,
      employee_id INT NOT NULL,
      shift_id INT NOT NULL,
      work_date DATE NOT NULL,
      role_id INT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (draft_id) REFERENCES draft_schedules(draft_id) ON DELETE CASCADE,
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
      FOREIGN KEY (shift_id) REFERENCES shifts(shift_id),
      FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE SET NULL
    )
  `);
}

async function ensureScheduleSettingsColumns() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schedule_settings (
      setting_id INT PRIMARY KEY AUTO_INCREMENT,
      balance_scheduling BOOLEAN DEFAULT FALSE,
      prefer_consecutive_shifts BOOLEAN DEFAULT FALSE,
      balance_by_workday BOOLEAN DEFAULT FALSE,
      allow_role_fallback BOOLEAN DEFAULT FALSE,
      productivity_attention BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await ensureColumnExists(
    "schedule_settings",
    "balance_by_workday",
    "BOOLEAN DEFAULT FALSE"
  );
  await ensureColumnExists(
    "schedule_settings",
    "allow_role_fallback",
    "BOOLEAN DEFAULT FALSE"
  );
  await ensureColumnExists(
    "schedule_settings",
    "productivity_attention",
    "BOOLEAN DEFAULT FALSE"
  );
}

async function ensureColumnExists(tableName, columnName, columnDefinition) {
  const [columns] = await database.query(
    `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = ?
        AND COLUMN_NAME = ?
    `,
    [tableName, columnName]
  );

  if (columns.length > 0) {
    return;
  }

  await database.query(
    `ALTER TABLE \`${tableName}\` ADD COLUMN \`${columnName}\` ${columnDefinition}`
  );
}

async function ensureScheduleNotesTable() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS schedule_notes (
      note_id INT AUTO_INCREMENT PRIMARY KEY,
      work_date DATE NOT NULL,
      title VARCHAR(255) NOT NULL,
      color VARCHAR(20) DEFAULT '#2563eb',
      created_by INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
      INDEX idx_schedule_notes_work_date (work_date)
    )
  `);
}

async function ensureSupplementalRequestTable() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS roles (
      role_id INT AUTO_INCREMENT PRIMARY KEY,
      role_name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      color VARCHAR(20),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS supplemental_shift_requests (
      request_id INT AUTO_INCREMENT PRIMARY KEY,
      shift_id INT NOT NULL,
      work_date DATE NOT NULL,
      role_id INT NULL,
      status VARCHAR(20) DEFAULT 'OPEN',
      created_by INT NULL,
      filled_by_employee_id INT NULL,
      schedule_id INT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      filled_at DATETIME NULL,
      FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE CASCADE,
      FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE SET NULL,
      FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
      FOREIGN KEY (filled_by_employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
      FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE SET NULL,
      INDEX idx_supplemental_work_date (work_date),
      INDEX idx_supplemental_status (status)
    )
  `);
}

async function getUserRole(userId) {
  const [rows] = await database.query("SELECT role FROM users WHERE user_id = ?", [
    userId,
  ]);
  return rows[0]?.role || null;
}

async function requireAdmin(userId, res, message = "Chi admin moi co quyen thuc hien") {
  const role = await getUserRole(userId);
  if (role !== "ADMIN") {
    res.status(403).json({ message });
    return false;
  }
  return true;
}

function normalizeWorkDate(value) {
  const date = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

function vietnamDateKey() {
  return new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

function getEmailTypeForScheduleNotification(type) {
  if (String(type || "").includes("SUPPLEMENTAL")) return "availability";
  if (String(type || "").includes("NOTE")) return "admin_reminder";
  return "schedule";
}

async function sendScheduleNotificationEmail(userId, type, message) {
  try {
    await sendUserEmail(userId, getEmailTypeForScheduleNotification(type), {
      subject: "Thông báo Qshift",
      text: message,
    });
  } catch (error) {
    console.warn("[email] schedule notification skipped:", error.message);
  }
}

async function ensureSupplementalRequestIsFuture(request) {
  if (request.work_date < vietnamDateKey()) {
    throw badRequest("Không thể gửi yêu cầu bổ sung cho ngày đã qua");
  }

  const [rows] = await database.query(
    `SELECT shift_name,
            TIME_FORMAT(start_time, '%H:%i') AS start_time,
            TIMESTAMP(?, start_time) <= CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00') AS is_expired
     FROM shifts
     WHERE shift_id = ?`,
    [request.work_date, request.shift_id]
  );

  if (!rows.length) {
    throw badRequest("Ca làm không tồn tại");
  }

  if (Number(rows[0].is_expired) === 1) {
    throw badRequest(
      `Không thể gửi yêu cầu bổ sung cho ${rows[0].shift_name} vì ca đã bắt đầu hoặc đã qua`
    );
  }
}

async function cancelExpiredSupplementalRequests() {
  await ensureSupplementalRequestTable();

  const [expiredRequests] = await database.query(
    `SELECT sr.request_id,
            DATE_FORMAT(sr.work_date, '%Y-%m-%d') AS work_date,
            sh.shift_name,
            TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
            TIME_FORMAT(sh.end_time, '%H:%i') AS end_time
     FROM supplemental_shift_requests sr
     JOIN shifts sh ON sr.shift_id = sh.shift_id
     WHERE sr.status = 'OPEN'
       AND TIMESTAMP(sr.work_date, sh.start_time) <= CONVERT_TZ(UTC_TIMESTAMP(), '+00:00', '+07:00')
     ORDER BY sr.work_date ASC, sh.start_time ASC`
  );

  if (!expiredRequests.length) {
    return 0;
  }

  const ids = expiredRequests.map((request) => request.request_id);
  const placeholders = ids.map(() => "?").join(",");
  await database.query(
    `UPDATE supplemental_shift_requests
     SET status = 'CANCELLED_EXPIRED'
     WHERE request_id IN (${placeholders}) AND status = 'OPEN'`,
    ids
  );

  const preview = expiredRequests
    .slice(0, 5)
    .map(
      (request) =>
        `${request.shift_name} (${request.start_time} - ${request.end_time}) ngày ${request.work_date}`
    )
    .join("; ");
  const suffix =
    expiredRequests.length > 5 ? ` và ${expiredRequests.length - 5} yêu cầu khác` : "";

  await notifyAdmins(
    `Đã tự động hủy ${expiredRequests.length} yêu cầu đăng ký bổ sung vì đã qua thời gian ca làm: ${preview}${suffix}.`,
    "SUPPLEMENTAL_SHIFT_EXPIRED",
    ids[0] || null
  );

  return expiredRequests.length;
}

async function notifyEmployees(message, type, refId = null) {
  const [employees] = await database.query(
    "SELECT user_id FROM employees WHERE user_id IS NOT NULL"
  );

  for (const employee of employees) {
    await database.query(
      `INSERT INTO notifications (user_id, message, type, ref_id)
       VALUES (?, ?, ?, ?)`,
      [employee.user_id, message, type, refId]
    );
    await sendScheduleNotificationEmail(employee.user_id, type, message);
  }
}

async function notifyAdmins(message, type, refId = null) {
  const [admins] = await database.query("SELECT user_id FROM users WHERE role = 'ADMIN'");

  for (const admin of admins) {
    await database.query(
      `INSERT INTO notifications (user_id, message, type, ref_id)
       VALUES (?, ?, ?, ?)`,
      [admin.user_id, message, type, refId]
    );
    await sendScheduleNotificationEmail(admin.user_id, type, message);
  }
}

async function createSupplementalRequests({
  requests,
  userId,
  notify = true,
  connection = database,
}) {
  await ensureSupplementalRequestTable();

  const normalizedRequests = (Array.isArray(requests) ? requests : [])
    .map((request) => ({
      shift_id: Number(request.shift_id),
      work_date: normalizeWorkDate(request.work_date),
      role_id: request.role_id ? Number(request.role_id) : null,
      count: Math.max(1, Number(request.count) || 1),
    }))
    .filter((request) => request.shift_id > 0 && request.work_date);

  for (const request of normalizedRequests) {
    await ensureSupplementalRequestIsFuture(request);
  }

  let created = 0;
  const createdIds = [];

  for (const request of normalizedRequests) {
    for (let index = 0; index < request.count; index += 1) {
      const [result] = await connection.query(
        `INSERT INTO supplemental_shift_requests (shift_id, work_date, role_id, created_by)
         VALUES (?, ?, ?, ?)`,
        [request.shift_id, request.work_date, request.role_id, userId]
      );
      created += 1;
      createdIds.push(result.insertId);
    }
  }

  if (notify && created > 0) {
    const dates = [...new Set(normalizedRequests.map((request) => request.work_date))]
      .sort()
      .join(", ");
    await notifyEmployees(
      `Có ${created} yêu cầu đăng ký bổ sung lịch làm (${dates}).`,
      "SUPPLEMENTAL_SHIFT_REQUEST",
      createdIds[0] || null
    );
  }

  return { created, createdIds };
}

export async function autoGenerate(req, res) {
  try {
    const {
      month,
      year,
      shifts,
      constraints,
      detailed_requirements,
      availability,
      role_requirements,
      scheduling_settings,
    } = req.body;
    const userId = req.user?.user_id;

    console.log("[autoGenerate] Input:", { month, year, shifts, constraints, detailedReqs: !!detailed_requirements, availabilityKeys: availability ? Object.keys(availability).length : 0 });
    console.log("[autoGenerate] Shifts count:", shifts?.length);
    if (shifts && shifts.length > 0) {
      console.log("[autoGenerate] Sample shifts:", JSON.stringify(shifts.slice(0, 3), null, 2));
    }
    
    console.log("[autoGenerate] Detailed requirements keys:", Object.keys(detailed_requirements || {}).length);
    if (detailed_requirements) {
      const sampleDates = Object.keys(detailed_requirements).slice(0, 3);
      console.log("[autoGenerate] Sample dates and config:", JSON.stringify(
        sampleDates.reduce((acc, date) => {
          acc[date] = detailed_requirements[date];
          return acc;
        }, {}),
        null,
        2
      ));
    }

    // Validate admin role
    const [admins] = await database.query(
      "SELECT role FROM users WHERE user_id = ?",
      [userId]
    );

    if (!admins.length || admins[0].role !== "ADMIN") {
      return res.status(403).json({ message: "Chỉ admin có thể tạo lịch" });
    }

    // Generate schedule
    const schedule = await generateSchedule({
      month,
      year,
      shifts,
      constraints,
      detailed_requirements,
      availability,
      role_requirements,
      scheduling_settings,
    });

    console.log("[autoGenerate] Generated:", {
      success: true,
      totalShifts: schedule.generated_shifts.length,
    });
    
    if (schedule.generated_shifts && schedule.generated_shifts.length > 0) {
      console.log("[autoGenerate] Sample generated shifts:", JSON.stringify(schedule.generated_shifts.slice(0, 3), null, 2));
    }

    res.json(schedule);
  } catch (error) {
    console.error("[autoGenerate] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function saveDraft(req, res) {
  try {
    const { month, year, shifts } = req.body;
    const userId = req.user?.user_id;

    console.log("[saveDraft] Saving", shifts.length, "shifts");

    const result = await saveDraftSchedule({
      month,
      year,
      shifts,
    });

    console.log("[saveDraft] Saved successfully");
    res.json(result);
  } catch (error) {
    console.error("[saveDraft] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function publishSchedule(req, res) {
  try {
    const { month, year, shifts, schedule_id, supplemental_requests } = req.body;
    const userId = req.user?.user_id;

    console.log("[publishSchedule] Publishing schedule");
    console.log("[publishSchedule] Input - month:", month, "year:", year);
    console.log("[publishSchedule] Input - shifts count:", shifts?.length || 0);
    console.log("[publishSchedule] Input - shifts dates (first 5):", shifts?.slice(0, 5).map(s => s.work_date) || []);

    const result = await publishScheduleService({
      month,
      year,
      shifts,
      schedule_id,
    });

    const supplementalResult = await createSupplementalRequests({
      requests: supplemental_requests,
      userId,
      notify: Array.isArray(supplemental_requests) && supplemental_requests.length > 0,
    });

    console.log("[publishSchedule] Published successfully");

    // Debug: Check what was actually inserted
    const [checkSchedules] = await database.query(
      `SELECT 
        COUNT(*) as total,
        GROUP_CONCAT(DISTINCT DATE_FORMAT(work_date, '%Y-%m-%d')) as dates,
        GROUP_CONCAT(DISTINCT status) as statuses
      FROM schedules
      WHERE YEAR(work_date) = ? AND MONTH(work_date) = ? AND status = 'PUBLISHED'`,
      [year, month]
    );
    console.log("[publishSchedule] After publishing - schedules for month:", JSON.stringify(checkSchedules?.[0], null, 2));

    // Send notifications to all employees
    const [employees] = await database.query(
      "SELECT user_id FROM employees"
    );

    for (const emp of employees) {
      await database.query(
        `INSERT INTO notifications (user_id, type, message, ref_id)
         VALUES (?, ?, ?, ?)`,
        [
          emp.user_id,
          "SCHEDULE_PUBLISHED",
          `Lịch làm việc cho tháng ${month}/${year} đã được công bố`,
          null,
        ]
      );
      await sendScheduleNotificationEmail(
        emp.user_id,
        "SCHEDULE_PUBLISHED",
        `Lịch làm việc cho tháng ${month}/${year} đã được công bố`
      );
    }

    res.json({
      ...result,
      supplemental_requests_created: supplementalResult.created,
    });
  } catch (error) {
    console.error("[publishSchedule] Error:", error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}

export async function getScheduleExportPreview(req, res) {
  try {
    const preview = await buildScheduleExportPreview(req.body || {});
    res.json(preview);
  } catch (error) {
    console.error("[getScheduleExportPreview] Error:", error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}

export async function exportScheduleWorkbook(req, res) {
  try {
    const preview = await buildScheduleExportPreview(req.body || {});
    const workbook = await createScheduleExportWorkbook(preview);
    const startDate = preview.startDate || "schedule";
    const endDate = preview.endDate || startDate;
    const fileName = `bang-phan-cong_${startDate}_den_${endDate}.xlsx`;

    res
      .status(200)
      .set({
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(workbook.length),
        "Cache-Control": "no-store",
      })
      .send(workbook);
  } catch (error) {
    console.error("[exportScheduleWorkbook] Error:", error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}

export async function getCurrentSchedules(req, res) {
  try {
    const userId = req.user?.user_id;

    let { month, year, scope, startDate, endDate } = req.query;
    startDate =
      typeof startDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(startDate)
        ? startDate
        : null;
    endDate =
      typeof endDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(endDate)
        ? endDate
        : null;
    const hasDateRange = Boolean(startDate || endDate);

    const allMonths = month === "all" || hasDateRange;
    const allYears = year === "all" || hasDateRange;
    month = allMonths ? null : parseInt(month);
    year = allYears ? null : parseInt(year);

    if ((!month && !allMonths) || (!year && !allYears)) {
      const now = new Date();
      month = month || now.getMonth() + 1;
      year = year || now.getFullYear();
    }

    console.log("[getCurrentSchedules] User:", userId, "Requesting:", {
      month,
      year,
      scope,
      startDate,
      endDate,
    });

    const [userRole] = await database.query(
      "SELECT role FROM users WHERE user_id = ?",
      [userId]
    );

    const scheduleFilters = {
      month: allMonths ? null : month,
      year: allYears ? null : year,
      startDate,
      endDate,
    };
    let schedules;

    if (userRole?.[0]?.role === "ADMIN" || scope === "all") {
      console.log("[getCurrentSchedules] Shared access - fetching all schedules");
      schedules = await getSchedulesByFilters(scheduleFilters);
    } else {
      console.log("[getCurrentSchedules] EMPLOYEE access - fetching personal schedules");
      const [employee] = await database.query(
        "SELECT employee_id FROM employees WHERE user_id = ?",
        [userId]
      );

      if (!employee.length) {
        console.log("[getCurrentSchedules] No employee record found");
        return res.json([]);
      }

      schedules = await getSchedulesByFilters({
        ...scheduleFilters,
        employeeId: employee[0].employee_id,
      });
    }

    console.log("[getCurrentSchedules] Returning", schedules.length, "schedules");
    if (schedules.length > 0) {
      console.log("[getCurrentSchedules] Sample:", JSON.stringify(schedules[0], null, 2));
    }
    res.json(schedules);
  } catch (error) {
    console.error("[getCurrentSchedules] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getScheduleNotes(req, res) {
  try {
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(401).json({ message: "Invalid user" });
    }

    await ensureScheduleNotesTable();

    const conditions = [];
    const params = [];

    if (req.query.startDate) {
      conditions.push("work_date >= ?");
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      conditions.push("work_date <= ?");
      params.push(req.query.endDate);
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const [rows] = await database.query(
      `SELECT note_id,
              DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date,
              title,
              color,
              DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at
       FROM schedule_notes
       ${whereClause}
       ORDER BY work_date ASC, created_at ASC`,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error("[getScheduleNotes] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function createScheduleNote(req, res) {
  try {
    const userId = req.user?.user_id;
    const [admins] = await database.query(
      "SELECT role FROM users WHERE user_id = ?",
      [userId]
    );

    if (!admins.length || admins[0].role !== "ADMIN") {
      return res.status(403).json({ message: "Chỉ admin có thể gửi thông báo lịch" });
    }

    await ensureScheduleNotesTable();

    const dates = Array.isArray(req.body.dates)
      ? [...new Set(req.body.dates.map((date) => String(date).slice(0, 10)).filter(Boolean))]
      : [];
    const title = String(req.body.title || "").trim();
    const color = /^#[0-9a-f]{6}$/i.test(String(req.body.color || ""))
      ? String(req.body.color)
      : "#2563eb";

    if (!dates.length || !title) {
      return res.status(400).json({ message: "Ngày và nội dung thông báo là bắt buộc" });
    }

    for (const workDate of dates) {
      await database.query(
        `INSERT INTO schedule_notes (work_date, title, color, created_by)
         VALUES (?, ?, ?, ?)`,
        [workDate, title, color, userId]
      );
    }

    const [employees] = await database.query("SELECT user_id FROM employees WHERE user_id IS NOT NULL");
    for (const employee of employees) {
      await database.query(
        `INSERT INTO notifications (user_id, message, type, ref_id)
         VALUES (?, ?, 'SCHEDULE_NOTE', NULL)`,
        [employee.user_id, `Thông báo lịch: ${title} (${dates.join(", ")})`]
      );
      await sendScheduleNotificationEmail(
        employee.user_id,
        "SCHEDULE_NOTE",
        `Thông báo lịch: ${title} (${dates.join(", ")})`
      );
    }

    res.json({ message: "Đã gửi thông báo lịch", count: dates.length });
  } catch (error) {
    console.error("[createScheduleNote] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getSupplementalRequests(req, res) {
  try {
    await ensureSupplementalRequestTable();
    await cancelExpiredSupplementalRequests();

    const conditions = ["sr.status = 'OPEN'"];
    const params = [];

    if (req.query.startDate) {
      conditions.push("sr.work_date >= ?");
      params.push(req.query.startDate);
    }
    if (req.query.endDate) {
      conditions.push("sr.work_date <= ?");
      params.push(req.query.endDate);
    }

    const [rows] = await database.query(
      `SELECT sr.request_id,
              sr.shift_id,
              sh.shift_name,
              sh.color,
              TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
              TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time,
              DATE_FORMAT(sr.work_date, '%Y-%m-%d') AS work_date,
              sr.role_id,
              r.role_name,
              sr.status
       FROM supplemental_shift_requests sr
       JOIN shifts sh ON sr.shift_id = sh.shift_id
       LEFT JOIN roles r ON sr.role_id = r.role_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY sr.work_date ASC, sh.start_time ASC, sr.request_id ASC`,
      params
    );

    res.json(rows);
  } catch (error) {
    console.error("[getSupplementalRequests] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function createSupplementalRequest(req, res) {
  try {
    await cancelExpiredSupplementalRequests();

    const userId = req.user?.user_id;
    const isAdmin = await requireAdmin(
      userId,
      res,
      "Chỉ admin có thể tạo yêu cầu đăng ký bổ sung"
    );
    if (!isAdmin) return;

    const requests = Array.isArray(req.body.requests)
      ? req.body.requests
      : [
          {
            shift_id: req.body.shift_id,
            work_date: req.body.work_date,
            role_id: req.body.role_id,
            count: req.body.count,
          },
        ];

    const result = await createSupplementalRequests({
      requests,
      userId,
      notify: true,
    });

    if (result.created === 0) {
      return res.status(400).json({ message: "Ngày và ca làm là bắt buộc" });
    }

    res.json({
      message: "Đã tạo yêu cầu đăng ký bổ sung",
      count: result.created,
    });
  } catch (error) {
    console.error("[createSupplementalRequest] Error:", error);
    res.status(error.statusCode || 500).json({ message: error.message });
  }
}

export async function acceptSupplementalRequest(req, res) {
  try {
    await cancelExpiredSupplementalRequests();

    const userId = req.user?.user_id;
    const role = await getUserRole(userId);

    if (role === "ADMIN") {
      return res.status(403).json({ message: "Admin không thể đăng ký bổ sung" });
    }

    const [employees] = await database.query(
      "SELECT employee_id, name, user_id FROM employees WHERE user_id = ?",
      [userId]
    );
    if (!employees.length) {
      return res.status(404).json({ message: "Không tìm thấy nhân viên" });
    }

    await ensureSupplementalRequestTable();
    const requestId = Number(req.params.id);
    const connection = await database.getConnection();

    try {
      await connection.beginTransaction();

      const [requests] = await connection.query(
        `SELECT sr.request_id,
                sr.shift_id,
                sr.role_id,
                DATE_FORMAT(sr.work_date, '%Y-%m-%d') AS work_date,
                sr.status,
                sh.shift_name,
                TIME_FORMAT(sh.start_time, '%H:%i') AS start_time,
                TIME_FORMAT(sh.end_time, '%H:%i') AS end_time
         FROM supplemental_shift_requests sr
         JOIN shifts sh ON sr.shift_id = sh.shift_id
         WHERE sr.request_id = ?
         FOR UPDATE`,
        [requestId]
      );

      const request = requests[0];
      if (!request || request.status !== "OPEN") {
        await connection.rollback();
        return res.status(400).json({ message: "Yeu cau nay khong con mo" });
      }

      const employee = employees[0];
      const [existing] = await connection.query(
        `SELECT schedule_id
         FROM schedules
         WHERE employee_id = ? AND shift_id = ? AND work_date = ? AND status = 'PUBLISHED'`,
        [employee.employee_id, request.shift_id, request.work_date]
      );

      if (existing.length) {
        await connection.rollback();
        return res.status(400).json({ message: "Ban da co ca lam nay" });
      }

      const [inserted] = await connection.query(
        `INSERT INTO schedules (employee_id, shift_id, work_date, role_id, status)
         VALUES (?, ?, ?, ?, 'PUBLISHED')`,
        [
          employee.employee_id,
          request.shift_id,
          request.work_date,
          request.role_id || null,
        ]
      );

      await connection.query(
        `UPDATE supplemental_shift_requests
         SET status = 'FILLED',
             filled_by_employee_id = ?,
             schedule_id = ?,
             filled_at = NOW()
         WHERE request_id = ?`,
        [employee.employee_id, inserted.insertId, requestId]
      );

      await connection.commit();

      const shiftText = `${request.shift_name} (${request.start_time} - ${request.end_time})`;
      await database.query(
        `INSERT INTO notifications (user_id, message, type, ref_id)
         VALUES (?, ?, 'SUPPLEMENTAL_SHIFT_ACCEPTED', ?)`,
        [
          employee.user_id,
          `Bạn đã đăng ký bổ sung ${shiftText} ngày ${request.work_date}.`,
          requestId,
        ]
      );
      await notifyAdmins(
        `${employee.name} đã đăng ký bổ sung ${shiftText} ngày ${request.work_date}.`,
        "SUPPLEMENTAL_SHIFT_ACCEPTED",
        requestId
      );

      res.json({
        message: "Đã đăng ký bổ sung ca làm",
        schedule_id: inserted.insertId,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[acceptSupplementalRequest] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function deleteSupplementalRequest(req, res) {
  try {
    const userId = req.user?.user_id;
    const isAdmin = await requireAdmin(
      userId,
      res,
      "Chỉ admin có thể xóa yêu cầu đăng ký bổ sung"
    );
    if (!isAdmin) return;

    await ensureSupplementalRequestTable();
    const requestId = Number(req.params.id);

    const [result] = await database.query(
      `UPDATE supplemental_shift_requests
       SET status = 'CANCELLED'
       WHERE request_id = ? AND status = 'OPEN'`,
      [requestId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu mở" });
    }

    res.json({ message: "Đã xóa yêu cầu đăng ký bổ sung" });
  } catch (error) {
    console.error("[deleteSupplementalRequest] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

async function getSchedulesByFilters({
  employeeId,
  month,
  year,
  startDate,
  endDate,
}) {
  const conditions = [];
  const params = [];

  if (employeeId) {
    conditions.push("s.employee_id = ?");
    params.push(employeeId);
  }

  if (month) {
    conditions.push("MONTH(s.work_date) = ?");
    params.push(month);
  }

  if (year) {
    conditions.push("YEAR(s.work_date) = ?");
    params.push(year);
  }

  if (startDate) {
    conditions.push("s.work_date >= ?");
    params.push(startDate);
  }

  if (endDate) {
    conditions.push("s.work_date <= ?");
    params.push(endDate);
  }

  const whereClause = conditions.length
    ? `WHERE ${conditions.join(" AND ")}`
    : "";

  const [schedules] = await database.query(
    `SELECT 
      s.schedule_id,
      s.employee_id,
      e.name as employee_name,
      s.shift_id,
      sh.shift_name,
      sh.color,
      TIME_FORMAT(sh.start_time, '%H:%i:%s') as start_time,
      TIME_FORMAT(sh.end_time, '%H:%i:%s') as end_time,
      DATE_FORMAT(s.work_date, '%Y-%m-%d') as work_date,
      s.status
    FROM schedules s
    LEFT JOIN employees e ON s.employee_id = e.employee_id
    LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
    ${whereClause}
    ORDER BY s.work_date ASC, sh.start_time ASC`,
    params
  );

  return schedules;
}

export async function getAvailability(req, res) {
  try {
    const { month, year } = req.params;

    if (!month || !year) {
      return res.status(400).json({ message: "Month and year are required" });
    }

    const numMonth = parseInt(month);
    const numYear = parseInt(year);

    console.log("[getAvailability] Fetching availability for", `${numMonth}/${numYear}`);

    // Get all availability records for this month/year
    const [availability] = await database.query(
      `SELECT DISTINCT 
        ea.employee_id,
        e.name as employee_name,
        ea.shift_id,
        sh.shift_name,
        DATE_FORMAT(ea.work_date, '%Y-%m-%d') as work_date
      FROM employee_availability ea
      LEFT JOIN employees e ON ea.employee_id = e.employee_id
      LEFT JOIN shifts sh ON ea.shift_id = sh.shift_id
      WHERE MONTH(ea.work_date) = ? AND YEAR(ea.work_date) = ?
      ORDER BY ea.work_date, ea.employee_id, ea.shift_id`,
      [numMonth, numYear]
    );

    console.log("[getAvailability] Found", availability.length, "availability records");

    // Format the availability data to match what generateSchedule expects
    const formatted = {};
    availability.forEach(record => {
      const { employee_id, shift_id, work_date } = record;
      
      if (!formatted[employee_id]) {
        formatted[employee_id] = {};
      }
      
      if (!formatted[employee_id][work_date]) {
        formatted[employee_id][work_date] = [];
      }
      
      formatted[employee_id][work_date].push(shift_id);
    });

    res.json({
      availability: formatted,
      raw_records: availability,
      count: availability.length
    });
  } catch (error) {
    console.error("[getAvailability] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getDrafts(req, res) {
  try {
    const drafts = await getDraftSchedules();
    console.log("[getDrafts] Found", drafts.length, "drafts");
    res.json(drafts);
  } catch (error) {
    console.error("[getDrafts] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function deleteDraft(req, res) {
  try {
    const { id } = req.params;
    console.log("[deleteDraft] Deleting draft", id);

    await deleteDraftSchedule(id);

    res.json({ message: "Đã xóa bản nháp" });
  } catch (error) {
    console.error("[deleteDraft] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getEmployeeStats(req, res) {
  try {
    const { startDate, endDate } = req.query;

    console.log("[getEmployeeStats] Fetching stats for range:", { startDate, endDate });

    // Build query based on date range
    let joinCondition = "s.status = 'PUBLISHED'";
    const params = [];

    if (startDate && endDate) {
      joinCondition += " AND s.work_date BETWEEN ? AND ?";
      params.push(startDate, endDate);
    }

    const query = `
      SELECT 
        e.employee_id,
        e.name,
        e.email,
        COUNT(CASE WHEN s.schedule_id IS NOT NULL THEN 1 END) as total_shifts,
        SUM(CASE WHEN sh.end_time IS NOT NULL THEN TIME_TO_SEC(TIMEDIFF(sh.end_time, sh.start_time)) / 3600 ELSE 0 END) as total_hours,
        MIN(s.work_date) as first_shift_date,
        MAX(s.work_date) as last_shift_date
      FROM employees e
      LEFT JOIN schedules s ON e.employee_id = s.employee_id AND ${joinCondition}
      LEFT JOIN shifts sh ON s.shift_id = sh.shift_id
      GROUP BY e.employee_id, e.name, e.email
      ORDER BY total_shifts DESC, COALESCE(total_hours, 0) DESC
    `;

    console.log("[getEmployeeStats] Query:", query);
    console.log("[getEmployeeStats] Params:", params);

    const [stats] = await database.query(query, params);

    console.log("[getEmployeeStats] Found", stats.length, "employees");
    console.log("[getEmployeeStats] Sample:", stats.slice(0, 3));

    res.json({
      stats: stats.map((stat) => ({
        employee_id: stat.employee_id,
        name: stat.name,
        email: stat.email,
        total_shifts: stat.total_shifts || 0,
        total_hours: Number(stat.total_hours || 0).toFixed(2),
        first_shift_date: stat.first_shift_date,
        last_shift_date: stat.last_shift_date,
      })),
      count: stats.length,
    });
  } catch (error) {
    console.error("[getEmployeeStats] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function saveDraftWithName(req, res) {
  try {
    const { name, month, year, shifts } = req.body;
    const userId = req.user?.user_id;

    if (!name || !shifts) {
      return res.status(400).json({ message: "name and shifts are required" });
    }

    console.log(`[saveDraftWithName] Saving draft "${name}" with ${shifts.length} shifts`);
    await ensureDraftTables();

    const connection = await database.getConnection();

    try {
      await connection.beginTransaction();

      // Create draft record
      const [draftResult] = await connection.query(
        `INSERT INTO draft_schedules (name, month, year, created_by)
         VALUES (?, ?, ?, ?)`,
        [name, month, year, userId]
      );

      const draftId = draftResult.insertId;
      console.log(`[saveDraftWithName] Created draft with ID: ${draftId}`);

      // Insert draft items
      for (const shift of shifts) {
        const {
          employee_id,
          shift_id,
          work_date,
          role_id = null,
        } = shift;

        await connection.query(
          `INSERT INTO draft_schedule_items (draft_id, employee_id, shift_id, work_date, role_id)
           VALUES (?, ?, ?, ?, ?)`,
          [draftId, employee_id, shift_id, work_date, role_id]
        );
      }

      await connection.commit();
      console.log("[saveDraftWithName] Saved successfully");

      res.json({
        draft_id: draftId,
        name,
        message: "Bản nháp đã được lưu",
        count: shifts.length,
      });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[saveDraftWithName] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getDraftsList(req, res) {
  try {
    await ensureDraftTables();

    const [drafts] = await database.query(
      `SELECT 
        ds.draft_id,
        ds.name,
        ds.month,
        ds.year,
        COUNT(dsi.id) as shift_count,
        ds.created_at,
        u.username as created_by
      FROM draft_schedules ds
      LEFT JOIN draft_schedule_items dsi ON ds.draft_id = dsi.draft_id
      LEFT JOIN users u ON ds.created_by = u.user_id
      GROUP BY ds.draft_id
      ORDER BY ds.created_at DESC`
    );

    console.log("[getDraftsList] Found", drafts.length, "drafts");

    res.json(drafts);
  } catch (error) {
    console.error("[getDraftsList] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getDraftDetail(req, res) {
  try {
    await ensureDraftTables();

    const { draft_id } = req.params;

    const [draft] = await database.query(
      `SELECT * FROM draft_schedules WHERE draft_id = ?`,
      [draft_id]
    );

    if (!draft.length) {
      return res.status(404).json({ message: "Draft not found" });
    }

    const [items] = await database.query(
      `SELECT 
        dsi.id,
        dsi.draft_id,
        dsi.employee_id,
        e.name as employee_name,
        dsi.shift_id,
        sh.shift_name,
        TIME_FORMAT(sh.start_time, '%H:%i:%s') as start_time,
        TIME_FORMAT(sh.end_time, '%H:%i:%s') as end_time,
        dsi.work_date,
        dsi.role_id,
        r.role_name
      FROM draft_schedule_items dsi
      LEFT JOIN employees e ON dsi.employee_id = e.employee_id
      LEFT JOIN shifts sh ON dsi.shift_id = sh.shift_id
      LEFT JOIN roles r ON dsi.role_id = r.role_id
      WHERE dsi.draft_id = ?
      ORDER BY dsi.work_date, dsi.shift_id`,
      [draft_id]
    );

    console.log("[getDraftDetail] Got draft", draft_id, "with", items.length, "items");

    res.json({
      draft: draft[0],
      items,
    });
  } catch (error) {
    console.error("[getDraftDetail] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function updateDraftByName(req, res) {
  try {
    await ensureDraftTables();

    const { draft_id } = req.params;
    const { name, month, year, shifts } = req.body;

    if (!name || !month || !year || !Array.isArray(shifts)) {
      return res.status(400).json({ message: "name, month, year, shifts are required" });
    }

    const connection = await database.getConnection();

    try {
      await connection.beginTransaction();

      const [existing] = await connection.query(
        "SELECT draft_id FROM draft_schedules WHERE draft_id = ?",
        [draft_id]
      );

      if (!existing.length) {
        await connection.rollback();
        return res.status(404).json({ message: "Draft not found" });
      }

      await connection.query(
        `UPDATE draft_schedules
         SET name = ?, month = ?, year = ?
         WHERE draft_id = ?`,
        [name, month, year, draft_id]
      );

      await connection.query(
        "DELETE FROM draft_schedule_items WHERE draft_id = ?",
        [draft_id]
      );

      for (const shift of shifts) {
        const {
          employee_id,
          shift_id,
          work_date,
          role_id = null,
        } = shift;

        if (!employee_id || !shift_id || !work_date) {
          continue;
        }

        await connection.query(
          `INSERT INTO draft_schedule_items (draft_id, employee_id, shift_id, work_date, role_id)
           VALUES (?, ?, ?, ?, ?)`,
          [draft_id, employee_id, shift_id, String(work_date).slice(0, 10), role_id || null]
        );
      }

      await connection.commit();
      res.json({ message: "Bản nháp đã được cập nhật", count: shifts.length });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[updateDraftByName] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function deleteDraftByName(req, res) {
  try {
    await ensureDraftTables();

    const { draft_id } = req.params;

    console.log("[deleteDraftByName] Deleting draft", draft_id);

    await database.query(
      `DELETE FROM draft_schedules WHERE draft_id = ?`,
      [draft_id]
    );

    res.json({ message: "Đã xóa bản nháp" });
  } catch (error) {
    console.error("[deleteDraftByName] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function createSingleSchedule(req, res) {
  try {
    const { employee_id, shift_id, work_date, status = "PUBLISHED" } = req.body;
    const userId = req.user?.user_id;

    // Validate admin role
    const [admins] = await database.query(
      "SELECT role FROM users WHERE user_id = ?",
      [userId]
    );

    if (!admins.length || admins[0].role !== "ADMIN") {
      return res.status(403).json({ message: "Chỉ admin có thể tạo lịch" });
    }

    if (!employee_id || !shift_id || !work_date) {
      return res.status(400).json({ message: "employee_id, shift_id, và work_date là bắt buộc" });
    }

    const scheduleStatus = status === "DRAFT" ? "DRAFT" : "PUBLISHED";

    console.log("[createSingleSchedule] Creating schedule:", {
      employee_id,
      shift_id,
      work_date,
      status: scheduleStatus,
    });

    if (scheduleStatus === "PUBLISHED") {
      await database.query(
        `DELETE FROM schedules
         WHERE employee_id = ? AND shift_id = ? AND work_date = ? AND status = 'DRAFT'`,
        [employee_id, shift_id, work_date]
      );
    }

    const [result] = await database.query(
      `INSERT INTO schedules (employee_id, shift_id, work_date, status)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status)`,
      [employee_id, shift_id, work_date, scheduleStatus]
    );

    res.json({
      message: "Đã thêm ca làm thành công",
      schedule_id: result.insertId || result.affectedRows,
    });
  } catch (error) {
    console.error("[createSingleSchedule] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function updateSingleSchedule(req, res) {
  try {
    const { id } = req.params;
    const { employee_id, shift_id, work_date, status = "PUBLISHED" } = req.body;
    const userId = req.user?.user_id;

    // Validate admin role
    const [admins] = await database.query(
      "SELECT role FROM users WHERE user_id = ?",
      [userId]
    );

    if (!admins.length || admins[0].role !== "ADMIN") {
      return res.status(403).json({ message: "Chỉ admin có thể cập nhật lịch" });
    }

    console.log("[updateSingleSchedule] Updating schedule", id, ":", { employee_id, shift_id, work_date });

    const scheduleStatus = status === "DRAFT" ? "DRAFT" : "PUBLISHED";
    const [result] = await database.query(
      `UPDATE schedules 
       SET employee_id = ?, shift_id = ?, work_date = ?, status = ?
       WHERE schedule_id = ?`,
      [employee_id, shift_id, work_date, scheduleStatus, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy ca làm" });
    }

    res.json({ message: "Đã cập nhật ca làm thành công" });
  } catch (error) {
    console.error("[updateSingleSchedule] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function deleteSingleSchedule(req, res) {
  try {
    const { id } = req.params;
    const userId = req.user?.user_id;

    // Validate admin role
    const [admins] = await database.query(
      "SELECT role FROM users WHERE user_id = ?",
      [userId]
    );

    if (!admins.length || admins[0].role !== "ADMIN") {
      return res.status(403).json({ message: "Chỉ admin có thể xóa lịch" });
    }

    console.log("[deleteSingleSchedule] Deleting schedule", id);

    const [result] = await database.query(
      `DELETE FROM schedules WHERE schedule_id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: "Không tìm thấy ca làm" });
    }

    res.json({ message: "Đã xóa ca làm thành công" });
  } catch (error) {
    console.error("[deleteSingleSchedule] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getScheduleSettings(req, res) {
  try {
    const userId = req.user?.user_id;

    // Validate admin role
    const [admins] = await database.query(
      "SELECT role FROM users WHERE user_id = ?",
      [userId]
    );

    if (!admins.length || admins[0].role !== "ADMIN") {
      return res.status(403).json({ message: "Chỉ admin có thể xem cài đặt" });
    }

    await ensureScheduleSettingsColumns();

    const [settings] = await database.query(
      `SELECT * FROM schedule_settings LIMIT 1`
    );

    if (settings.length === 0) {
      return res.json({
        balance_scheduling: false,
        prefer_consecutive_shifts: false,
        balance_by_workday: false,
        allow_role_fallback: false,
        productivity_attention: false,
      });
    }

    res.json({
      balance_scheduling: settings[0].balance_scheduling || false,
      prefer_consecutive_shifts: settings[0].prefer_consecutive_shifts || false,
      balance_by_workday: settings[0].balance_by_workday || false,
      allow_role_fallback: settings[0].allow_role_fallback || false,
      productivity_attention: settings[0].productivity_attention || false,
    });
  } catch (error) {
    console.error("[getScheduleSettings] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function saveScheduleSettings(req, res) {
  try {
    const {
      balance_scheduling,
      prefer_consecutive_shifts,
      balance_by_workday,
      allow_role_fallback,
      productivity_attention,
    } = req.body;
    const balanceByWorkday = balance_by_workday ?? false;
    const allowRoleFallback = allow_role_fallback ?? false;
    const productivityAttention = productivity_attention ?? false;
    const userId = req.user?.user_id;

    // Validate admin role
    const [admins] = await database.query(
      "SELECT role FROM users WHERE user_id = ?",
      [userId]
    );

    if (!admins.length || admins[0].role !== "ADMIN") {
      return res.status(403).json({ message: "Chỉ admin có thể lưu cài đặt" });
    }

    await ensureScheduleSettingsColumns();

    console.log("[saveScheduleSettings] Saving settings:", {
      balance_scheduling,
      prefer_consecutive_shifts,
      balance_by_workday: balanceByWorkday,
      allow_role_fallback: allowRoleFallback,
      productivity_attention: productivityAttention,
    });

    // Check if settings exist
    const [existing] = await database.query(
      `SELECT * FROM schedule_settings LIMIT 1`
    );

    if (existing.length === 0) {
      await database.query(
        `INSERT INTO schedule_settings (balance_scheduling, prefer_consecutive_shifts, balance_by_workday, allow_role_fallback, productivity_attention)
         VALUES (?, ?, ?, ?, ?)`,
        [
          balance_scheduling,
          prefer_consecutive_shifts,
          balanceByWorkday,
          allowRoleFallback,
          productivityAttention,
        ]
      );
    } else {
      await database.query(
        `UPDATE schedule_settings SET balance_scheduling = ?, prefer_consecutive_shifts = ?, balance_by_workday = ?, allow_role_fallback = ?, productivity_attention = ?`,
        [
          balance_scheduling,
          prefer_consecutive_shifts,
          balanceByWorkday,
          allowRoleFallback,
          productivityAttention,
        ]
      );
    }

    res.json({ message: "Cài đặt đã được lưu thành công" });
  } catch (error) {
    console.error("[saveScheduleSettings] Error:", error);
    res.status(500).json({ message: error.message });
  }
}
