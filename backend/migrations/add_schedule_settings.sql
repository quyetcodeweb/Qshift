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
-- MySQL versions before 8.0.29 do not support ALTER TABLE ADD COLUMN IF NOT EXISTS.
-- If this migration is applied to an existing DB, add missing columns manually:
-- ALTER TABLE schedule_settings ADD COLUMN balance_by_workday BOOLEAN DEFAULT FALSE;
-- ALTER TABLE schedule_settings ADD COLUMN allow_role_fallback BOOLEAN DEFAULT FALSE;
-- ALTER TABLE employees ADD COLUMN balance_value INT DEFAULT 0;
