import db from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ message: "Missing data" });
  }

  const [rows] = await db.query(
    "SELECT * FROM users WHERE username = ?",
    [username]
  );

  if (rows.length === 0) {
    return res.status(400).json({ message: "User not found" });
  }

  const user = rows[0];

  const isMatch = await bcrypt.compare(password, user.password);

  if (!isMatch) {
    return res.status(400).json({ message: "Wrong password" });
  }

  // If role is EMPLOYEE, fetch employee_id from employees table
  if (user.role === "EMPLOYEE") {
    const [empRows] = await db.query(
      "SELECT employee_id FROM employees WHERE user_id = ?",
      [user.user_id]
    );
    if (empRows.length > 0) {
      user.employee_id = empRows[0].employee_id;
    }
  }

  const token = jwt.sign(
    { user_id: user.user_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: "1d" }
  );

  res.json({ token, user });
};