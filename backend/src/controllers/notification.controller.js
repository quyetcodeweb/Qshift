import db from "../config/db.js";

export const sendAvailabilityRequest = async (req, res) => {
  try {
    const [users] = await db.query(
      "SELECT user_id FROM users WHERE role='EMPLOYEE'"
    );

    for (const u of users) {
      await db.query(
        `INSERT INTO notifications (user_id, message, type)
         VALUES (?, ?, 'AVAILABILITY_REQUEST')`,
        [u.user_id, "Vui lòng cập nhật thời gian rảnh"]
      );
    }

    res.json({ message: "Sent request" });
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
            ar.month, ar.year, ar.status as request_status,
            pf.feedback_id as payroll_feedback_id,
            pf.subject as payroll_subject,
            pf.content as payroll_content,
            pf.status as payroll_status,
            pf.admin_reply as payroll_reply,
            pfe.name as payroll_employee_name
     FROM notifications n
     LEFT JOIN availability_requests ar ON n.ref_id = ar.id
     LEFT JOIN employees e ON ar.employee_id = e.employee_id
     LEFT JOIN payroll_feedback pf ON n.ref_id = pf.feedback_id
       AND n.type IN ('PAYROLL_FEEDBACK', 'PAYROLL_FEEDBACK_RESPONSE')
     LEFT JOIN employees pfe ON pf.employee_id = pfe.employee_id
     WHERE n.user_id=? 
     ORDER BY n.created_at DESC`,
    [user_id]
  );

  res.json(rows);
};

// mark read
export const markRead = async (req, res) => {
  await db.query(
    "UPDATE notifications SET is_read=1 WHERE notification_id=?",
    [req.params.id]
  );

  res.json({ message: "ok" });
};
