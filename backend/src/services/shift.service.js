import * as shiftModel from "../models/shift.model.js";

export const fetchAllShifts = async () => {
  return await shiftModel.getAllShifts();
};

export const addShift = async (data) => {
  return await shiftModel.createShift(data);
};

export const editShift = async (id, data) => {
  return await shiftModel.updateShift(id, data);
};

export const removeShift = async (id) => {
  return await shiftModel.deleteShift(id);
};