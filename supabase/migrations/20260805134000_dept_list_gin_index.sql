-- Migration to add GIN index on tickets(dept_list) for fast multi-department filtering
CREATE INDEX IF NOT EXISTS idx_tickets_dept_list_gin ON tickets USING GIN (dept_list);
