import db from "../config/db.js";
import { sendFillRequestToEmployees } from "../services/availability.service.js";

export const sendAvailabilityRequest = async (req, res) => {
  try {
    const { month, year } = req.body;

    if (!month || !year) {
      return res.status(400).json({ message: "month and year are required" });
    }

    const count = await sendFillRequestToEmployees(Number(month), Number(year));

    res.json({ message: "Sent request", count });
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

  const [rows] = await db.query(
    `SELECT n.*,
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
            TIME_FORMAT(stsh.end_time, '%H:%i:%s') as swap_target_end_time
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
     WHERE n.user_id=? 
     ORDER BY n.created_at DESC`,
    [user_id]
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
