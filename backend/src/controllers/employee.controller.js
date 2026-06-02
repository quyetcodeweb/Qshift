import * as employeeService from "../services/employee.service.js";
import {
  createAndSendOtp,
  getEmailPreferences,
  saveEmailPreferences,
} from "../services/emailNotification.service.js";

export const createEmployee = async (req, res) => {
  try {
    const employee = await employeeService.createEmployee(req.body);
    res.json({ message: "Employee created", employee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getEmployees = async (req, res) => {
  try {
    res.json(await employeeService.getEmployees());
  } catch (err) {
    console.error("[getEmployees] Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const getMyProfile = async (req, res) => {
  try {
    const employee = await employeeService.getMyProfile(req.user?.user_id);

    if (!employee) {
      return res.status(404).json({ message: "Không tìm thấy hồ sơ nhân viên" });
    }

    res.json(employee);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMyEmailPreferences = async (req, res) => {
  try {
    const employee = await employeeService.getMyProfile(req.user?.user_id);
    if (!employee) return res.status(404).json({ message: "Không tìm thấy hồ sơ nhân viên" });
    res.json(await getEmailPreferences(employee.employee_id));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateMyEmailPreferences = async (req, res) => {
  try {
    const employee = await employeeService.getMyProfile(req.user?.user_id);
    if (!employee) return res.status(404).json({ message: "Không tìm thấy hồ sơ nhân viên" });
    res.json(await saveEmailPreferences(employee.employee_id, req.body || {}));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const sendEmailOtp = async (req, res) => {
  try {
    const employee = await employeeService.getMyProfile(req.user?.user_id);
    if (!employee) return res.status(404).json({ message: "Không tìm thấy hồ sơ nhân viên" });
    const purpose = req.body?.purpose === "password_change" ? "password_change" : "email_change";
    const targetEmail = purpose === "email_change"
      ? employee.email
      : employee.email;
    const result = await createAndSendOtp({
      userId: req.user.user_id,
      employeeId: employee.employee_id,
      purpose,
      targetEmail,
    });
    res.json(result);
  } catch (err) {
    res.status(err.statusCode || 500).json({ message: err.message });
  }
};

export const getEmployeeById = async (req, res) => {
  try {
    const employeeId = Number(req.params.id);

    if (!employeeId) {
      return res.status(400).json({ message: "employee_id không hợp lệ" });
    }

    const employee = await employeeService.getEmployeeById(employeeId);

    if (!employee) {
      return res.status(404).json({ message: "Không tìm thấy nhân viên" });
    }

    res.json(employee);
  } catch (err) {
    console.error("[getEmployeeById] Error:", err);
    res.status(500).json({ error: err.message });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const user = req.user;

    if (!employeeId) {
      return res.status(400).json({ message: "employee_id không hợp lệ" });
    }

    const targetEmployee = await employeeService.getEmployeeById(employeeId);

    if (!targetEmployee) {
      return res.status(404).json({ message: "Không tìm thấy nhân viên" });
    }

    if (user?.role !== "ADMIN" && targetEmployee.user_id !== user?.user_id) {
      return res.status(403).json({ message: "Không có quyền cập nhật hồ sơ này" });
    }

    const payload = { ...req.body };

    if (user?.role !== "ADMIN") {
      payload.hourly_rate = targetEmployee.hourly_rate;

      const oldEmail = String(targetEmployee.email || "").trim();
      const nextEmail = String(payload.email || "").trim();
      if (oldEmail && nextEmail && oldEmail !== nextEmail) {
        await employeeService.verifyEmployeeEmailChangeOtp(user.user_id, req.body?.emailOtp);
      }
    }

    const updated = await employeeService.updateEmployee(employeeId, payload);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const employeeId = Number(req.params.id);
    const user = req.user;

    if (user?.role !== "ADMIN") {
      return res.status(403).json({ message: "Chỉ admin có thể xóa nhân viên" });
    }

    if (!employeeId) {
      return res.status(400).json({ message: "employee_id không hợp lệ" });
    }

    await employeeService.deleteEmployee(employeeId);
    res.json({ message: "Đã xóa nhân viên" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
