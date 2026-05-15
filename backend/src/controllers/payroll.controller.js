import database from "../config/db.js";

function normalizeDateRange({ startDate, endDate }) {
  return {
    startDate: startDate || null,
    endDate: endDate || null,
  };
}

function getShiftHoursExpression() {
  return `
    CASE
      WHEN sh.end_time >= sh.start_time THEN TIME_TO_SEC(TIMEDIFF(sh.end_time, sh.start_time)) / 3600
      ELSE TIME_TO_SEC(TIMEDIFF(ADDTIME(sh.end_time, '24:00:00'), sh.start_time)) / 3600
    END
  `;
}

async function getUser(userId) {
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

async function ensurePayrollFeedbackTable() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS payroll_feedback (
      feedback_id INT AUTO_INCREMENT PRIMARY KEY,
      employee_id INT NOT NULL,
      subject VARCHAR(255) NOT NULL,
      content TEXT NOT NULL,
      status ENUM('PENDING','ANSWERED','REJECTED') DEFAULT 'PENDING',
      admin_reply TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMP NULL DEFAULT NULL,
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
    )
  `);
}

async function buildPayrollRows({ employeeId, startDate, endDate }) {
  const conditions = ["s.status = 'PUBLISHED'"];
  const params = [];

  if (employeeId) {
    conditions.push("s.employee_id = ?");
    params.push(employeeId);
  }

  if (startDate && endDate) {
    conditions.push("s.work_date BETWEEN ? AND ?");
    params.push(startDate, endDate);
  } else if (startDate) {
    conditions.push("s.work_date >= ?");
    params.push(startDate);
  } else if (endDate) {
    conditions.push("s.work_date <= ?");
    params.push(endDate);
  }

  const shiftHours = getShiftHoursExpression();

  const [rows] = await database.query(
    `SELECT
      e.employee_id,
      e.user_id,
      e.name AS employee_name,
      e.email,
      COALESCE(e.hourly_rate, 0) AS hourly_rate,
      COUNT(s.schedule_id) AS total_shifts,
      SUM(CASE WHEN a.check_in IS NOT NULL THEN 1 ELSE 0 END) AS attended_shifts,
      SUM(CASE WHEN a.status = 'LATE' THEN 1 ELSE 0 END) AS late_shifts,
      SUM(CASE WHEN a.check_in IS NOT NULL AND (a.status IS NULL OR a.status <> 'LATE') THEN 1 ELSE 0 END) AS on_time_shifts,
      SUM(CASE WHEN a.check_in IS NULL THEN 1 ELSE 0 END) AS missing_shifts,
      ROUND(SUM(${shiftHours}), 2) AS scheduled_hours,
      ROUND(SUM(
        CASE
          WHEN a.check_in IS NOT NULL AND a.check_out IS NOT NULL
            THEN GREATEST(TIMESTAMPDIFF(MINUTE, a.check_in, a.check_out), 0) / 60
          ELSE 0
        END
      ), 2) AS worked_hours
     FROM schedules s
     JOIN employees e ON s.employee_id = e.employee_id
     JOIN shifts sh ON s.shift_id = sh.shift_id
     LEFT JOIN attendance a ON a.schedule_id = s.schedule_id
     WHERE ${conditions.join(" AND ")}
     GROUP BY e.employee_id, e.user_id, e.name, e.email, e.hourly_rate
     ORDER BY e.name ASC`,
    params
  );

  return rows.map((row) => {
    const totalShifts = Number(row.total_shifts || 0);
    const attendedShifts = Number(row.attended_shifts || 0);
    const onTimeShifts = Number(row.on_time_shifts || 0);
    const workedHours = Number(row.worked_hours || 0);
    const scheduledHours = Number(row.scheduled_hours || 0);
    const hourlyRate = Number(row.hourly_rate || 0);

    return {
      ...row,
      total_shifts: totalShifts,
      attended_shifts: attendedShifts,
      late_shifts: Number(row.late_shifts || 0),
      on_time_shifts: onTimeShifts,
      missing_shifts: Number(row.missing_shifts || 0),
      scheduled_hours: scheduledHours,
      worked_hours: workedHours,
      hourly_rate: hourlyRate,
      total_salary: Math.round(workedHours * hourlyRate),
      productivity: totalShifts ? Math.round((attendedShifts / totalShifts) * 100) : 0,
      efficiency: attendedShifts ? Math.round((onTimeShifts / attendedShifts) * 100) : 0,
    };
  });
}

export async function getPayrollSummary(req, res) {
  try {
    const user = await getUser(req.user?.user_id);

    if (!user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const { employee_id } = req.query;
    const range = normalizeDateRange(req.query);
    let employeeId = employee_id && employee_id !== "all" ? Number(employee_id) : null;

    if (user.role !== "ADMIN") {
      const employee = await getEmployeeByUserId(user.user_id);
      if (!employee) return res.json({ rows: [], totals: {} });
      employeeId = employee.employee_id;
    }

    const rows = await buildPayrollRows({ employeeId, ...range });
    const totals = rows.reduce(
      (acc, row) => {
        acc.total_shifts += row.total_shifts;
        acc.attended_shifts += row.attended_shifts;
        acc.late_shifts += row.late_shifts;
        acc.on_time_shifts += row.on_time_shifts;
        acc.missing_shifts += row.missing_shifts;
        acc.scheduled_hours += row.scheduled_hours;
        acc.worked_hours += row.worked_hours;
        acc.total_salary += row.total_salary;
        return acc;
      },
      {
        total_shifts: 0,
        attended_shifts: 0,
        late_shifts: 0,
        on_time_shifts: 0,
        missing_shifts: 0,
        scheduled_hours: 0,
        worked_hours: 0,
        total_salary: 0,
      }
    );

    totals.productivity = totals.total_shifts
      ? Math.round((totals.attended_shifts / totals.total_shifts) * 100)
      : 0;
    totals.efficiency = totals.attended_shifts
      ? Math.round((totals.on_time_shifts / totals.attended_shifts) * 100)
      : 0;
    totals.scheduled_hours = Number(totals.scheduled_hours.toFixed(2));
    totals.worked_hours = Number(totals.worked_hours.toFixed(2));

    res.json({ rows, totals });
  } catch (error) {
    console.error("[getPayrollSummary] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function submitPayrollFeedback(req, res) {
  try {
    const user = await getUser(req.user?.user_id);

    if (!user) {
      return res.status(401).json({ message: "Invalid user" });
    }

    const employee = await getEmployeeByUserId(user.user_id);
    if (!employee) {
      return res.status(403).json({ message: "Khong tim thay ho so nhan vien" });
    }

    const subject = String(req.body.subject || "").trim();
    const content = String(req.body.content || "").trim();

    if (!subject || !content) {
      return res.status(400).json({ message: "Chu de va noi dung la bat buoc" });
    }

    await ensurePayrollFeedbackTable();

    const [result] = await database.query(
      `INSERT INTO payroll_feedback (employee_id, subject, content)
       VALUES (?, ?, ?)`,
      [employee.employee_id, subject, content]
    );

    const [admins] = await database.query(
      "SELECT user_id FROM users WHERE role = 'ADMIN'"
    );
    const [employeeRows] = await database.query(
      "SELECT name FROM employees WHERE employee_id = ?",
      [employee.employee_id]
    );
    const employeeName = employeeRows[0]?.name || "Nhan vien";

    for (const admin of admins) {
      await database.query(
        `INSERT INTO notifications (user_id, message, type, ref_id)
         VALUES (?, ?, 'PAYROLL_FEEDBACK', ?)`,
        [
          admin.user_id,
          `${employeeName} phan hoi ve luong: ${subject}`,
          result.insertId,
        ]
      );
    }

    res.json({ message: "Da gui phan hoi", feedback_id: result.insertId });
  } catch (error) {
    console.error("[submitPayrollFeedback] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function respondPayrollFeedback(req, res) {
  try {
    const user = await getUser(req.user?.user_id);

    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ message: "Admin access required" });
    }

    await ensurePayrollFeedbackTable();

    const feedbackId = Number(req.params.id);
    const action = req.body.action === "reject" ? "reject" : "reply";
    const reply = String(req.body.reply || "").trim();

    if (action === "reply" && !reply) {
      return res.status(400).json({ message: "Noi dung tra loi la bat buoc" });
    }

    const [feedbackRows] = await database.query(
      `SELECT pf.*, e.user_id, e.name
       FROM payroll_feedback pf
       JOIN employees e ON pf.employee_id = e.employee_id
       WHERE pf.feedback_id = ?`,
      [feedbackId]
    );

    const feedback = feedbackRows[0];
    if (!feedback) {
      return res.status(404).json({ message: "Khong tim thay phan hoi" });
    }

    const status = action === "reject" ? "REJECTED" : "ANSWERED";
    const adminReply = action === "reject" ? reply || "Phan hoi luong da bi tu choi" : reply;

    await database.query(
      `UPDATE payroll_feedback
       SET status = ?, admin_reply = ?, responded_at = NOW()
       WHERE feedback_id = ?`,
      [status, adminReply, feedbackId]
    );

    await database.query(
      `INSERT INTO notifications (user_id, message, type, ref_id)
       VALUES (?, ?, 'PAYROLL_FEEDBACK_RESPONSE', ?)`,
      [
        feedback.user_id,
        action === "reject"
          ? `Phan hoi luong "${feedback.subject}" da bi tu choi: ${adminReply}`
          : `Admin da tra loi phan hoi luong "${feedback.subject}": ${adminReply}`,
        feedbackId,
      ]
    );

    res.json({ message: action === "reject" ? "Da tu choi phan hoi" : "Da tra loi phan hoi" });
  } catch (error) {
    console.error("[respondPayrollFeedback] Error:", error);
    res.status(500).json({ message: error.message });
  }
}
