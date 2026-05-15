import database from "./src/config/db.js";

async function test() {
  try {
    // Check if roles table exists
    const [tables] = await database.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_NAME='roles' AND TABLE_SCHEMA=DATABASE()`
    );
    console.log("Roles table exists:", tables.length > 0);

    // Get all roles
    const [roles] = await database.query("SELECT * FROM roles");
    console.log("Roles in database:", roles);

    if (roles.length === 0) {
      console.log("\n⏳ Inserting default roles...");
      await database.query(`
        INSERT INTO roles (role_name, description, color) VALUES
        ('Thu ngân', 'Nhân viên thu ngân', '#3B82F6'),
        ('Chạy bàn', 'Nhân viên chạy bàn', '#10B981'),
        ('Nấu ăn', 'Nhân viên nấu ăn', '#F59E0B'),
        ('Quản lý', 'Quản lý ca làm', '#EF4444')
      `);
      console.log("✅ Default roles inserted");

      // Verify
      const [rolesAfter] = await database.query("SELECT * FROM roles");
      console.log("Roles after insert:", rolesAfter);
    }

    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err.message);
    process.exit(1);
  }
}

test();
