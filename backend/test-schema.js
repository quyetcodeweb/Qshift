import database from "./src/config/db.js";

async function test() {
  try {
    const [cols] = await database.query("DESCRIBE employee_role_assignments");
    console.log("employee_role_assignments schema:");
    console.table(cols);

    // Try to insert a test role assignment
    const [employees] = await database.query("SELECT employee_id FROM employees LIMIT 1");
    if (employees.length > 0) {
      const employeeId = employees[0].employee_id;
      console.log("\nAttempting to insert role assignment for employee_id:", employeeId);
      
      try {
        const [result] = await database.query(
          `INSERT INTO employee_role_assignments (employee_id, role_id) VALUES (?, ?)`,
          [employeeId, 1]
        );
        console.log("✅ Inserted successfully:", result);
      } catch (insertErr) {
        console.error("❌ Insert error:", insertErr.message);
      }
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

test();
