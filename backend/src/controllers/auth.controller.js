import db from "../config/db.js";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "Vui lòng nhập tên đăng nhập và mật khẩu" });
    }

    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        message: "Lỗi hệ thống",
      });
    }

    const [rows] = await db.query(
      "SELECT * FROM users WHERE username = ?",
      [username],
    );

    if (rows.length === 0) {
      return res.status(400).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });
    }

    const user = rows[0];

    if (!user.status) {
      return res.status(403).json({ message: "Tài khoản đã bị vô hiệu hóa" });
    }

    if (!user.password) {
      return res.status(500).json({
        message: "Lỗi hệ thống",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: "Tên đăng nhập hoặc mật khẩu không đúng" });
    }

    if (user.role === "EMPLOYEE") {
      const [empRows] = await db.query(
        "SELECT employee_id FROM employees WHERE user_id = ?",
        [user.user_id],
      );
      if (empRows.length > 0) {
        user.employee_id = empRows[0].employee_id;
      }
    }

    delete user.password;

    const token = jwt.sign(
      { user_id: user.user_id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" },
    );

    res.json({ token, user });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    res.status(500).json({
      message: "Lỗi hệ thống",
    });
  }
};
