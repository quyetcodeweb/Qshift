import * as employeeService from "../services/employee.service.js";

export const createEmployee = async (req, res) => {
  try {
    const employee = await employeeService.createEmployee(req.body);
    res.json({ message: "Employee created", employee });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getEmployees = async (req, res) => {
  res.json(await employeeService.getEmployees());
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
