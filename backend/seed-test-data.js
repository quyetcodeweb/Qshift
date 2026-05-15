import database from "./src/config/db.js";
import dotenv from "dotenv";

dotenv.config();

async function seedTestData() {
  const connection = await database.getConnection();

  try {
    await connection.beginTransaction();

    console.log("🌱 Starting to seed test data...");

    // 1. Create test users (admin + employees)
    console.log("📝 Creating users...");
    const adminResult = await connection.query(
      "INSERT IGNORE INTO users (email, password, role) VALUES (?, ?, ?)",
      ["admin@test.com", "hashed_password_admin", "ADMIN"]
    );
    const adminUserId = adminResult[0].insertId || 1;
    console.log("✅ Admin user created/exists with ID:", adminUserId);

    // Create employee users
    const empEmails = [
      "emp1@test.com",
      "emp2@test.com",
      "emp3@test.com",
      "emp4@test.com",
    ];
    const empUserIds = [];
    for (const email of empEmails) {
      const result = await connection.query(
        "INSERT IGNORE INTO users (email, password, role) VALUES (?, ?, ?)",
        [email, "hashed_password", "EMPLOYEE"]
      );
      empUserIds.push(result[0].insertId || (await getExistingUserId(connection, email)));
    }
    console.log("✅ Employee users created/exist");

    // 2. Create employees
    console.log("📝 Creating employees...");
    const empNames = ["Nguyễn Văn A", "Trần Thị B", "Lê Văn C", "Phạm Thị D"];
    const empIds = [];
    for (let i = 0; i < empNames.length; i++) {
      const result = await connection.query(
        "INSERT IGNORE INTO employees (user_id, name, email) VALUES (?, ?, ?)",
        [empUserIds[i], empNames[i], empEmails[i]]
      );
      empIds.push(result[0].insertId || (await getExistingEmpId(connection, empNames[i])));
    }
    console.log("✅ Employees created/exist:", empNames.join(", "));

    // 3. Create shifts
    console.log("📝 Creating shifts...");
    const shifts = [
      { name: "Sáng", start: "08:00:00", end: "12:00:00" },
      { name: "Chiều", start: "13:00:00", end: "17:00:00" },
      { name: "Tối", start: "18:00:00", end: "22:00:00" },
    ];
    const shiftIds = [];
    for (const shift of shifts) {
      const result = await connection.query(
        "INSERT IGNORE INTO shifts (shift_name, start_time, end_time) VALUES (?, ?, ?)",
        [shift.name, shift.start, shift.end]
      );
      shiftIds.push(result[0].insertId || (await getExistingShiftId(connection, shift.name)));
    }
    console.log("✅ Shifts created/exist:", shifts.map((s) => s.name).join(", "));

    // 4. Create sample schedules for April 2026
    console.log("📝 Creating sample schedules for April 2026...");
    const schedules = [];
    const daysInApril = 30;
    let scheduleCount = 0;

    for (let day = 1; day <= daysInApril; day++) {
      const dateObj = new Date(2026, 3, day); // April 2026
      // Skip weekends
      if (dateObj.getDay() === 0 || dateObj.getDay() === 6) continue;

      const workDate = `2026-04-${String(day).padStart(2, "0")}`;

      // Distribute shifts across employees
      // Morning shift: emp 1,2
      // Afternoon: emp 2,3
      // Evening: emp 3,4

      for (let shiftIndex = 0; shiftIndex < shiftIds.length; shiftIndex++) {
        const empForShift = empIds[shiftIndex % empIds.length];

        const result = await connection.query(
          "INSERT IGNORE INTO schedules (employee_id, shift_id, work_date, status) VALUES (?, ?, ?, ?)",
          [empForShift, shiftIds[shiftIndex], workDate, "DRAFT"]
        );
        if (result[0].affectedRows > 0) {
          scheduleCount++;
        }
      }
    }
    console.log(`✅ Created ${scheduleCount} schedule records`);

    // 5. Create availability records
    console.log("📝 Creating availability records...");
    for (const empId of empIds) {
      for (const shiftId of shiftIds) {
        await connection.query(
          "INSERT IGNORE INTO availability (employee_id, shift_id) VALUES (?, ?)",
          [empId, shiftId]
        );
      }
    }
    console.log("✅ Availability records created/exist");

    await connection.commit();
    console.log("✅✅✅ All test data seeded successfully!");

    // Verify data
    const [userCount] = await connection.query("SELECT COUNT(*) as count FROM users");
    const [empCount] = await connection.query("SELECT COUNT(*) as count FROM employees");
    const [shiftCount] = await connection.query("SELECT COUNT(*) as count FROM shifts");
    const [schedCount] = await connection.query("SELECT COUNT(*) as count FROM schedules");

    console.log("\n📊 Database Summary:");
    console.log("- Users:", userCount[0].count);
    console.log("- Employees:", empCount[0].count);
    console.log("- Shifts:", shiftCount[0].count);
    console.log("- Schedules:", schedCount[0].count);

    // Show sample schedules
    const [sampleSchedules] = await connection.query(
      `SELECT 
        s.work_date, e.name as employee_name, sh.shift_name, s.status
      FROM schedules s
      JOIN employees e ON s.employee_id = e.employee_id
      JOIN shifts sh ON s.shift_id = sh.shift_id
      ORDER BY s.work_date, sh.start_time
      LIMIT 10`
    );
    console.log("\n📅 Sample Schedules:");
    sampleSchedules.forEach((s) => {
      console.log(
        `  ${s.work_date} - ${s.employee_name} (${s.shift_name}) [${s.status}]`
      );
    });
  } catch (error) {
    await connection.rollback();
    console.error("❌ Error seeding data:", error.message);
    throw error;
  } finally {
    connection.release();
  }
}

async function getExistingUserId(connection, email) {
  const [users] = await connection.query("SELECT user_id FROM users WHERE email = ?", [email]);
  return users[0]?.user_id || null;
}

async function getExistingEmpId(connection, name) {
  const [emps] = await connection.query("SELECT employee_id FROM employees WHERE name = ?", [name]);
  return emps[0]?.employee_id || null;
}

async function getExistingShiftId(connection, name) {
  const [shifts] = await connection.query("SELECT shift_id FROM shifts WHERE shift_name = ?", [name]);
  return shifts[0]?.shift_id || null;
}

seedTestData().catch(console.error);
