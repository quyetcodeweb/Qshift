import * as model from "../models/availability.model.js";
import db from "../config/db.js";

export const save = async (data) => {
  return await model.save(data);
};

export const get = async (employee_id, month, year) => {
  return await model.get(employee_id, month, year);
};

export const requestAvailability = async (user_id, month, year, data) => {
  console.log(`🔔 Creating availability request for user ${user_id}, ${month}/${year}, ${data.length} items`);
  
  const requestId = await model.createRequest(user_id, month, year, data);
  console.log(`✅ Request created with ID: ${requestId}`);
  
  // Get employee name directly from database
  let employeeName = `User ${user_id}`;
  try {
    const [employees] = await db.query(
      "SELECT name FROM employees WHERE user_id = ?",
      [user_id]
    );
    if (employees.length > 0 && employees[0].name) {
      employeeName = employees[0].name;
    }
  } catch (err) {
    console.warn("Could not get employee name from DB:", err.message);
  }

  console.log(`👤 Employee name: ${employeeName}`);

  const admins = await model.getAdmins();
  console.log(`📢 Sending notifications to ${admins.length} admins`);

  for (const admin of admins) {
    await model.createNotification(
      admin.user_id,
      `${employeeName} đã cập nhật lịch tháng ${month}/${year}`,
      "AVAILABILITY_REQUEST",
      requestId
    );
    console.log(`✅ Notification sent to admin ${admin.user_id}`);
  }
};

export const approveRequest = async (id) => {
  console.log(`📋 Approving request ID: ${id}`);
  
  const r = await model.getRequestById(id);
  if (!r) throw new Error("Request not found");

  console.log(`📦 Request data:`, { user_id: r.user_id, employee_id: r.employee_id, month: r.month, year: r.year, dataRaw: r.data });

  // Fallback: if employee_id is null, try to get it from user_id
  let empId = r.employee_id;
  if (!empId && r.user_id) {
    console.log(`🔍 employee_id is null, looking up from user_id: ${r.user_id}`);
    const [emps] = await db.query(
      "SELECT employee_id FROM employees WHERE user_id=?",
      [r.user_id]
    );
    empId = emps[0]?.employee_id;
    console.log(`✅ Found employee_id: ${empId}`);
  }

  if (!empId) {
    throw new Error("Could not find employee_id for this request");
  }

  // Parse availability data
  let availability;
  try {
    if (typeof r.data === 'string') {
      availability = JSON.parse(r.data);
    } else {
      availability = r.data;
    }
  } catch (parseErr) {
    console.error(`❌ Failed to parse availability data:`, r.data);
    throw new Error(`Invalid availability data: ${parseErr.message}`);
  }

  if (!Array.isArray(availability)) {
    throw new Error("Availability data must be an array");
  }

  console.log(`💾 Saving ${availability.length} availability records for employee ${empId}`);

  await model.save({
    employee_id: empId,
    availability,
  });

  await model.updateRequestStatus(id, "APPROVED");
  console.log(`✅ Request status updated to APPROVED`);

  await model.createNotification(
    r.user_id,
    `Lịch tháng ${r.month}/${r.year} đã được chấp nhận`
  );
};

export const rejectRequest = async (id) => {
  console.log(`📋 Rejecting request ID: ${id}`);
  
  const r = await model.getRequestById(id);
  if (!r) throw new Error("Request not found");

  console.log(`📦 Request data:`, { user_id: r.user_id, month: r.month, year: r.year });

  if (!r.user_id) {
    throw new Error("user_id not found in request");
  }

  await model.updateRequestStatus(id, "REJECTED");
  console.log(`✅ Request status updated to REJECTED`);

  await model.createNotification(
    r.user_id,
    `Lịch tháng ${r.month}/${r.year} đã bị từ chối`,
    "AVAILABILITY_REJECTED",
    id
  );

  console.log(`✅ Notification sent to user ${r.user_id}`);
};