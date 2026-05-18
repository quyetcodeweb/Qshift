import * as shiftService from "../services/shift.service.js";

export const getShifts = async (req, res) => {
  try {
    const data = await shiftService.fetchAllShifts();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const createShift = async (req, res) => {
  try {
    await shiftService.addShift(req.body);
    res.json({ message: "Created" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

export const updateShift = async (req, res) => {
  try {
    await shiftService.editShift(req.params.id, req.body);
    res.json({ message: "Updated" });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message });
  }
};

export const deleteShift = async (req, res) => {
  try {
    await shiftService.removeShift(req.params.id);
    res.json({ message: "Xóa ca và dữ liệu liên quan thành công" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
