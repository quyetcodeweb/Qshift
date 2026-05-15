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

  await model.save({
    employee_id: employee.employee_id,
    availability: data,
  });

  const requestId = await model.createRequest(user_id, month, year, data);
  await model.updateRequestStatus(requestId, "APPROVED");

  const admins = await model.getAdmins();

  for (const admin of admins) {
    await model.createNotification(
      admin.user_id,
      `${employee.name || `User ${user_id}`} đã điền lịch rảnh tháng ${month}/${year}`,
      "AVAILABILITY_SUBMITTED",
      requestId
    );
  }
};

export const sendFillRequestToEmployees = async (month, year) => {
  const requests = await model.createFillRequests(month, year);

  for (const request of requests) {
    await model.createNotification(
      request.user_id,
      `Hãy điền lịch rảnh vào tháng ${month}/${year}`,
      "AVAILABILITY_FILL_REQUEST",
      request.request_id
    );
  }

  return requests.length;
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
