import db from "../config/db.js";

// ================= AVAILABILITY =================
export const save = async ({ employee_id, availability, month, year }) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    if (month && year) {
      await conn.query(
        `DELETE FROM employee_availability 
         WHERE employee_id=?
         AND MONTH(work_date)=?
         AND YEAR(work_date)=?`,
        [employee_id, month, year]
      );
    } else {
      const dates = availability.map((a) => a.date);

      if (dates.length > 0) {
        await conn.query(
          `DELETE FROM employee_availability 
           WHERE employee_id=? AND work_date IN (?)`,
          [employee_id, dates]
        );
      }
    }

    for (const item of availability) {
      await conn.query(
        `INSERT INTO employee_availability 
        (employee_id, shift_id, work_date)
        VALUES (?, ?, ?)`,
        [employee_id, item.shift_id, item.date]
      );
    }

    await conn.commit();
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const get = async (employee_id, month, year) => {
  const [rows] = await db.query(
    `SELECT
       availability_id,
       employee_id,
       shift_id,
       DATE_FORMAT(work_date, '%Y-%m-%d') as date,
       DATE_FORMAT(work_date, '%Y-%m-%d') as work_date
     FROM employee_availability
     WHERE employee_id=? 
     AND MONTH(work_date)=? 
     AND YEAR(work_date)=?`,
    [employee_id, month, year]
  );

  return rows;
};

// ================= REQUEST =================
export const createRequest = async (user_id, month, year, data) => {
  if (!Array.isArray(data)) {
    throw new Error("Invalid availability data");
  }

  if (!user_id || !month || !year) {
    throw new Error(`Missing required fields: user_id=${user_id}, month=${month}, year=${year}`);
  }

  try {
    // Get employee_id from user
    const [userRows] = await db.query(
      "SELECT employee_id FROM employees WHERE user_id=?",
      [user_id]
    );

    const employee_id = userRows[0]?.employee_id;

    // Try to insert with employee_id
    const [result] = await db.query(
      `INSERT INTO availability_requests (user_id, employee_id, month, year, data)
       VALUES (?, ?, ?, ?, ?)`,
      [user_id, employee_id, month, year, JSON.stringify(data)]
    );

    console.log("✅ createRequest success:", { requestId: result.insertId, user_id, month, year });
    return result.insertId;
  } catch (err) {
    // Fallback: insert without employee_id if column doesn't exist
    console.warn("⚠️ Insert with employee_id failed, trying fallback:", err.message);
    const [result] = await db.query(
      `INSERT INTO availability_requests (user_id, month, year, data)
       VALUES (?, ?, ?, ?)`,
      [user_id, month, year, JSON.stringify(data)]
    );
    console.log("✅ createRequest fallback success:", { requestId: result.insertId, user_id, month, year });
    return result.insertId;
  }
};

export const findPendingFillRequest = async (user_id, month, year) => {
  const [rows] = await db.query(
    `SELECT *
     FROM availability_requests
     WHERE user_id=?
       AND month=?
       AND year=?
       AND (status='PENDING' OR status IS NULL)
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [user_id, month, year]
  );

  return rows[0] || null;
};

export const findLatestRequest = async (user_id, month, year) => {
  const [rows] = await db.query(
    `SELECT *
     FROM availability_requests
     WHERE user_id=?
       AND month=?
       AND year=?
     ORDER BY created_at DESC, id DESC
     LIMIT 1`,
    [user_id, month, year]
  );

  return rows[0] || null;
};

export const updateRequestDataAndStatus = async (id, data, status) => {
  await db.query(
    `UPDATE availability_requests
     SET data=?,
         status=?,
         submitted_at=CASE WHEN ? IN ('SUBMITTED','APPROVED') THEN NOW() ELSE submitted_at END
     WHERE id=?`,
    [JSON.stringify(data), status, status, id]
  );
};

export const markEditRequested = async (id) => {
  await db.query(
    `UPDATE availability_requests
     SET status='EDIT_PENDING', edit_requested_at=NOW()
     WHERE id=?`,
    [id]
  );
};

export const markEditApproved = async (id) => {
  await db.query(
    `UPDATE availability_requests
     SET status='EDIT_APPROVED', edit_approved_at=NOW()
     WHERE id=?`,
    [id]
  );
};

export const markEditRejected = async (id) => {
  await db.query(
    `UPDATE availability_requests
     SET status='SUBMITTED'
     WHERE id=?`,
    [id]
  );
};

export const isWithinEditWindow = async (id) => {
  const [rows] = await db.query(
    `SELECT
       CASE
         WHEN submitted_at IS NOT NULL
          AND submitted_at >= DATE_SUB(NOW(), INTERVAL 5 HOUR)
         THEN 1
         ELSE 0
       END as is_within_window
     FROM availability_requests
     WHERE id=?
     LIMIT 1`,
    [id]
  );

  return Number(rows[0]?.is_within_window) === 1;
};

export const hasRecentNotification = async (user_id, type, ref_id) => {
  const [rows] = await db.query(
    `SELECT notification_id
     FROM notifications
     WHERE user_id=?
       AND type=?
       AND ref_id=?
     LIMIT 1`,
    [user_id, type, ref_id]
  );

  return rows.length > 0;
};

export const deleteNotificationsByType = async (ref_id, types) => {
  if (!Array.isArray(types) || types.length === 0) return;
  const placeholders = types.map(() => "?").join(",");
  await db.query(
    `DELETE FROM notifications WHERE ref_id=? AND type IN (${placeholders})`,
    [ref_id, ...types]
  );
};

export const updateRequestStatus = async (id, status) => {
  await db.query(
    "UPDATE availability_requests SET status=? WHERE id=?",
    [status, id]
  );
};

export const getRequestById = async (id) => {
  try {
    const [rows] = await db.query(
      `SELECT ar.*, e.name as employee_name 
       FROM availability_requests ar
       LEFT JOIN employees e ON ar.employee_id = e.employee_id OR ar.user_id = e.user_id
       WHERE ar.id=?`,
      [id]
    );
    return rows[0];
  } catch (err) {
    // Fallback if column doesn't exist yet
    console.warn("JOIN query failed, using fallback query:", err.message);
    const [rows] = await db.query(
      "SELECT * FROM availability_requests WHERE id=?",
      [id]
    );
    return rows[0];
  }
};

// ================= USER =================
export const getAdmins = async () => {
  const [rows] = await db.query(
    "SELECT user_id FROM users WHERE role='ADMIN'"
  );
  return rows;
};

// ================= NOTIFICATION =================
export const createNotification = async (
  user_id,
  message,
  type = null,
  ref_id = null
) => {
  if (type === "AVAILABILITY_REQUEST" && !ref_id) {
    throw new Error("Missing ref_id for availability request");
  }

  await db.query(
    `INSERT INTO notifications (user_id, message, type, ref_id)
     VALUES (?, ?, ?, ?)`,
    [user_id, message, type, ref_id]
  );
};

export const createNotificationOnce = async (
  user_id,
  message,
  type = null,
  ref_id = null
) => {
  if (type && ref_id && await hasRecentNotification(user_id, type, ref_id)) {
    return;
  }

  await createNotification(user_id, message, type, ref_id);
};

export const listRequests = async () => {
  const [rows] = await db.query(
    `SELECT
       ar.id,
       ar.user_id,
       ar.employee_id,
       ar.month,
       ar.year,
       ar.data,
       COALESCE(ar.status, 'PENDING') as status,
       ar.created_at,
       e.name as employee_name,
       e.employee_id as employee_code,
       COALESCE(e.email, u.username) as email,
       CASE
         WHEN ar.status IN ('APPROVED', 'SUBMITTED', 'EDIT_PENDING', 'EDIT_APPROVED') THEN 1
         ELSE 0
       END as has_submitted
     FROM availability_requests ar
     LEFT JOIN employees e ON ar.employee_id = e.employee_id OR ar.user_id = e.user_id
     LEFT JOIN users u ON ar.user_id = u.user_id
     ORDER BY ar.created_at DESC, ar.id DESC`
  );

  return rows;
};

export const deleteRequest = async (id) => {
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();

    await conn.query(
      `DELETE FROM notifications
       WHERE ref_id=?
       AND type IN (
         'AVAILABILITY_FILL_REQUEST',
         'AVAILABILITY_FILL_REMINDER',
         'AVAILABILITY_SUBMITTED',
         'AVAILABILITY_REJECTED'
       )`,
      [id]
    );

    const [result] = await conn.query(
      "DELETE FROM availability_requests WHERE id=?",
      [id]
    );

    await conn.commit();
    return result.affectedRows || 0;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
};

export const createFillRequests = async (month, year, employeeId = null) => {
  const params = [];
  let employeeFilter = "";

  if (employeeId) {
    employeeFilter = " AND e.employee_id = ?";
    params.push(employeeId);
  }

  const [employees] = await db.query(
    `SELECT u.user_id, e.employee_id
     FROM users u
     JOIN employees e ON e.user_id = u.user_id
     WHERE u.role='EMPLOYEE' AND u.status = 1${employeeFilter}`,
    params
  );

  const requests = [];

  for (const employee of employees) {
    const existing = await findPendingFillRequest(employee.user_id, month, year);
    if (existing) {
      requests.push({
        request_id: existing.id,
        user_id: employee.user_id,
        employee_id: employee.employee_id,
      });
      continue;
    }

    const [availability] = await db.query(
      `SELECT DATE_FORMAT(work_date, '%Y-%m-%d') as date, shift_id
       FROM employee_availability
       WHERE employee_id=?
       AND MONTH(work_date)=?
       AND YEAR(work_date)=?`,
      [employee.employee_id, month, year]
    );

    const [result] = await db.query(
      `INSERT INTO availability_requests (user_id, employee_id, month, year, data)
       VALUES (?, ?, ?, ?, ?)`,
      [
        employee.user_id,
        employee.employee_id,
        month,
        year,
        JSON.stringify(availability),
      ]
    );

    requests.push({
      request_id: result.insertId,
      user_id: employee.user_id,
      employee_id: employee.employee_id,
    });
  }

  return requests;
};

export const getEmployeeByUserId = async (user_id) => {
  const [rows] = await db.query(
    "SELECT employee_id, name FROM employees WHERE user_id=?",
    [user_id]
  );

  return rows[0];
};
