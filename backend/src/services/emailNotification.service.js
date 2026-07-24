import crypto from "crypto";
import nodemailer from "nodemailer";
import database from "../config/db.js";

export const EMAIL_TYPES = [
  "schedule",
  "attendance",
  "attendance_reminder",
  "bell",
  "shift_swap",
  "admin_reminder",
  "payroll",
  "availability",
  "security",
];

const DEFAULT_PREFS = {
  schedule: true,
  attendance: true,
  attendance_reminder: true,
  bell: true,
  shift_swap: true,
  admin_reminder: true,
  payroll: true,
  availability: true,
  security: true,
};

let transporter;

function smtpReady() {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS);
}

function getTransporter() {
  if (!smtpReady()) return null;
  if (!transporter) {
    const port = Number(process.env.SMTP_PORT || 587);
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: process.env.SMTP_SECURE === undefined
        ? port === 465
        : String(process.env.SMTP_SECURE) === "true",
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
  }
  return transporter;
}

export async function ensureEmailTables() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS employee_email_preferences (
      employee_id INT PRIMARY KEY,
      schedule TINYINT(1) NOT NULL DEFAULT 1,
      attendance TINYINT(1) NOT NULL DEFAULT 1,
      attendance_reminder TINYINT(1) NOT NULL DEFAULT 1,
      bell TINYINT(1) NOT NULL DEFAULT 1,
      shift_swap TINYINT(1) NOT NULL DEFAULT 1,
      admin_reminder TINYINT(1) NOT NULL DEFAULT 1,
      payroll TINYINT(1) NOT NULL DEFAULT 1,
      availability TINYINT(1) NOT NULL DEFAULT 1,
      security TINYINT(1) NOT NULL DEFAULT 1,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
    )
  `);

  await database.query(`
    CREATE TABLE IF NOT EXISTS email_otps (
      otp_id INT AUTO_INCREMENT PRIMARY KEY,
      user_id INT NOT NULL,
      employee_id INT DEFAULT NULL,
      purpose VARCHAR(40) NOT NULL,
      target_email VARCHAR(255) NOT NULL,
      otp_hash VARCHAR(128) NOT NULL,
      expires_at DATETIME NOT NULL,
      consumed_at DATETIME NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_email_otps_user_purpose (user_id, purpose),
      INDEX idx_email_otps_expires (expires_at)
    )
  `);
}

export function normalizePrefs(value = {}) {
  return EMAIL_TYPES.reduce((prefs, key) => {
    prefs[key] = value[key] === undefined ? DEFAULT_PREFS[key] : Boolean(value[key]);
    return prefs;
  }, {});
}

export async function getEmailPreferences(employeeId) {
  await ensureEmailTables();
  const [rows] = await database.query(
    "SELECT * FROM employee_email_preferences WHERE employee_id = ?",
    [employeeId],
  );
  return normalizePrefs(rows[0] || {});
}

export async function saveEmailPreferences(employeeId, prefs) {
  await ensureEmailTables();
  const normalized = normalizePrefs(prefs);
  await database.query(
    `INSERT INTO employee_email_preferences
      (employee_id, schedule, attendance, attendance_reminder, bell, shift_swap, admin_reminder, payroll, availability, security)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      schedule = VALUES(schedule),
      attendance = VALUES(attendance),
      attendance_reminder = VALUES(attendance_reminder),
      bell = VALUES(bell),
      shift_swap = VALUES(shift_swap),
      admin_reminder = VALUES(admin_reminder),
      payroll = VALUES(payroll),
      availability = VALUES(availability),
      security = VALUES(security)`,
    [
      employeeId,
      normalized.schedule,
      normalized.attendance,
      normalized.attendance_reminder,
      normalized.bell,
      normalized.shift_swap,
      normalized.admin_reminder,
      normalized.payroll,
      normalized.availability,
      normalized.security,
    ],
  );
  return normalized;
}

export async function sendEmail({ to, subject, text, html }) {
  if (!to) return { sent: false, reason: "missing_email" };
  const mailer = getTransporter();
  if (!mailer) {
    console.warn("[email] SMTP is not configured; skipped:", subject);
    return { sent: false, reason: "smtp_not_configured" };
  }

  await mailer.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text,
    html: html || `<p>${String(text || "").replace(/\n/g, "<br/>")}</p>`,
  });
  return { sent: true };
}

export async function sendEmployeeEmail(employeeId, type, { subject, text, html }) {
  if (!EMAIL_TYPES.includes(type)) return { sent: false, reason: "unknown_type" };
  await ensureEmailTables();
  const [rows] = await database.query(
    `SELECT COALESCE(NULLIF(e.email, ''), NULLIF(u.username, '')) AS email,
            p.${type} AS enabled
     FROM employees e
     LEFT JOIN users u ON u.user_id = e.user_id
     LEFT JOIN employee_email_preferences p ON p.employee_id = e.employee_id
     WHERE e.employee_id = ?
     LIMIT 1`,
    [employeeId],
  );
  const row = rows[0];
  if (!row?.email) return { sent: false, reason: "missing_email" };
  const enabled = row.enabled === null || row.enabled === undefined ? DEFAULT_PREFS[type] : Boolean(row.enabled);
  if (!enabled) return { sent: false, reason: "disabled" };
  return sendEmail({ to: row.email, subject, text, html });
}

export async function sendUserEmail(userId, type, payload) {
  const [rows] = await database.query(
    "SELECT employee_id FROM employees WHERE user_id = ? LIMIT 1",
    [userId],
  );
  const employee = rows[0];
  if (!employee?.employee_id) return { sent: false, reason: "missing_employee" };
  return sendEmployeeEmail(employee.employee_id, type, payload);
}

function hashOtp(code) {
  return crypto.createHash("sha256").update(String(code)).digest("hex");
}

export async function createAndSendOtp({ userId, employeeId, purpose, targetEmail }) {
  await ensureEmailTables();
  if (!targetEmail) {
    const error = new Error("Tài khoản chưa có email để nhận mã OTP");
    error.statusCode = 400;
    throw error;
  }

  const code = String(crypto.randomInt(100000, 1000000));
  const expires = new Date(Date.now() + 10 * 60 * 1000);
  await database.query(
    `INSERT INTO email_otps (user_id, employee_id, purpose, target_email, otp_hash, expires_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [userId, employeeId || null, purpose, targetEmail, hashOtp(code), expires],
  );

  const payload = {
    subject: "Mã xác minh Qshift",
    text: `Mã xác minh của bạn là ${code}. Mã có hiệu lực trong 10 phút.`,
  };
  const sent = employeeId
    ? await sendEmployeeEmail(employeeId, "security", payload)
    : await sendEmail({ to: targetEmail, ...payload });
  if (!sent.sent) {
    const reasonMessage = sent.reason === "disabled"
      ? "Bạn đã tắt email bảo mật trong cài đặt thông báo"
      : "Không thể gửi email xác minh. Kiểm tra email hồ sơ hoặc cấu hình SMTP";
    const error = new Error(reasonMessage);
    error.statusCode = 500;
    throw error;
  }

  return { message: "Đã gửi mã OTP tới email" };
}

export async function verifyOtp({ userId, purpose, code }) {
  await ensureEmailTables();
  const [rows] = await database.query(
    `SELECT otp_id, otp_hash
     FROM email_otps
     WHERE user_id = ?
       AND purpose = ?
       AND consumed_at IS NULL
       AND expires_at > NOW()
     ORDER BY created_at DESC
     LIMIT 1`,
    [userId, purpose],
  );
  const otp = rows[0];
  if (!otp || otp.otp_hash !== hashOtp(code)) {
    const error = new Error("Mã OTP không đúng hoặc đã hết hạn");
    error.statusCode = 400;
    throw error;
  }
  await database.query("UPDATE email_otps SET consumed_at = NOW() WHERE otp_id = ?", [otp.otp_id]);
  return true;
}
