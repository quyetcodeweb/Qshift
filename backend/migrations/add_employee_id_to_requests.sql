-- Add employee_id column to availability_requests table
ALTER TABLE availability_requests ADD COLUMN employee_id INT DEFAULT NULL AFTER user_id;

-- Add foreign key constraint
ALTER TABLE availability_requests ADD CONSTRAINT fk_requests_employee 
FOREIGN KEY (employee_id) REFERENCES employees(employee_id) ON DELETE CASCADE;
