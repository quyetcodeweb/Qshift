-- Add roles support for scheduling
-- Migration: Add employee roles tables

-- Create roles table
CREATE TABLE IF NOT EXISTS roles (
    role_id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(100) UNIQUE NOT NULL,
    description TEXT,
    color VARCHAR(20),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create employee role assignments table
CREATE TABLE IF NOT EXISTS employee_role_assignments (
    id INT AUTO_INCREMENT PRIMARY KEY,
    employee_id INT NOT NULL,
    role_id INT NOT NULL,
    assigned_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE,
    FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE CASCADE,
    UNIQUE KEY unique_employee_role (employee_id, role_id)
);

-- Add role requirement support to shift_requirements
-- This allows specifying "need 2 cashiers + 3 waiters for this shift"
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

-- Add role field to schedules table
ALTER TABLE schedules 
ADD COLUMN role_id INT NULL AFTER shift_id,
ADD FOREIGN KEY (role_id) REFERENCES roles(role_id) ON DELETE SET NULL;

-- Insert default roles
INSERT INTO roles (role_name, description, color) VALUES
('Thu ngân', 'Nhân viên thu ngân', '#3B82F6'),
('Chạy bàn', 'Nhân viên chạy bàn', '#10B981'),
('Nấu ăn', 'Nhân viên nấu ăn', '#F59E0B'),
('Quản lý', 'Quản lý ca làm', '#EF4444')
ON DUPLICATE KEY UPDATE role_id=role_id;
