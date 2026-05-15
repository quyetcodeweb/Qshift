-- Add draft schedule management
-- Migration: Create draft_schedules tables

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
