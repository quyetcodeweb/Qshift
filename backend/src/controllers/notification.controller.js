import db from "../config/db.js";
import { sendFillRequestToEmployees } from "../services/availability.service.js";

async function ensureLateRequestTable() {
  await db.query(
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

let lateRequestTablePromise = null;

function ensureLateRequestTableOnce() {
  if (!lateRequestTablePromise) {
    lateRequestTablePromise = ensureLateRequestTable().catch((error) => {
      lateRequestTablePromise = null;
      throw error;
    });
  }

  return lateRequestTablePromise;
}

export const sendAvailabilityRequest = async (req, res) => {
  try {
    const { month, year, employee_id } = req.body;

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required" });
    }

    const result = await sendFillRequestToEmployees(
      Number(month),
      Number(year),
      employee_id ? Number(employee_id) : null,
    );

    res.json({ message: "Sent request", ...result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getNotifications = async (req, res) => {
  const user_id = Number(req.headers["user-id"]);

  if (!user_id) {
    return res.status(400).json({ message: "Missing user_id" });
  }

  if (String(req.query.summary || "") === "1") {
    const [summaryRows] = await db.query(
      `SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN is_read = 0 THEN 1 ELSE 0 END) AS unread_count
       FROM notifications
       WHERE user_id=?`,
      [user_id]
    );

    return res.json({
      total: Number(summaryRows[0]?.total || 0),
      unread_count: Number(summaryRows[0]?.unread_count || 0),
    });
  }

  await ensureLateRequestTableOnce();

  const requestedLimit = Number(req.query.limit);
  const limit = Number.isFinite(requestedLimit)
    ? Math.min(Math.max(Math.trunc(requestedLimit), 1), 500)
    : null;
  const limitClause = limit ? " LIMIT ?" : "";
  const params = limit ? [user_id, limit] : [user_id];

  const [rows] = await db.query(
    `SELECT n.notification_id,
            n.user_id,
            n.message,
            n.type,
            n.is_read,
            n.ref_id,
            DATE_FORMAT(CONVERT_TZ(n.created_at, '+00:00', '+07:00'), '%Y-%m-%d %H:%i:%s') as created_at,
            e.name as employee_name,
            ar.month, ar.year, ar.data as availability_data, ar.status as request_status,
            pf.feedback_id as payroll_feedback_id,
            pf.subject as payroll_subject,
            pf.content as payroll_content,
            pf.status as payroll_status,
            pf.admin_reply as payroll_reply,
            pfe.name as payroll_employee_name,
            sr.swap_request_id,
            sr.status as swap_status,
            sr.requester_note as swap_requester_note,
            sr.admin_cancel_reason as swap_admin_cancel_reason,
            sr.admin_revert_reason as swap_admin_revert_reason,
            sre.name as swap_requester_name,
            ste.name as swap_target_name,
            DATE_FORMAT(srs.work_date, '%Y-%m-%d') as swap_requester_work_date,
            srsh.shift_name as swap_requester_shift_name,
            TIME_FORMAT(srsh.start_time, '%H:%i:%s') as swap_requester_start_time,
            TIME_FORMAT(srsh.end_time, '%H:%i:%s') as swap_requester_end_time,
            DATE_FORMAT(sts.work_date, '%Y-%m-%d') as swap_target_work_date,
            stsh.shift_name as swap_target_shift_name,
            TIME_FORMAT(stsh.start_time, '%H:%i:%s') as swap_target_start_time,
            TIME_FORMAT(stsh.end_time, '%H:%i:%s') as swap_target_end_time,
            lr.late_request_id,
            lr.status as late_request_status,
            lr.requested_minutes as late_requested_minutes,
            lr.reason as late_request_reason,
            lre.name as late_employee_name,
            DATE_FORMAT(lrs.work_date, '%Y-%m-%d') as late_work_date,
            lrsh.shift_name as late_shift_name,
            TIME_FORMAT(lrsh.start_time, '%H:%i:%s') as late_start_time,
            TIME_FORMAT(lrsh.end_time, '%H:%i:%s') as late_end_time
     FROM notifications n
     LEFT JOIN availability_requests ar ON n.ref_id = ar.id
     LEFT JOIN employees e ON ar.employee_id = e.employee_id
     LEFT JOIN payroll_feedback pf ON n.ref_id = pf.feedback_id
       AND n.type IN ('PAYROLL_FEEDBACK', 'PAYROLL_FEEDBACK_RESPONSE')
     LEFT JOIN employees pfe ON pf.employee_id = pfe.employee_id
     LEFT JOIN shift_swap_requests sr ON n.ref_id = sr.swap_request_id
       AND n.type LIKE 'SHIFT_SWAP%'
     LEFT JOIN employees sre ON sr.requester_employee_id = sre.employee_id
     LEFT JOIN employees ste ON sr.target_employee_id = ste.employee_id
     LEFT JOIN schedules srs ON sr.requester_schedule_id = srs.schedule_id
     LEFT JOIN shifts srsh ON srs.shift_id = srsh.shift_id
     LEFT JOIN schedules sts ON sr.target_schedule_id = sts.schedule_id
     LEFT JOIN shifts stsh ON sts.shift_id = stsh.shift_id
     LEFT JOIN attendance_late_requests lr ON n.ref_id = lr.late_request_id
       AND n.type LIKE 'ATTENDANCE_LATE%'
     LEFT JOIN employees lre ON lr.employee_id = lre.employee_id
     LEFT JOIN schedules lrs ON lr.schedule_id = lrs.schedule_id
     LEFT JOIN shifts lrsh ON lrs.shift_id = lrsh.shift_id
     WHERE n.user_id=? 
      ORDER BY n.created_at DESC${limitClause}`,
    params
  );

  res.json(rows);
};

export const markRead = async (req, res) => {
  await db.query(
    "UPDATE notifications SET is_read=1 WHERE notification_id=?",
    [req.params.id]
  );

  res.json({ message: "ok" });
};

export const markAllRead = async (req, res) => {
  const user_id = Number(req.headers["user-id"]);

  if (!user_id) {
    return res.status(400).json({ message: "Missing user_id" });
  }

  await db.query("UPDATE notifications SET is_read=1 WHERE user_id=?", [
    user_id,
  ]);

  res.json({ message: "ok" });
};

export const deleteNotifications = async (req, res) => {
  try {
    const user_id = Number(req.headers["user-id"]);
    const ids = Array.isArray(req.body?.ids)
      ? [...new Set(req.body.ids.map(Number).filter(Boolean))]
      : [];

    if (!user_id) {
      return res.status(400).json({ message: "Missing user_id" });
    }

    if (!ids.length) {
      return res.status(400).json({ message: "Missing notification ids" });
    }

    let deleted = 0;
    const batchSize = 500;

    for (let index = 0; index < ids.length; index += batchSize) {
      const batch = ids.slice(index, index + batchSize);
      const placeholders = batch.map(() => "?").join(",");
      const [result] = await db.query(
        `DELETE FROM notifications WHERE user_id=? AND notification_id IN (${placeholders})`,
        [user_id, ...batch],
      );
      deleted += result.affectedRows || 0;
    }

    res.json({ message: "ok", deleted });
  } catch (err) {
    console.error("DELETE NOTIFICATIONS ERROR:", err);
    res.status(500).json({
      message: "Không thể xóa thông báo",
      detail: err.message,
    });
  }
};
