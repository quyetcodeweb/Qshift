
use qshift
-- USERS
CREATE TABLE users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255),
    role ENUM('ADMIN','EMPLOYEE'),
    status BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- EMPLOYEES
CREATE TABLE employees (
    employee_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,
    name VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    hourly_rate DECIMAL(10,2),
    hire_date DATE,
    status VARCHAR(50),
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);

-- SHIFTS
CREATE TABLE shifts (
    shift_id INT AUTO_INCREMENT PRIMARY KEY,
    shift_name VARCHAR(50),
    start_time TIME,
    end_time TIME,
    description VARCHAR(255)
);

-- SHIFT REQUIREMENTS
CREATE TABLE shift_requirements (
    requirement_id INT AUTO_INCREMENT PRIMARY KEY,
    shift_id INT,
    day_of_week INT,
    required_employees INT,
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id)
);

-- EMPLOYEE AVAILABILITY
CREATE TABLE employee_availability (
    availability_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT,
    shift_id INT,
    day_of_week INT,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id)
);

-- SCHEDULES
CREATE TABLE schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT,
    shift_id INT,
    work_date DATE,
    status ENUM('DRAFT','PUBLISHED'),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id),
    UNIQUE(employee_id, work_date, shift_id) -- tránh trùng ca
);

-- ATTENDANCE
CREATE TABLE attendance (
    attendance_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT,
    schedule_id INT,
    check_in DATETIME,
    check_out DATETIME,
    status VARCHAR(50),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id)
);

-- PAYROLL
CREATE TABLE payroll (
    payroll_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT,
    month INT,
    year INT,
    total_hours DECIMAL(10,2),
    total_salary DECIMAL(10,2),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id)
);

-- REQUESTS
CREATE TABLE requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT,
    request_type ENUM('LEAVE','SWAP'),
    schedule_id INT,
    target_employee_id INT,
    start_date DATE,
    end_date DATE,
    reason TEXT,
    status ENUM('PENDING','APPROVED','REJECTED'),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    FOREIGN KEY (target_employee_id) REFERENCES employees(employee_id),
    FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id)
);

-- NOTIFICATIONS
CREATE TABLE notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    message TEXT,
    type VARCHAR(50),
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id)
);
ALTER TABLE employee_availability 
CHANGE day_of_week work_date DATE;

CREATE TABLE availability_requests (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id INT,
  month INT,
  year INT,
  data JSON, -- lịch rảnh mới
  status ENUM('PENDING','APPROVED','REJECTED') DEFAULT 'PENDING',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE notifications ADD ref_id INT;
ALTER TABLE availability_requests ADD COLUMN employee_id INT DEFAULT NULL AFTER user_id;
ALTER TABLE availability_requests ADD FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE;
ALTER TABLE schedules 
DROP INDEX employee_id;

ALTER TABLE schedules 
ADD UNIQUE (employee_id, work_date, shift_id, status);
-- Add schedule_settings table for storing scheduling algorithm preferences
CREATE TABLE IF NOT EXISTS schedule_settings (
  setting_id INT PRIMARY KEY AUTO_INCREMENT,
  balance_scheduling BOOLEAN DEFAULT FALSE COMMENT 'Enable balanced work distribution',
  prefer_consecutive_shifts BOOLEAN DEFAULT FALSE COMMENT 'Prefer consecutive shifts for employees',
  balance_by_workday BOOLEAN DEFAULT FALSE COMMENT 'Balance by number of working days in generated schedule',
  allow_role_fallback BOOLEAN DEFAULT FALSE COMMENT 'Allow filling missing role slots with other available employees',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Add balance_value column to employees table for tracking work assignments
-- For existing DBs on older MySQL, add this manually if missing:
-- ALTER TABLE employees ADD COLUMN balance_value INT DEFAULT 0;

-- ROLES
CREATE TABLE IF NOT EXISTS roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- For existing DBs on older MySQL, add this manually if missing:
-- ALTER TABLE schedules ADD COLUMN role_id INT NULL AFTER shift_id;

CREATE TABLE IF NOT EXISTS employee_role_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    role_id INT NOT NULL,
    assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    UNIQUE KEY unique_employee_role (employee_id, role_id)
);

CREATE TABLE IF NOT EXISTS shift_role_requirements (
    id INT AUTO_INCREMENT PRIMARY KEY,
    shift_id INT NOT NULL,
    day_of_week INT,
    role_id INT NOT NULL,
    required_count INT DEFAULT 1,
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    UNIQUE KEY unique_shift_role (shift_id, day_of_week, role_id)
);

-- DRAFT SCHEDULES
CREATE TABLE IF NOT EXISTS draft_schedules (
    draft_id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    created_by INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS draft_schedule_items (
    id INT AUTO_INCREMENT PRIMARY KEY,
    draft_id INT NOT NULL,
    employee_id INT NOT NULL,
    shift_id INT NOT NULL,
    work_date DATE NOT NULL,
    role_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (draft_id) REFERENCES draft_schedules(draft_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id),
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id),
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE SET NULL
);
