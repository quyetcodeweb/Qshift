import * as model from "../models/availability.model.js";
import db from "../config/db.js";
import { sendUserEmail } from "./emailNotification.service.js";

export const save = async (data) => {
  return await model.save(data);
};

export const get = async (employee_id, month, year) => {
  return await model.get(employee_id, month, year);
};

const createAccessError = (message) => {
  const error = new Error(message);
  error.statusCode = 403;
  return error;
};

export const assertEmployeeAvailabilityAccess = async (userId, employeeId, month, year) => {
  const employee = await model.getEmployeeByUserId(userId);
  if (!employee?.employee_id || Number(employee.employee_id) !== Number(employeeId)) {
    throw createAccessError("Bạn không có quyền xem lịch rảnh của nhân viên này");
  }

  const access = await model.getEmployeeRequestAccess(userId, month, year);
  if (!access.allowed) {
    throw createAccessError("Bạn chỉ có thể mở lịch rảnh khi có yêu cầu hợp lệ từ admin");
  }

  return access.request;
};

export const requestAvailability = async (user_id, month, year, data) => {
  console.log(
    `Creating availability submission for user ${user_id}, ${month}/${year}, ${data.length} items`
  );

  const employee = await model.getEmployeeByUserId(user_id);
  if (!employee?.employee_id) {
    throw new Error("Could not find employee_id for this user");
  }

  const latestRequest = await model.findLatestRequest(user_id, month, year);
  const editableStatuses = new Set(["PENDING", "EDIT_APPROVED"]);

  if (!latestRequest || !editableStatuses.has(latestRequest.status || "PENDING")) {
    throw createAccessError("Bạn chỉ có thể lưu lịch rảnh khi có yêu cầu đang hiệu lực từ admin");
  }

  const requestId = latestRequest.id;

  await model.save({
    employee_id: employee.employee_id,
    availability: data,
    month,
    year,
  });

  await model.updateRequestDataAndStatus(requestId, data, "SUBMITTED");

  await model.deleteNotificationsByType(requestId, ["AVAILABILITY_SUBMITTED"]);

  const admins = await model.getAdmins();

  for (const admin of admins) {
    await model.createNotification(
      admin.user_id,
      `${employee.name || `User ${user_id}`} đã lưu lịch rảnh tháng ${month}/${year}`,
      "AVAILABILITY_SUBMITTED",
      requestId
    );
  }

  return requestId;
};

export const sendFillRequestToEmployees = async (month, year, employeeId = null) => {
  const { createdRequests, existingCount, totalEmployees } =
    await model.createFillRequests(month, year, employeeId);

  const emailResults = await Promise.all(
    createdRequests.map(async (request) => {
      await model.deleteNotificationsByType(request.request_id, ["AVAILABILITY_FILL_REQUEST"]);
      await model.createNotification(
        request.user_id,
        `Hãy điền lịch rảnh vào tháng ${month}/${year}`,
        "AVAILABILITY_FILL_REQUEST",
        request.request_id
      );

      try {
        const delivery = await sendUserEmail(request.user_id, "availability", {
          subject: `Qshift: yêu cầu đăng ký lịch rảnh tháng ${month}/${year}`,
          text: `Admin đã gửi yêu cầu đăng ký lịch rảnh tháng ${month}/${year}. Vui lòng đăng nhập Qshift và lưu lịch rảnh của bạn.`,
        });
        return delivery;
      } catch (error) {
        console.warn("[availability] Email request failed:", error.message);
        return { sent: false, reason: "delivery_failed" };
      }
    }),
  );

  /*
   * The in-app notification and email are deliberately independent: an SMTP
   * configuration issue must not prevent employees from receiving the request
   * inside Qshift.
   */
  const emailSent = emailResults.filter((result) => result?.sent).length;
  const emailSkipped = emailResults.length - emailSent;

  if (!employeeId) {
    const admins = await model.getAdmins();
    for (const admin of admins) {
      await model.createNotification(
        admin.user_id,
        `Đã gửi yêu cầu điền lịch rảnh tháng ${month}/${year} cho ${createdRequests.length} nhân viên`,
        "AVAILABILITY_FILL_REQUEST_SENT",
        null
      );
    }
  }

  return {
    count: createdRequests.length,
    existingCount,
    totalEmployees,
    emailSent,
    emailSkipped,
  };
};

export const getMyAvailabilityRequest = async (user_id, month, year) => {
  const { request, allowed } = await model.getEmployeeRequestAccess(user_id, month, year);
  if (!request) return { access_granted: false };

  return {
    id: request.id,
    user_id: request.user_id,
    employee_id: request.employee_id,
    month: request.month,
    year: request.year,
    status: request.status || "PENDING",
    submitted_at: request.submitted_at,
    edit_requested_at: request.edit_requested_at,
    edit_approved_at: request.edit_approved_at,
    data: request.data,
    access_granted: allowed,
  };
};

export const getMyActiveFillRequest = async (user_id) => {
  return await model.findActiveFillRequest(user_id);
};

export const requestEditAvailability = async (user_id, month, year) => {
  const employee = await model.getEmployeeByUserId(user_id);
  const request = await model.findLatestRequest(user_id, month, year);

  if (!request) {
    throw new Error("Không tìm thấy lịch rảnh đã lưu");
  }

  if (!["SUBMITTED", "APPROVED", "REJECTED"].includes(request.status)) {
    throw new Error("Yêu cầu sửa đang chờ xử lý hoặc đã được duyệt");
  }

  const isWithinEditWindow = await model.isWithinEditWindow(request.id);
  if (!isWithinEditWindow) {
    throw new Error("Đã quá 5 giờ kể từ khi lưu lịch rảnh");
  }

  await model.markEditRequested(request.id);
  await model.deleteNotificationsByType(request.id, ["AVAILABILITY_EDIT_REQUEST"]);

  const admins = await model.getAdmins();
  for (const admin of admins) {
    await model.createNotification(
      admin.user_id,
      `${employee?.name || `User ${user_id}`} xin phép sửa lịch rảnh tháng ${month}/${year}`,
      "AVAILABILITY_EDIT_REQUEST",
      request.id
    );
  }

  return request.id;
};

export const respondEditAvailability = async (id, action) => {
  const request = await model.getRequestById(id);
  if (!request) throw new Error("Request not found");

  if (request.status !== "EDIT_PENDING") {
    throw new Error("Yêu cầu sửa không còn ở trạng thái chờ duyệt");
  }

  if (action === "approve") {
    await model.markEditApproved(id);
    await model.createNotification(
      request.user_id,
      `Admin đã duyệt yêu cầu sửa lịch rảnh tháng ${request.month}/${request.year}`,
      "AVAILABILITY_EDIT_APPROVED",
      id
    );
    return;
  }

  await model.markEditRejected(id);
  await model.createNotification(
    request.user_id,
    `Admin đã từ chối yêu cầu sửa lịch rảnh tháng ${request.month}/${request.year}`,
    "AVAILABILITY_EDIT_REJECTED",
    id
  );
};

export const listAvailabilityRequests = async () => {
  return await model.listRequests();
};

export const remindAvailabilityRequest = async (id) => {
  const request = await model.getRequestById(id);
  if (!request) throw new Error("Request not found");

  if (["APPROVED", "SUBMITTED", "EDIT_PENDING", "EDIT_APPROVED"].includes(request.status)) {
    throw new Error("Nhân viên này đã nhập lịch rảnh");
  }

  await model.createNotification(
    request.user_id,
    `Nhắc nhở: vui lòng nhập lịch rảnh tháng ${request.month}/${request.year}`,
    "AVAILABILITY_FILL_REMINDER",
    id
  );

  let email = { sent: false, reason: "not_attempted" };
  try {
    email = await sendUserEmail(request.user_id, "availability", {
      subject: `Qshift: nhắc đăng ký lịch rảnh tháng ${request.month}/${request.year}`,
      text: `Bạn vẫn chưa lưu lịch rảnh tháng ${request.month}/${request.year}. Vui lòng đăng nhập Qshift để hoàn tất.`,
    });
  } catch (error) {
    console.warn("[availability] Reminder email failed:", error.message);
    email = { sent: false, reason: "delivery_failed" };
  }

  return { email };
};

export const deleteAvailabilityRequest = async (id) => {
  const deleted = await model.deleteRequest(id);
  if (!deleted) throw new Error("Request not found");
};

export const approveRequest = async (id) => {
  console.log(`Approving request ID: ${id}`);

  const r = await model.getRequestById(id);
  if (!r) throw new Error("Request not found");

  let empId = r.employee_id;
  if (!empId && r.user_id) {
    const [emps] = await db.query(
      "SELECT employee_id FROM employees WHERE user_id=?",
      [r.user_id]
    );
    empId = emps[0]?.employee_id;
  }

  if (!empId) {
    throw new Error("Could not find employee_id for this request");
  }

  let availability;
  try {
    availability = typeof r.data === "string" ? JSON.parse(r.data) : r.data;
  } catch (parseErr) {
    throw new Error(`Invalid availability data: ${parseErr.message}`);
  }

  if (!Array.isArray(availability)) {
    throw new Error("Availability data must be an array");
  }

  await model.save({
    employee_id: empId,
    availability,
    month: r.month,
    year: r.year,
  });

  await model.updateRequestStatus(id, "APPROVED");

  await model.createNotification(
    r.user_id,
    `Lịch tháng ${r.month}/${r.year} đã được chấp nhận`
  );
};

export const rejectRequest = async (id) => {
  console.log(`Rejecting request ID: ${id}`);

  const r = await model.getRequestById(id);
  if (!r) throw new Error("Request not found");

  if (!r.user_id) {
    throw new Error("user_id not found in request");
  }

  await model.updateRequestStatus(id, "REJECTED");

  await model.createNotification(
    r.user_id,
    `Lịch tháng ${r.month}/${r.year} đã bị từ chối`,
    "AVAILABILITY_REJECTED",
    id
  );
};
