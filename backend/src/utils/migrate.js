import db from "../config/db.js";

export const runMigrations = async () => {
  try {
    console.log("🔄 Checking for pending migrations...");

    // Check if schedules table exists
    const [scheduleTable] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_NAME='schedules' AND TABLE_SCHEMA=DATABASE()`
    );

    if (scheduleTable.length === 0) {
      console.log("⏳ Running migration: Create schedules table...");
      
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS schedules (
            schedule_id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            shift_id INT NOT NULL,
            work_date DATE NOT NULL,
            status ENUM('DRAFT', 'PUBLISHED') DEFAULT 'DRAFT',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_schedule (employee_id, shift_id, work_date),
            FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
            FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE CASCADE,
            INDEX idx_status (status),
            INDEX idx_work_date (work_date)
          )
        `);
        console.log("✅ Created schedules table");
      } catch (e) {
        console.warn("⚠️ Error creating schedules table:", e.message);
      }
    } else {
      console.log("✅ Schedules table already exists");
    }

    // Check if employee_id column exists
    const [columns] = await db.query(
      `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
       WHERE TABLE_NAME='availability_requests' AND COLUMN_NAME='employee_id'`
    );

    if (columns.length === 0) {
      console.log("⏳ Running migration: Add employee_id to availability_requests...");
      
      try {
        await db.query(
          `ALTER TABLE availability_requests ADD COLUMN employee_id INT DEFAULT NULL AFTER user_id`
        );
        console.log("✅ Added employee_id column");
      } catch (e) {
        console.warn("⚠️ Column might already exist:", e.message);
      }

      try {
        await db.query(
          `ALTER TABLE availability_requests ADD CONSTRAINT fk_requests_employee 
           FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE`
        );
        console.log("✅ Added foreign key constraint");
      } catch (e) {
        console.warn("⚠️ Constraint might already exist:", e.message);
      }

      console.log("✅ Migration completed successfully");
    } else {
      console.log("✅ Database schema is up to date");
    }

    // Fix: Set all PENDING to NULL
    try {
      const [result] = await db.query(
        `UPDATE availability_requests SET status = NULL WHERE status = 'PENDING'`
      );
      if (result.changedRows > 0) {
        console.log(`✅ Fixed ${result.changedRows} PENDING requests to NULL`);
      }
    } catch (e) {
      console.warn("⚠️ Could not update status:", e.message);
    }

    // Check if roles table exists
    const [rolesTable] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_NAME='roles' AND TABLE_SCHEMA=DATABASE()`
    );

    if (rolesTable.length === 0) {
      console.log("⏳ Running migration: Create roles table...");
      
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS roles (
            role_id INT AUTO_INCREMENT PRIMARY KEY,
            role_name VARCHAR(100) NOT NULL UNIQUE,
            description TEXT,
            color VARCHAR(7) DEFAULT '#3B82F6',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          )
        `);
        console.log("✅ Created roles table");

        // Insert default roles
        await db.query(`
          INSERT INTO roles (role_name, description, color) VALUES
          ('Thu ngân', 'Cashier - Tính tiền', '#3B82F6'),
          ('Chạy bàn', 'Waiter - Phục vụ bàn', '#10B981'),
          ('Nấu ăn', 'Chef - Nấu ăn', '#F59E0B'),
          ('Quản lý', 'Manager - Quản lý', '#EF4444')
          ON DUPLICATE KEY UPDATE role_name = VALUES(role_name)
        `);
        console.log("✅ Inserted default roles");
      } catch (e) {
        console.warn("⚠️ Error creating roles table:", e.message);
      }
    }

    // Check if employee_role_assignments table exists
    const [assignmentTable] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_NAME='employee_role_assignments' AND TABLE_SCHEMA=DATABASE()`
    );

    if (assignmentTable.length === 0) {
      console.log("⏳ Running migration: Create employee_role_assignments table...");
      
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS employee_role_assignments (
            id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            role_id INT NOT NULL,
            assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE KEY unique_assignment (employee_id, role_id),
            FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE
          )
        `);
        console.log("✅ Created employee_role_assignments table");
      } catch (e) {
        console.warn("⚠️ Error creating employee_role_assignments table:", e.message);
      }
    }

    // Check if shift_role_requirements table exists
    const [requirementTable] = await db.query(
      `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
       WHERE TABLE_NAME='shift_role_requirements' AND TABLE_SCHEMA=DATABASE()`
    );

    if (requirementTable.length === 0) {
      console.log("⏳ Running migration: Create shift_role_requirements table...");
      
      try {
        await db.query(`
          CREATE TABLE IF NOT EXISTS shift_role_requirements (
            id INT AUTO_INCREMENT PRIMARY KEY,
            shift_id INT NOT NULL,
            day_of_week INT,
            role_id INT NOT NULL,
            required_count INT DEFAULT 1,
            UNIQUE KEY unique_requirement (shift_id, day_of_week, role_id),
            FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE CASCADE,
            FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE
          )
        `);
        console.log("✅ Created shift_role_requirements table");
      } catch (e) {
        console.warn("⚠️ Error creating shift_role_requirements table:", e.message);
      }
    }

    // Add role_id column to schedules if needed
    try {
      const [scheduleColumns] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_NAME='schedules' AND COLUMN_NAME='role_id'`
      );

      if (scheduleColumns.length === 0) {
        console.log("⏳ Running migration: Add role_id to schedules...");
        
        await db.query(
          `ALTER TABLE schedules ADD COLUMN role_id INT DEFAULT NULL AFTER status`
        );
        
        await db.query(
          `ALTER TABLE schedules ADD CONSTRAINT fk_schedules_role 
           FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE SET NULL`
        );
        console.log("✅ Added role_id column to schedules");
      }
    } catch (e) {
      console.warn("⚠️ role_id column might already exist:", e.message);
    }

    // Ensure attendance table exists
    try {
      const [attendanceTable] = await db.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_NAME='attendance' AND TABLE_SCHEMA=DATABASE()`
      );

      if (attendanceTable.length === 0) {
        console.log("Running migration: Create attendance table...");

        await db.query(`
          CREATE TABLE IF NOT EXISTS attendance (
            attendance_id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            schedule_id INT NOT NULL,
            check_in DATETIME,
            check_out DATETIME,
            status VARCHAR(50),
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            UNIQUE KEY unique_attendance_schedule (schedule_id),
            FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
            FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE CASCADE,
            INDEX idx_attendance_employee (employee_id),
            INDEX idx_attendance_check_in (check_in)
          )
        `);
        console.log("Created attendance table");
      }
    } catch (e) {
      console.warn("Could not ensure attendance table:", e.message);
    }

    // Add avatar_url column to employees if needed
    try {
      const [employeeColumns] = await db.query(
        `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS 
         WHERE TABLE_NAME='employees' AND COLUMN_NAME='avatar_url'`
      );

      if (employeeColumns.length === 0) {
        console.log("Running migration: Add avatar_url to employees...");
        await db.query(
          `ALTER TABLE employees ADD COLUMN avatar_url LONGTEXT DEFAULT NULL AFTER phone`
        );
        console.log("Added avatar_url column to employees");
      } else {
        await db.query(
          `ALTER TABLE employees MODIFY COLUMN avatar_url LONGTEXT DEFAULT NULL`
        );
      }
    } catch (e) {
      console.warn("Could not ensure employees.avatar_url:", e.message);
    }

    try {
      const profileColumns = [
        ["address", "TEXT DEFAULT NULL AFTER avatar_url"],
        ["birth_date", "DATE DEFAULT NULL AFTER address"],
        ["gender", "VARCHAR(30) DEFAULT NULL AFTER birth_date"],
        ["emergency_contact", "VARCHAR(255) DEFAULT NULL AFTER gender"],
        ["emergency_phone", "VARCHAR(50) DEFAULT NULL AFTER emergency_contact"],
      ];

      for (const [columnName, columnDefinition] of profileColumns) {
        const [employeeProfileColumns] = await db.query(
          `SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
           WHERE TABLE_NAME='employees' AND COLUMN_NAME=? AND TABLE_SCHEMA=DATABASE()`,
          [columnName]
        );

        if (employeeProfileColumns.length === 0) {
          await db.query(
            `ALTER TABLE employees ADD COLUMN ${columnName} ${columnDefinition}`
          );
        }
      }
    } catch (e) {
      console.warn("Could not ensure employee profile columns:", e.message);
    }

    // Ensure payroll feedback table exists
    try {
      const [payrollFeedbackTable] = await db.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_NAME='payroll_feedback' AND TABLE_SCHEMA=DATABASE()`
      );

      if (payrollFeedbackTable.length === 0) {
        console.log("Running migration: Create payroll_feedback table...");
        await db.query(`
          CREATE TABLE IF NOT EXISTS payroll_feedback (
            feedback_id INT AUTO_INCREMENT PRIMARY KEY,
            employee_id INT NOT NULL,
            subject VARCHAR(255) NOT NULL,
            content TEXT NOT NULL,
            status ENUM('PENDING','ANSWERED','REJECTED') DEFAULT 'PENDING',
            admin_reply TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            responded_at TIMESTAMP NULL DEFAULT NULL,
            FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
            INDEX idx_payroll_feedback_employee (employee_id),
            INDEX idx_payroll_feedback_status (status)
          )
        `);
        console.log("Created payroll_feedback table");
      }
    } catch (e) {
      console.warn("Could not ensure payroll_feedback table:", e.message);
    }

    // Ensure shift swap requests table exists
    try {
      const [shiftSwapTable] = await db.query(
        `SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES 
         WHERE TABLE_NAME='shift_swap_requests' AND TABLE_SCHEMA=DATABASE()`
      );

      if (shiftSwapTable.length === 0) {
        console.log("Running migration: Create shift_swap_requests table...");
        await db.query(`
          CREATE TABLE IF NOT EXISTS shift_swap_requests (
            swap_request_id INT AUTO_INCREMENT PRIMARY KEY,
            requester_employee_id INT NOT NULL,
            target_employee_id INT NOT NULL,
            requester_schedule_id INT NOT NULL,
            target_schedule_id INT NOT NULL,
            status VARCHAR(40) NOT NULL DEFAULT 'PENDING_TARGET',
            requester_note TEXT,
            target_response_at TIMESTAMP NULL,
            admin_cancel_reason TEXT,
            admin_cancelled_at TIMESTAMP NULL,
            admin_revert_reason TEXT,
            admin_reverted_at TIMESTAMP NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (requester_employee_id) REFERENCES employees(employee_id),
            FOREIGN KEY (target_employee_id) REFERENCES employees(employee_id),
            FOREIGN KEY (requester_schedule_id) REFERENCES schedules(schedule_id),
            FOREIGN KEY (target_schedule_id) REFERENCES schedules(schedule_id),
            INDEX idx_shift_swap_status (status),
            INDEX idx_shift_swap_requester (requester_employee_id),
            INDEX idx_shift_swap_target (target_employee_id)
          )
        `);
        console.log("Created shift_swap_requests table");
      }
    } catch (e) {
      console.warn("Could not ensure shift_swap_requests table:", e.message);
    }

  } catch (err) {
    console.error("❌ Migration error:", err.message);
    // Don't throw - app can continue even if migration fails
  }
};
