-- Qshift database schema
-- Accounts:
--   admin / password: 1
--   client: 0123456789 / password: A56789

CREATE DATABASE IF NOT EXISTS qshift CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE qshift;

-- USERS
CREATE TABLE IF NOT EXISTS users (
    user_id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) UNIQUE,
    password VARCHAR(255),
    role ENUM('ADMIN','EMPLOYEE'),
    status BOOLEAN DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- EMPLOYEES
CREATE TABLE IF NOT EXISTS employees (
    employee_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT UNIQUE,
    name VARCHAR(100),
    email VARCHAR(100),
    phone VARCHAR(20),
    avatar_url LONGTEXT DEFAULT NULL,
    address TEXT DEFAULT NULL,
    birth_date DATE DEFAULT NULL,
    gender VARCHAR(30) DEFAULT NULL,
    emergency_contact VARCHAR(255) DEFAULT NULL,
    emergency_phone VARCHAR(50) DEFAULT NULL,
    hourly_rate DECIMAL(10,2),
    hire_date DATE,
    status VARCHAR(50),
    balance_value INT DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- SHIFTS
CREATE TABLE IF NOT EXISTS shifts (
    shift_id INT AUTO_INCREMENT PRIMARY KEY,
    shift_name VARCHAR(50),
    start_time TIME,
    end_time TIME,
    description VARCHAR(255)
);

-- SHIFT REQUIREMENTS
CREATE TABLE IF NOT EXISTS shift_requirements (
    requirement_id INT AUTO_INCREMENT PRIMARY KEY,
    shift_id INT,
    day_of_week INT,
    required_employees INT,
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE CASCADE
);

-- ROLES
CREATE TABLE IF NOT EXISTS roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO roles (role_name, description, color) VALUES
('Thu ngân', 'Nhân viên thu ngân', '#3B82F6'),
('Chạy bàn', 'Nhân viên chạy bàn', '#10B981'),
('Nấu ăn', 'Nhân viên nấu ăn', '#F59E0B'),
('Quản lý', 'Quản lý ca làm', '#EF4444')
ON DUPLICATE KEY UPDATE role_id = role_id;

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

-- EMPLOYEE AVAILABILITY
CREATE TABLE IF NOT EXISTS employee_availability (
    availability_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    shift_id INT NOT NULL,
    work_date DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY unique_employee_availability (employee_id, shift_id, work_date),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE CASCADE,
    INDEX idx_employee_availability_month (employee_id, work_date)
);

CREATE TABLE IF NOT EXISTS availability_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    employee_id INT DEFAULT NULL,
    month INT NOT NULL,
    year INT NOT NULL,
    data JSON,
    status VARCHAR(32) DEFAULT 'PENDING',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    submitted_at DATETIME NULL,
    edit_requested_at DATETIME NULL,
    edit_approved_at DATETIME NULL,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    INDEX idx_availability_requests_user (user_id),
    INDEX idx_availability_requests_employee_month (employee_id, month, year)
);

-- SCHEDULES
CREATE TABLE IF NOT EXISTS schedules (
    schedule_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    shift_id INT NOT NULL,
    role_id INT DEFAULT NULL,
    work_date DATE NOT NULL,
    status ENUM('DRAFT','PUBLISHED') DEFAULT 'DRAFT',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE SET NULL,
    UNIQUE KEY unique_schedule (employee_id, work_date, shift_id, status),
    INDEX idx_status (status),
    INDEX idx_work_date (work_date)
);

-- ATTENDANCE
CREATE TABLE IF NOT EXISTS attendance (
    attendance_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    schedule_id INT NOT NULL,
    check_in DATETIME,
    check_out DATETIME,
    status VARCHAR(50),
    check_in_latitude DOUBLE NULL,
    check_in_longitude DOUBLE NULL,
    check_in_accuracy DOUBLE NULL,
    check_out_latitude DOUBLE NULL,
    check_out_longitude DOUBLE NULL,
    check_out_accuracy DOUBLE NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY unique_attendance_schedule (schedule_id),
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE CASCADE,
    INDEX idx_attendance_employee (employee_id),
    INDEX idx_attendance_check_in (check_in)
);

CREATE TABLE IF NOT EXISTS attendance_settings (
    setting_key VARCHAR(80) PRIMARY KEY,
    setting_value VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

INSERT INTO attendance_settings (setting_key, setting_value) VALUES
('require_gps', 'false'),
('workplace_latitude', ''),
('workplace_longitude', ''),
('allowed_radius_meters', '300')
ON DUPLICATE KEY UPDATE setting_value = setting_value;

-- PAYROLL
CREATE TABLE IF NOT EXISTS payroll (
    payroll_id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT,
    month INT,
    year INT,
    total_hours DECIMAL(10,2),
    total_salary DECIMAL(10,2),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE
);

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
);

-- REQUESTS
CREATE TABLE IF NOT EXISTS requests (
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
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (target_employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
    FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE SET NULL
);

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
);

-- NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    message TEXT,
    type VARCHAR(50),
    ref_id INT,
    is_read BOOLEAN DEFAULT FALSE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

-- SCHEDULE SETTINGS
CREATE TABLE IF NOT EXISTS schedule_settings (
    setting_id INT PRIMARY KEY AUTO_INCREMENT,
    balance_scheduling BOOLEAN DEFAULT FALSE COMMENT 'Enable balanced work distribution',
    prefer_consecutive_shifts BOOLEAN DEFAULT FALSE COMMENT 'Prefer consecutive shifts for employees',
    balance_by_workday BOOLEAN DEFAULT FALSE COMMENT 'Balance by number of working days in generated schedule',
    allow_role_fallback BOOLEAN DEFAULT FALSE COMMENT 'Allow filling missing role slots with other available employees',
    productivity_attention BOOLEAN DEFAULT FALSE COMMENT 'Avoid assigning 3 consecutive shifts to the same employee when alternatives exist',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
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

CREATE TABLE IF NOT EXISTS supplemental_shift_requests (
    request_id INT AUTO_INCREMENT PRIMARY KEY,
    shift_id INT NOT NULL,
    work_date DATE NOT NULL,
    role_id INT NULL,
    status VARCHAR(20) DEFAULT 'OPEN',
    created_by INT NULL,
    filled_by_employee_id INT NULL,
    schedule_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    filled_at DATETIME NULL,
    FOREIGN KEY (shift_id) REFERENCES shifts(shift_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(user_id) ON DELETE SET NULL,
    FOREIGN KEY (filled_by_employee_id) REFERENCES employees(employee_id) ON DELETE SET NULL,
    FOREIGN KEY (schedule_id) REFERENCES schedules(schedule_id) ON DELETE SET NULL,
    INDEX idx_supplemental_work_date (work_date),
    INDEX idx_supplemental_status (status)
);
