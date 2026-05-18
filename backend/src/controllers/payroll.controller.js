import database from "../config/db.js";

function normalizeDateRange({ startDate, endDate }) {
  return {
    startDate: startDate || null,
    endDate: endDate || null,
  };
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

async function ensurePayrollSettingsTable() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS payroll_settings (
      setting_key VARCHAR(80) PRIMARY KEY,
      setting_value VARCHAR(255) NOT NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);

  await database.query(
    `INSERT INTO payroll_settings (setting_key, setting_value)
     VALUES ('calculation_mode', 'attendance')
     ON DUPLICATE KEY UPDATE setting_value = setting_value`
  );
}

async function ensurePayrollResolutionsTable() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS payroll_resolutions (
      resolution_id INT AUTO_INCREMENT PRIMARY KEY,
      schedule_id INT NOT NULL UNIQUE,
      action ENUM('PAY','NO_PAY') NOT NULL,
      override_check_in DATETIME NULL,
      override_check_out DATETIME NULL,
      note TEXT,
      resolved_by INT NULL,
      resolved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE CASCADE
    )
  `);
}

async function getPayrollSettingsValue() {
  await ensurePayrollSettingsTable();

  const [rows] = await database.query(
    "SELECT setting_value FROM payroll_settings WHERE setting_key = 'calculation_mode'"
  );
  const calculationMode = rows[0]?.setting_value === "shift" ? "shift" : "attendance";

  return { calculation_mode: calculationMode };
}

function parseDateTime(value) {
  if (!value) return null;
  const normalized = String(value).replace(" ", "T");
  const date = new Date(`${normalized}+07:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftDateTime(date, time) {
  return parseDateTime(`${date} ${String(time || "00:00:00").slice(0, 8)}`);
}

function roundHours(minutes) {
  return Number((Math.max(Number(minutes || 0), 0) / 60).toFixed(2));
}

function formatTime(value) {
  return value ? String(value).slice(0, 5) : "-";
}

function toMysqlDateTime(value) {
  if (!value) return null;
  return String(value).replace("T", " ").slice(0, 19);
}

function buildDetailStatus(row, payableMinutes, lateMinutes, earlyLeaveMinutes, resolvedPay) {
  if (row.resolution_action === "NO_PAY") return "RESOLVED_NO_PAY";
  if (resolvedPay) return "RESOLVED_PAY";
  if (!row.effective_check_in) return "MISSING_CHECK_IN";
  if (!row.effective_check_out) return "MISSING_CHECK_OUT";
  if (payableMinutes <= 0) return "NO_PAYABLE_TIME";
  if (row.attendance_status === "LATE" || lateMinutes > 0) return "LATE";
  if (earlyLeaveMinutes > 0) return "EARLY_LEAVE";
  return "VALID";
}

async function buildPayrollDetails({ employeeId, startDate, endDate, settings }) {
  await ensurePayrollResolutionsTable();

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

  const [rows] = await database.query(
    `SELECT
      s.schedule_id,
      DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
      e.employee_id,
      e.user_id,
      e.name AS employee_name,
      e.email,
      COALESCE(e.hourly_rate, 0) AS hourly_rate,
      sh.shift_name,
      TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
      TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time,
      DATE_FORMAT(a.check_in, '%Y-%m-%d %H:%i:%s') AS check_in,
      DATE_FORMAT(a.check_out, '%Y-%m-%d %H:%i:%s') AS check_out,
      a.status AS attendance_status,
      pr.action AS resolution_action,
      DATE_FORMAT(pr.override_check_in, '%Y-%m-%d %H:%i:%s') AS override_check_in,
      DATE_FORMAT(pr.override_check_out, '%Y-%m-%d %H:%i:%s') AS override_check_out,
      pr.note AS resolution_note,
      DATE_FORMAT(pr.resolved_at, '%Y-%m-%d %H:%i:%s') AS resolved_at
     FROM schedules s
     JOIN employees e ON s.employee_id = e.employee_id
     JOIN shifts sh ON s.shift_id = sh.shift_id
     LEFT JOIN attendance a ON a.schedule_id = s.schedule_id
     LEFT JOIN payroll_resolutions pr ON pr.schedule_id = s.schedule_id
     WHERE ${conditions.join(" AND ")}
     ORDER BY s.work_date DESC, sh.start_time DESC, e.name ASC`,
    params
  );

  return rows.map((row) => {
    const scheduledStart = shiftDateTime(row.work_date, row.start_time);
    let scheduledEnd = shiftDateTime(row.work_date, row.end_time);
    if (scheduledStart && scheduledEnd && scheduledEnd <= scheduledStart) {
      scheduledEnd = new Date(scheduledEnd.getTime() + 24 * 60 * 60 * 1000);
    }

    const effectiveCheckIn = row.override_check_in || row.check_in;
    const effectiveCheckOut = row.override_check_out || row.check_out;
    const checkIn = parseDateTime(effectiveCheckIn);
    const checkOut = parseDateTime(effectiveCheckOut);
    const scheduledMinutes =
      scheduledStart && scheduledEnd
        ? Math.max((scheduledEnd.getTime() - scheduledStart.getTime()) / 60000, 0)
        : 0;
    const actualMinutes =
      checkIn && checkOut
        ? Math.max((checkOut.getTime() - checkIn.getTime()) / 60000, 0)
        : 0;
    const overlapStart =
      checkIn && scheduledStart && checkIn > scheduledStart ? checkIn : scheduledStart;
    const overlapEnd =
      checkOut && scheduledEnd && checkOut < scheduledEnd ? checkOut : scheduledEnd;
    const resolvedPay = row.resolution_action === "PAY";
    const hasValidTimes = Boolean(checkIn && checkOut);
    const basePayableMinutes =
      hasValidTimes && overlapStart && overlapEnd
        ? Math.max((overlapEnd.getTime() - overlapStart.getTime()) / 60000, 0)
        : 0;
    const lateMinutes =
      checkIn && scheduledStart
        ? Math.max((checkIn.getTime() - scheduledStart.getTime()) / 60000, 0)
        : 0;
    const earlyLeaveMinutes =
      checkOut && scheduledEnd
        ? Math.max((scheduledEnd.getTime() - checkOut.getTime()) / 60000, 0)
        : 0;
    const hourlyRate = Number(row.hourly_rate || 0);
    const isValidByAttendance = hasValidTimes && basePayableMinutes > 0;
    const isPayable =
      row.resolution_action === "PAY" || (row.resolution_action !== "NO_PAY" && isValidByAttendance);
    const payableMinutes =
      isPayable && settings.calculation_mode === "shift"
        ? scheduledMinutes
        : isPayable
          ? basePayableMinutes
          : 0;
    const payableHours = roundHours(payableMinutes);
    const status = buildDetailStatus(
      { ...row, effective_check_in: effectiveCheckIn, effective_check_out: effectiveCheckOut },
      payableMinutes,
      lateMinutes,
      earlyLeaveMinutes,
      resolvedPay,
    );

    return {
      ...row,
      effective_check_in: effectiveCheckIn,
      effective_check_out: effectiveCheckOut,
      hourly_rate: hourlyRate,
      shift_time: `${formatTime(row.start_time)} - ${formatTime(row.end_time)}`,
      checked_time: effectiveCheckIn
        ? `${String(effectiveCheckIn).slice(11, 16)} - ${effectiveCheckOut ? String(effectiveCheckOut).slice(11, 16) : "--:--"}`
        : "-",
      scheduled_hours: roundHours(scheduledMinutes),
      actual_hours: roundHours(actualMinutes),
      payable_hours: payableHours,
      late_minutes: Math.round(lateMinutes),
      early_leave_minutes: Math.round(earlyLeaveMinutes),
      salary: Math.round(payableHours * hourlyRate),
      payroll_status: status,
      is_payable: isPayable,
      is_resolved: Boolean(row.resolution_action),
      needs_resolution: !isValidByAttendance && !row.resolution_action,
      calculation_mode: settings.calculation_mode,
    };
  });
}

function buildPayrollRows(details) {
  const map = new Map();

  details.forEach((detail) => {
    const key = Number(detail.employee_id);
    if (!map.has(key)) {
      map.set(key, {
        employee_id: key,
        user_id: detail.user_id,
        employee_name: detail.employee_name,
        email: detail.email,
        hourly_rate: Number(detail.hourly_rate || 0),
        total_shifts: 0,
        attended_shifts: 0,
        late_shifts: 0,
        on_time_shifts: 0,
        missing_shifts: 0,
        issue_shifts: 0,
        scheduled_hours: 0,
        actual_hours: 0,
        worked_hours: 0,
        total_salary: 0,
      });
    }

    const row = map.get(key);
    row.total_shifts += 1;
    if (detail.effective_check_in) row.attended_shifts += 1;
    if (detail.payroll_status === "LATE") row.late_shifts += 1;
    if (detail.payroll_status === "VALID" || detail.payroll_status === "EARLY_LEAVE") {
      row.on_time_shifts += 1;
    }
    if (!detail.effective_check_in) row.missing_shifts += 1;
    if (["MISSING_CHECK_IN", "MISSING_CHECK_OUT", "NO_PAYABLE_TIME"].includes(detail.payroll_status)) {
      row.issue_shifts += 1;
    }
    row.scheduled_hours += Number(detail.scheduled_hours || 0);
    row.actual_hours += Number(detail.actual_hours || 0);
    row.worked_hours += Number(detail.payable_hours || 0);
    row.total_salary += Number(detail.salary || 0);
  });

  return Array.from(map.values())
    .map((row) => ({
      ...row,
      scheduled_hours: Number(row.scheduled_hours.toFixed(2)),
      actual_hours: Number(row.actual_hours.toFixed(2)),
      worked_hours: Number(row.worked_hours.toFixed(2)),
      total_salary: Math.round(row.total_salary),
      productivity: row.total_shifts ? Math.round((row.attended_shifts / row.total_shifts) * 100) : 0,
      efficiency: row.attended_shifts ? Math.round((row.on_time_shifts / row.attended_shifts) * 100) : 0,
    }))
    .sort((a, b) => a.employee_name.localeCompare(b.employee_name, "vi"));
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

    const settings = await getPayrollSettingsValue();
    const details = await buildPayrollDetails({ employeeId, ...range, settings });
    const rows = buildPayrollRows(details);
    const totals = rows.reduce(
      (acc, row) => {
        acc.total_shifts += row.total_shifts;
        acc.attended_shifts += row.attended_shifts;
        acc.late_shifts += row.late_shifts;
        acc.on_time_shifts += row.on_time_shifts;
        acc.missing_shifts += row.missing_shifts;
        acc.issue_shifts += row.issue_shifts;
        acc.scheduled_hours += row.scheduled_hours;
        acc.actual_hours += row.actual_hours;
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
        issue_shifts: 0,
        scheduled_hours: 0,
        actual_hours: 0,
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
    totals.actual_hours = Number(totals.actual_hours.toFixed(2));
    totals.worked_hours = Number(totals.worked_hours.toFixed(2));

    res.json({ rows, details, totals, settings });
  } catch (error) {
    console.error("[getPayrollSummary] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getPayrollSettings(req, res) {
  try {
    const user = await getUser(req.user?.user_id);
    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ message: "Admin access required" });
    }

    res.json(await getPayrollSettingsValue());
  } catch (error) {
    console.error("[getPayrollSettings] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function updatePayrollSettings(req, res) {
  try {
    const user = await getUser(req.user?.user_id);
    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ message: "Admin access required" });
    }

    await ensurePayrollSettingsTable();
    const calculationMode = req.body.calculation_mode === "shift" ? "shift" : "attendance";

    await database.query(
      `INSERT INTO payroll_settings (setting_key, setting_value)
       VALUES ('calculation_mode', ?)
       ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value)`,
      [calculationMode]
    );

    res.json({ calculation_mode: calculationMode });
  } catch (error) {
    console.error("[updatePayrollSettings] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function resolvePayrollSchedule(req, res) {
  try {
    const user = await getUser(req.user?.user_id);
    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ message: "Admin access required" });
    }

    await ensurePayrollResolutionsTable();

    const scheduleId = Number(req.params.scheduleId);
    const action = req.body.action === "NO_PAY" ? "NO_PAY" : "PAY";
    const overrideCheckIn = toMysqlDateTime(req.body.override_check_in);
    const overrideCheckOut = toMysqlDateTime(req.body.override_check_out);
    const note = String(req.body.note || "").trim();
    const settings = await getPayrollSettingsValue();

    if (!scheduleId) {
      return res.status(400).json({ message: "schedule_id khong hop le" });
    }

    if (action === "PAY" && settings.calculation_mode === "attendance" && (!overrideCheckIn || !overrideCheckOut)) {
      return res.status(400).json({ message: "Can nhap du gio cham cong khi tinh theo gio cham cong" });
    }

    await database.query(
      `INSERT INTO payroll_resolutions
        (schedule_id, action, override_check_in, override_check_out, note, resolved_by)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        action = VALUES(action),
        override_check_in = VALUES(override_check_in),
        override_check_out = VALUES(override_check_out),
        note = VALUES(note),
        resolved_by = VALUES(resolved_by),
        resolved_at = CURRENT_TIMESTAMP`,
      [scheduleId, action, overrideCheckIn, overrideCheckOut, note || null, user.user_id]
    );

    res.json({ message: "Da xu ly ca tinh luong" });
  } catch (error) {
    console.error("[resolvePayrollSchedule] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function undoPayrollResolution(req, res) {
  try {
    const user = await getUser(req.user?.user_id);
    if (!user || user.role !== "ADMIN") {
      return res.status(403).json({ message: "Admin access required" });
    }

    await ensurePayrollResolutionsTable();

    const scheduleId = Number(req.params.scheduleId);
    if (!scheduleId) {
      return res.status(400).json({ message: "schedule_id khong hop le" });
    }

    await database.query("DELETE FROM payroll_resolutions WHERE schedule_id = ?", [
      scheduleId,
    ]);

    res.json({ message: "Da hoan tac xu ly ca tinh luong" });
  } catch (error) {
    console.error("[undoPayrollResolution] Error:", error);
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
