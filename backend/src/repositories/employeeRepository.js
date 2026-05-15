const db = require("../config/db");

exports.findAll = async () => {
  const [rows] = await db.query("SELECT * FROM employees");
  return rows;
};

exports.create = async (data) => {
  const [result] = await db.query(
    "INSERT INTO employees (user_id, name, email, phone, hourly_rate) VALUES (?, ?, ?, ?, ?)",
    [data.user_id, data.name, data.email, data.phone, data.hourly_rate]
  );
  return result;
};