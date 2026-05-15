import database from "../config/db.js";

const ACTIVE_STATUS = "PENDING_TARGET";
const APPROVED_STATUS = "APPROVED";
const TARGET_REJECTED_STATUS = "REJECTED_BY_TARGET";
const ADMIN_CANCELLED_STATUS = "CANCELLED_BY_ADMIN";
const ADMIN_REVERTED_STATUS = "REVERTED_BY_ADMIN";

async function ensureShiftSwapTable() {
  await database.query(`
    CREATE TABLE IF NOT EXISTS shift_swap_requests (
      swap_request_id INT AUTO_INCREMENT PRIMARY KEY,
      requester_employee_id INT NOT NULL,
      target_employee_id INT NOT NULL,
      requester_schedule_id INT NOT NULL,
      target_schedule_id INT NOT NULL,
      status VARCHAR(40) NOT NULL DEFAULT 'PENDING_TARGET',
      requester_note TEXT,
      target_response_at TIMESTAMP NULL,
      admin_cancel_reason TEXT,
      admin_cancelled_at TIMESTAMP NULL,
      admin_revert_reason TEXT,
      admin_reverted_at TIMESTAMP NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (requester_employee_id) REFERENCES employees(employee_id),
      FOREIGN KEY (target_employee_id) REFERENCES employees(employee_id),
      FOREIGN KEY (requester_schedule_id) REFERENCES schedules(schedule_id),
      FOREIGN KEY (target_schedule_id) REFERENCES schedules(schedule_id)
    )
  `);
}

async function getUserRole(userId) {
  const [rows] = await database.query(
    "SELECT role FROM users WHERE user_id = ?",
    [userId],
  );
  return rows[0]?.role || null;
}

async function getEmployeeByUserId(userId) {
  const [rows] = await database.query(
    `SELECT employee_id, user_id, name FROM employees WHERE user_id = ?`,
    [userId],
  );
  return rows[0] || null;
}

async function getAdmins() {
  const [rows] = await database.query(
    "SELECT user_id FROM users WHERE role = 'ADMIN'",
  );
  return rows;
}

async function notifyUser(userId, type, message, refId, connection = database) {
  if (!userId) return;
  await connection.query(
    `INSERT INTO notifications (user_id, message, type, ref_id)
     VALUES (?, ?, ?, ?)`,
    [userId, message, type, refId],
  );
}

async function notifyAdmins(type, message, refId, connection = database) {
  const admins = await getAdmins();
  for (const admin of admins) {
    await notifyUser(admin.user_id, type, message, refId, connection);
  }
}

function formatShift(row, prefix) {
  return `${row[`${prefix}_employee_name`]} - ${row[`${prefix}_shift_name`]} (${String(row[`${prefix}_start_time`]).slice(0, 5)} - ${String(row[`${prefix}_end_time`]).slice(0, 5)}) ngày ${row[`${prefix}_work_date`]}`;
}

async function getSwapRequestById(id, connection = database) {
  const [rows] = await connection.query(
    `
      SELECT
        sr.*,
        req.user_id AS requester_user_id,
        req.name AS requester_employee_name,
        tgt.user_id AS target_user_id,
        tgt.name AS target_employee_name,
        rs.shift_id AS requester_shift_id,
        DATE_FORMAT(rs.work_date, '%Y-%m-%d') AS requester_work_date,
        rsh.shift_name AS requester_shift_name,
        TIME_FORMAT(rsh.start_time, '%H:%i:%s') AS requester_start_time,
        TIME_FORMAT(rsh.end_time, '%H:%i:%s') AS requester_end_time,
        ts.shift_id AS target_shift_id,
        DATE_FORMAT(ts.work_date, '%Y-%m-%d') AS target_work_date,
        tsh.shift_name AS target_shift_name,
        TIME_FORMAT(tsh.start_time, '%H:%i:%s') AS target_start_time,
        TIME_FORMAT(tsh.end_time, '%H:%i:%s') AS target_end_time
      FROM shift_swap_requests sr
      JOIN employees req ON sr.requester_employee_id = req.employee_id
      JOIN employees tgt ON sr.target_employee_id = tgt.employee_id
      JOIN schedules rs ON sr.requester_schedule_id = rs.schedule_id
      JOIN shifts rsh ON rs.shift_id = rsh.shift_id
      JOIN schedules ts ON sr.target_schedule_id = ts.schedule_id
      JOIN shifts tsh ON ts.shift_id = tsh.shift_id
      WHERE sr.swap_request_id = ?
    `,
    [id],
  );
  return rows[0] || null;
}

async function listSwapRequests({ userId, role }) {
  await ensureShiftSwapTable();

  const params = [];
  let where = "";

  if (role !== "ADMIN") {
    const employee = await getEmployeeByUserId(userId);
    if (!employee) return [];
    where = "WHERE sr.requester_employee_id = ? OR sr.target_employee_id = ?";
    params.push(employee.employee_id, employee.employee_id);
  }

  const [rows] = await database.query(
    `
      SELECT
        sr.*,
        req.name AS requester_employee_name,
        tgt.name AS target_employee_name,
        DATE_FORMAT(rs.work_date, '%Y-%m-%d') AS requester_work_date,
        rsh.shift_name AS requester_shift_name,
        TIME_FORMAT(rsh.start_time, '%H:%i:%s') AS requester_start_time,
        TIME_FORMAT(rsh.end_time, '%H:%i:%s') AS requester_end_time,
        DATE_FORMAT(ts.work_date, '%Y-%m-%d') AS target_work_date,
        tsh.shift_name AS target_shift_name,
        TIME_FORMAT(tsh.start_time, '%H:%i:%s') AS target_start_time,
        TIME_FORMAT(tsh.end_time, '%H:%i:%s') AS target_end_time
      FROM shift_swap_requests sr
      JOIN employees req ON sr.requester_employee_id = req.employee_id
      JOIN employees tgt ON sr.target_employee_id = tgt.employee_id
      JOIN schedules rs ON sr.requester_schedule_id = rs.schedule_id
      JOIN shifts rsh ON rs.shift_id = rsh.shift_id
      JOIN schedules ts ON sr.target_schedule_id = ts.schedule_id
      JOIN shifts tsh ON ts.shift_id = tsh.shift_id
      ${where}
      ORDER BY sr.created_at DESC
    `,
    params,
  );

  return rows;
}

async function findSwapConflicts(request, connection = database) {
  const [conflicts] = await connection.query(
    `
      SELECT schedule_id
      FROM schedules
      WHERE schedule_id NOT IN (?, ?)
        AND (
          (employee_id = ? AND shift_id = ? AND work_date = ?)
          OR
          (employee_id = ? AND shift_id = ? AND work_date = ?)
        )
      LIMIT 1
    `,
    [
      request.requester_schedule_id,
      request.target_schedule_id,
      request.target_employee_id,
      request.requester_shift_id,
      request.requester_work_date,
      request.requester_employee_id,
      request.target_shift_id,
      request.target_work_date,
    ],
  );

  return conflicts;
}

export async function getShiftSwapOptions(req, res) {
  try {
    const userId = req.user?.user_id;
    const employee = await getEmployeeByUserId(userId);

    if (!employee) {
      return res.status(404).json({ message: "Không tìm thấy hồ sơ nhân viên" });
    }

    const [employees] = await database.query(
      `SELECT employee_id, name FROM employees WHERE employee_id <> ? ORDER BY name ASC`,
      [employee.employee_id],
    );

    const [schedules] = await database.query(
      `
        SELECT
          s.schedule_id,
          s.employee_id,
          e.name AS employee_name,
          s.shift_id,
          sh.shift_name,
          DATE_FORMAT(s.work_date, '%Y-%m-%d') AS work_date,
          TIME_FORMAT(sh.start_time, '%H:%i:%s') AS start_time,
          TIME_FORMAT(sh.end_time, '%H:%i:%s') AS end_time
        FROM schedules s
        JOIN employees e ON s.employee_id = e.employee_id
        JOIN shifts sh ON s.shift_id = sh.shift_id
        WHERE s.status = 'PUBLISHED'
        ORDER BY s.work_date DESC, sh.start_time ASC
      `,
    );

    res.json({ current_employee_id: employee.employee_id, employees, schedules });
  } catch (error) {
    console.error("[getShiftSwapOptions] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function createShiftSwapRequest(req, res) {
  try {
    await ensureShiftSwapTable();

    const requester = await getEmployeeByUserId(req.user?.user_id);
    const {
      requester_schedule_id,
      target_schedule_id,
      target_employee_id,
      requester_note = "",
    } = req.body;

    if (!requester) {
      return res.status(404).json({ message: "Không tìm thấy hồ sơ nhân viên" });
    }

    if (!requester_schedule_id || !target_schedule_id || !target_employee_id) {
      return res.status(400).json({ message: "Vui lòng chọn đủ ca của bạn, nhân viên và ca muốn đổi" });
    }

    if (Number(target_employee_id) === Number(requester.employee_id)) {
      return res.status(400).json({ message: "Không thể gửi yêu cầu đổi ca cho chính bạn" });
    }

    const [schedules] = await database.query(
      `
        SELECT schedule_id, employee_id, shift_id, DATE_FORMAT(work_date, '%Y-%m-%d') AS work_date, status
        FROM schedules
        WHERE schedule_id IN (?, ?)
      `,
      [requester_schedule_id, target_schedule_id],
    );

    const requesterSchedule = schedules.find(
      (schedule) => Number(schedule.schedule_id) === Number(requester_schedule_id),
    );
    const targetSchedule = schedules.find(
      (schedule) => Number(schedule.schedule_id) === Number(target_schedule_id),
    );

    if (!requesterSchedule || !targetSchedule) {
      return res.status(404).json({ message: "Không tìm thấy ca làm đã chọn" });
    }

    if (Number(requesterSchedule.employee_id) !== Number(requester.employee_id)) {
      return res.status(403).json({ message: "Bạn chỉ có thể gửi yêu cầu đổi ca của mình" });
    }

    if (Number(targetSchedule.employee_id) !== Number(target_employee_id)) {
      return res.status(400).json({ message: "Ca được chọn không thuộc nhân viên cần đổi" });
    }

    if (requesterSchedule.status !== "PUBLISHED" || targetSchedule.status !== "PUBLISHED") {
      return res.status(400).json({ message: "Chỉ có thể đổi ca đã công bố" });
    }

    if (
      requesterSchedule.work_date === targetSchedule.work_date &&
      Number(requesterSchedule.shift_id) === Number(targetSchedule.shift_id)
    ) {
      return res.status(400).json({ message: "Hai ca đổi phải khác nhau" });
    }

    const [active] = await database.query(
      `
        SELECT swap_request_id
        FROM shift_swap_requests
        WHERE status = ?
          AND (
            requester_schedule_id IN (?, ?)
            OR target_schedule_id IN (?, ?)
          )
        LIMIT 1
      `,
      [
        ACTIVE_STATUS,
        requester_schedule_id,
        target_schedule_id,
        requester_schedule_id,
        target_schedule_id,
      ],
    );

    if (active.length) {
      return res.status(400).json({ message: "Một trong hai ca đang có yêu cầu đổi đang chờ xử lý" });
    }

    const [targetRows] = await database.query(
      `SELECT user_id, name FROM employees WHERE employee_id = ?`,
      [target_employee_id],
    );

    if (!targetRows.length) {
      return res.status(404).json({ message: "Không tìm thấy nhân viên cần đổi" });
    }

    const [result] = await database.query(
      `
        INSERT INTO shift_swap_requests
          (requester_employee_id, target_employee_id, requester_schedule_id, target_schedule_id, requester_note)
        VALUES (?, ?, ?, ?, ?)
      `,
      [
        requester.employee_id,
        target_employee_id,
        requester_schedule_id,
        target_schedule_id,
        requester_note,
      ],
    );

    const request = await getSwapRequestById(result.insertId);
    const conflicts = await findSwapConflicts(request);

    if (conflicts.length) {
      await database.query(
        "DELETE FROM shift_swap_requests WHERE swap_request_id = ?",
        [request.swap_request_id],
      );
      return res.status(400).json({ message: "Không thể đổi vì một trong hai nhân viên sẽ bị trùng ca" });
    }

    const requestSummary = `${request.requester_employee_name} muốn đổi ${formatShift(request, "requester")} với ${formatShift(request, "target")}`;

    await notifyUser(
      request.target_user_id,
      "SHIFT_SWAP_TARGET_REQUEST",
      requestSummary,
      request.swap_request_id,
    );
    await notifyAdmins(
      "SHIFT_SWAP_ADMIN_REQUEST",
      requestSummary,
      request.swap_request_id,
    );

    res.json({ message: "Đã gửi yêu cầu đổi ca", request });
  } catch (error) {
    console.error("[createShiftSwapRequest] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getShiftSwapRequests(req, res) {
  try {
    const role = await getUserRole(req.user?.user_id);
    const requests = await listSwapRequests({ userId: req.user?.user_id, role });
    res.json(requests);
  } catch (error) {
    console.error("[getShiftSwapRequests] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function respondToShiftSwapRequest(req, res) {
  const connection = await database.getConnection();

  try {
    await ensureShiftSwapTable();
    await connection.beginTransaction();

    const { id } = req.params;
    const action = req.body.action === "reject" ? "reject" : "accept";
    const target = await getEmployeeByUserId(req.user?.user_id);
    const request = await getSwapRequestById(id, connection);

    if (!target || !request) {
      await connection.rollback();
      return res.status(404).json({ message: "Không tìm thấy yêu cầu đổi ca" });
    }

    if (Number(request.target_employee_id) !== Number(target.employee_id)) {
      await connection.rollback();
      return res.status(403).json({ message: "Bạn không có quyền xử lý yêu cầu này" });
    }

    if (request.status !== ACTIVE_STATUS) {
      await connection.rollback();
      return res.status(400).json({ message: "Yêu cầu này không còn chờ xử lý" });
    }

    if (action === "reject") {
      await connection.query(
        `UPDATE shift_swap_requests SET status = ?, target_response_at = NOW() WHERE swap_request_id = ?`,
        [TARGET_REJECTED_STATUS, id],
      );

      await notifyUser(
        request.requester_user_id,
        "SHIFT_SWAP_TARGET_REJECTED",
        `${request.target_employee_name} đã từ chối yêu cầu đổi ca của bạn.`,
        id,
        connection,
      );
      await notifyAdmins(
        "SHIFT_SWAP_TARGET_REJECTED",
        `${request.target_employee_name} đã từ chối yêu cầu đổi ca với ${request.requester_employee_name}.`,
        id,
        connection,
      );

      await connection.commit();
      return res.json({ message: "Đã từ chối yêu cầu đổi ca" });
    }

    const conflicts = await findSwapConflicts(request, connection);
    if (conflicts.length) {
      await connection.rollback();
      return res.status(400).json({ message: "Không thể đổi vì một trong hai nhân viên sẽ bị trùng ca" });
    }

    await connection.query(
      `
        UPDATE schedules
        SET employee_id = CASE schedule_id
          WHEN ? THEN ?
          WHEN ? THEN ?
          ELSE employee_id
        END
        WHERE schedule_id IN (?, ?)
      `,
      [
        request.requester_schedule_id,
        request.target_employee_id,
        request.target_schedule_id,
        request.requester_employee_id,
        request.requester_schedule_id,
        request.target_schedule_id,
      ],
    );

    await connection.query(
      `UPDATE shift_swap_requests SET status = ?, target_response_at = NOW() WHERE swap_request_id = ?`,
      [APPROVED_STATUS, id],
    );

    const approvedMessage = `${request.target_employee_name} đã chấp nhận đổi ca với ${request.requester_employee_name}.`;
    await notifyUser(request.requester_user_id, "SHIFT_SWAP_APPROVED", approvedMessage, id, connection);
    await notifyAdmins("SHIFT_SWAP_APPROVED_ADMIN", approvedMessage, id, connection);

    await connection.commit();
    res.json({ message: "Đã chấp nhận và cập nhật ca làm" });
  } catch (error) {
    await connection.rollback();
    console.error("[respondToShiftSwapRequest] Error:", error);
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
}

export async function cancelShiftSwapByAdmin(req, res) {
  try {
    await ensureShiftSwapTable();

    const role = await getUserRole(req.user?.user_id);
    if (role !== "ADMIN") {
      return res.status(403).json({ message: "Chỉ admin có quyền hủy yêu cầu" });
    }

    const { id } = req.params;
    const reason = req.body.reason || "";
    const request = await getSwapRequestById(id);

    if (!request) {
      return res.status(404).json({ message: "Không tìm thấy yêu cầu đổi ca" });
    }

    if (request.status !== ACTIVE_STATUS) {
      return res.status(400).json({ message: "Chỉ có thể hủy yêu cầu đang chờ người nhận xác nhận" });
    }

    await database.query(
      `
        UPDATE shift_swap_requests
        SET status = ?, admin_cancel_reason = ?, admin_cancelled_at = NOW()
        WHERE swap_request_id = ?
      `,
      [ADMIN_CANCELLED_STATUS, reason, id],
    );

    const message = `Admin đã hủy yêu cầu đổi ca giữa ${request.requester_employee_name} và ${request.target_employee_name}${reason ? `: ${reason}` : "."}`;
    await notifyUser(request.requester_user_id, "SHIFT_SWAP_ADMIN_CANCELLED", message, id);
    await notifyUser(request.target_user_id, "SHIFT_SWAP_ADMIN_CANCELLED", message, id);

    res.json({ message: "Đã hủy yêu cầu đổi ca" });
  } catch (error) {
    console.error("[cancelShiftSwapByAdmin] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function revertShiftSwapByAdmin(req, res) {
  const connection = await database.getConnection();

  try {
    await ensureShiftSwapTable();
    await connection.beginTransaction();

    const role = await getUserRole(req.user?.user_id);
    if (role !== "ADMIN") {
      await connection.rollback();
      return res.status(403).json({ message: "Chỉ admin có quyền hoàn tác đổi ca" });
    }

    const { id } = req.params;
    const reason = req.body.reason || "";
    const request = await getSwapRequestById(id, connection);

    if (!request) {
      await connection.rollback();
      return res.status(404).json({ message: "Không tìm thấy yêu cầu đổi ca" });
    }

    if (request.status !== APPROVED_STATUS) {
      await connection.rollback();
      return res.status(400).json({ message: "Chỉ có thể hoàn tác yêu cầu đã được chấp nhận" });
    }

    if (!reason.trim()) {
      await connection.rollback();
      return res.status(400).json({ message: "Vui lòng nhập lý do hoàn tác" });
    }

    await connection.query(
      `
        UPDATE schedules
        SET employee_id = CASE schedule_id
          WHEN ? THEN ?
          WHEN ? THEN ?
          ELSE employee_id
        END
        WHERE schedule_id IN (?, ?)
      `,
      [
        request.requester_schedule_id,
        request.requester_employee_id,
        request.target_schedule_id,
        request.target_employee_id,
        request.requester_schedule_id,
        request.target_schedule_id,
      ],
    );

    await connection.query(
      `
        UPDATE shift_swap_requests
        SET status = ?, admin_revert_reason = ?, admin_reverted_at = NOW()
        WHERE swap_request_id = ?
      `,
      [ADMIN_REVERTED_STATUS, reason, id],
    );

    const message = `Admin không cho phép đổi ca giữa ${request.requester_employee_name} và ${request.target_employee_name}. Lý do: ${reason}`;
    await notifyUser(request.requester_user_id, "SHIFT_SWAP_ADMIN_REVERTED", message, id, connection);
    await notifyUser(request.target_user_id, "SHIFT_SWAP_ADMIN_REVERTED", message, id, connection);

    await connection.commit();
    res.json({ message: "Đã hoàn tác đổi ca" });
  } catch (error) {
    await connection.rollback();
    console.error("[revertShiftSwapByAdmin] Error:", error);
    res.status(500).json({ message: error.message });
  } finally {
    connection.release();
  }
}
