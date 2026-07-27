import jwt from "jsonwebtoken";
import database from "../config/db.js";

export const verifyToken = async (req, res, next) => {
  const token = req.headers.authorization;

  if (!token || !token.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No token" });
  }

  try {
    const decoded = jwt.verify(token.slice("Bearer ".length), process.env.JWT_SECRET);
    const [users] = await database.query(
      "SELECT user_id, role, status FROM users WHERE user_id = ?",
      [decoded.user_id]
    );
    const user = users[0];

    if (!user || !user.status) {
      return res.status(401).json({ message: "Account is inactive" });
    }

    // Trust current database state, not role/status embedded in a day-long JWT.
    req.user = { user_id: user.user_id, role: user.role };
    next();
  } catch {
    res.status(401).json({ message: "Invalid token" });
  }
};

export const verifyAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== "ADMIN") {
    return res.status(403).json({ message: "Admin access required" });
  }
  next();
};

export const verifyEmployee = (req, res, next) => {
  if (!req.user || req.user.role !== "EMPLOYEE") {
    return res.status(403).json({ message: "Employee access required" });
  }
  next();
};
