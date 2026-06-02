import database from "../config/db.js";

export async function getRoles(req, res) {
  try {
    const [roles] = await database.query(
      `SELECT role_id, role_name, description, color 
       FROM roles 
       ORDER BY role_name ASC`
    );
    res.json(roles);
  } catch (error) {
    console.error("[getRoles] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function createRole(req, res) {
  try {
    const { role_name, description, color } = req.body;

    if (!role_name) {
      return res.status(400).json({ message: "role_name is required" });
    }

    const [result] = await database.query(
      `INSERT INTO roles (role_name, description, color) 
       VALUES (?, ?, ?)`,
      [role_name, description || null, color || "#3B82F6"]
    );

    res.json({
      role_id: result.insertId,
      role_name,
      description,
      color,
    });
  } catch (error) {
    console.error("[createRole] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getEmployeeRoles(req, res) {
  try {
    const { employee_id } = req.params;

    const [roles] = await database.query(
      `SELECT r.role_id, r.role_name, r.description, r.color
       FROM roles r
       INNER JOIN employee_role_assignments era ON r.role_id = era.role_id
       WHERE era.employee_id = ?
       ORDER BY r.role_name ASC`,
      [employee_id]
    );

    res.json(roles);
  } catch (error) {
    console.error("[getEmployeeRoles] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getEmployeeRoleAssignments(req, res) {
  try {
    const [roles] = await database.query(
      `SELECT
         era.employee_id,
         r.role_id,
         r.role_name,
         r.description,
         r.color
       FROM employee_role_assignments era
       INNER JOIN roles r ON r.role_id = era.role_id
       ORDER BY era.employee_id ASC, r.role_name ASC`
    );

    res.json(roles);
  } catch (error) {
    console.error("[getEmployeeRoleAssignments] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function assignRoleToEmployee(req, res) {
  try {
    const { employee_id } = req.params;
    const { role_id } = req.body;

    if (!role_id) {
      return res.status(400).json({ message: "role_id is required" });
    }

    await database.query(
      `INSERT INTO employee_role_assignments (employee_id, role_id)
       VALUES (?, ?)
       ON DUPLICATE KEY UPDATE assigned_date = NOW()`,
      [employee_id, role_id]
    );

    res.json({ message: "Role assigned successfully" });
  } catch (error) {
    console.error("[assignRoleToEmployee] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function removeRoleFromEmployee(req, res) {
  try {
    const { employee_id, role_id } = req.params;

    await database.query(
      `DELETE FROM employee_role_assignments
       WHERE employee_id = ? AND role_id = ?`,
      [employee_id, role_id]
    );

    res.json({ message: "Role removed successfully" });
  } catch (error) {
    console.error("[removeRoleFromEmployee] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function getShiftRoleRequirements(req, res) {
  try {
    const { shift_id } = req.params;

    const [requirements] = await database.query(
      `SELECT srr.id, srr.shift_id, srr.day_of_week, srr.role_id, srr.required_count,
              r.role_name, r.color
       FROM shift_role_requirements srr
       LEFT JOIN roles r ON srr.role_id = r.role_id
       WHERE srr.shift_id = ?
       ORDER BY r.role_name ASC`,
      [shift_id]
    );

    res.json(requirements);
  } catch (error) {
    console.error("[getShiftRoleRequirements] Error:", error);
    res.status(500).json({ message: error.message });
  }
}

export async function setShiftRoleRequirements(req, res) {
  try {
    const { shift_id } = req.params;
    const { requirements } = req.body; // Array of {role_id, day_of_week, required_count}

    if (!Array.isArray(requirements)) {
      return res.status(400).json({ message: "requirements must be an array" });
    }

    const connection = await database.getConnection();

    try {
      await connection.beginTransaction();

      // Delete existing requirements for this shift
      await connection.query(
        `DELETE FROM shift_role_requirements WHERE shift_id = ?`,
        [shift_id]
      );

      // Insert new requirements
      for (const req of requirements) {
        const { role_id, day_of_week, required_count } = req;
        await connection.query(
          `INSERT INTO shift_role_requirements (shift_id, day_of_week, role_id, required_count)
           VALUES (?, ?, ?, ?)`,
          [shift_id, day_of_week || 0, role_id, required_count || 1]
        );
      }

      await connection.commit();
      res.json({ message: "Shift role requirements updated" });
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error("[setShiftRoleRequirements] Error:", error);
    res.status(500).json({ message: error.message });
  }
}
