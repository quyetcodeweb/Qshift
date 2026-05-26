import * as model from "../models/availability.model.js";
import db from "../config/db.js";

export const save = async (data) => {
  return await model.save(data);
};

export const get = async (employee_id, month, year) => {
  return await model.get(employee_id, month, year);
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
  const editableStatuses = new Set(["PENDING", "EDIT_APPROVED", null, undefined]);

  if (latestRequest && !editableStatuses.has(latestRequest.status)) {
    throw new Error("Lịch rảnh đã được lưu. Vui lòng gửi yêu cầu sửa nếu cần cập nhật.");
  }

  const requestId = latestRequest?.id || await model.createRequest(user_id, month, year, data);

  await model.save({
    employee_id: employee.employee_id,
    availability: data,
    month,
    year,
  });

  if (latestRequest) {
    await model.updateRequestDataAndStatus(latestRequest.id, data, "SUBMITTED");
  } else {
    await model.updateRequestDataAndStatus(requestId, data, "SUBMITTED");
  }

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
  const requests = await model.createFillRequests(month, year, employeeId);

  for (const request of requests) {
    await model.deleteNotificationsByType(request.request_id, ["AVAILABILITY_FILL_REQUEST"]);
    await model.createNotification(
      request.user_id,
      `Hãy điền lịch rảnh vào tháng ${month}/${year}`,
      "AVAILABILITY_FILL_REQUEST",
      request.request_id
    );
  }

  if (!employeeId) {
    const admins = await model.getAdmins();
    for (const admin of admins) {
      await model.createNotification(
        admin.user_id,
        `Đã gửi yêu cầu điền lịch rảnh tháng ${month}/${year} cho ${requests.length} nhân viên`,
        "AVAILABILITY_FILL_REQUEST_SENT",
        null
      );
    }
  }

  return requests.length;
};

export const getMyAvailabilityRequest = async (user_id, month, year) => {
  const request = await model.findLatestRequest(user_id, month, year);
  if (!request) return null;

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
  };
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
