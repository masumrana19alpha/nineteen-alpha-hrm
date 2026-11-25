-- Nineteen Alpha Business Management System (BMS)
-- PostgreSQL Initial Relational Schema (Version 001)

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 1. Schema Migration Tracking
CREATE TABLE IF NOT EXISTS schema_migrations (
  version VARCHAR(64) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Roles, UACL & Users
CREATE TABLE IF NOT EXISTS roles (
  id SERIAL PRIMARY KEY,
  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code VARCHAR(32) UNIQUE NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  designation VARCHAR(120) NOT NULL,
  department VARCHAR(120) NOT NULL,
  date_of_joining DATE NOT NULL,
  nid VARCHAR(64),
  present_address TEXT,
  permanent_address TEXT,
  office_phone VARCHAR(40),
  personal_phone VARCHAR(40),
  emergency_phone VARCHAR(40),
  email VARCHAR(150),
  bank_name VARCHAR(120),
  bank_account VARCHAR(100),
  bank_branch VARCHAR(120),
  basic_salary NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'Active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  username VARCHAR(80) UNIQUE NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role_id INTEGER NOT NULL REFERENCES roles(id),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Granular User Access Control List (UACL) per user/module/action
CREATE TABLE IF NOT EXISTS user_access_controls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  module_key VARCHAR(50) NOT NULL,
  can_view BOOLEAN NOT NULL DEFAULT TRUE,
  can_create BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit BOOLEAN NOT NULL DEFAULT FALSE,
  can_delete BOOLEAN NOT NULL DEFAULT FALSE,
  can_approve BOOLEAN NOT NULL DEFAULT FALSE,
  can_export BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, module_key)
);

-- Centralized Module & System Settings (including Biometric ON/OFF)
CREATE TABLE IF NOT EXISTS module_settings (
  id SERIAL PRIMARY KEY,
  module_key VARCHAR(50) NOT NULL,
  setting_key VARCHAR(100) NOT NULL,
  setting_value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (module_key, setting_key)
);

-- Document Vault (HR CVs/NIDs/Clearances, Project/Defence Docs, Task/CRM/R&D Files)
CREATE TABLE IF NOT EXISTS documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type VARCHAR(40) NOT NULL, -- EMPLOYEE, PROJECT, TASK, CRM, ASSET, RND
  owner_ref VARCHAR(120) NOT NULL,
  doc_category VARCHAR(80) NOT NULL, -- CV, NID, CLEARANCE, LOA, QUOTATION, REPORT, OTHER
  title VARCHAR(200) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120) NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Centralized Approval Workflows
CREATE TABLE IF NOT EXISTS approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_code VARCHAR(40) UNIQUE NOT NULL,
  module_key VARCHAR(50) NOT NULL,
  entity_type VARCHAR(60) NOT NULL, -- VOUCHER, PAYROLL, QUOTATION, STOCK_REQUISITION, RND_BUDGET, PROJECT_CLOSURE
  entity_ref VARCHAR(120) NOT NULL,
  title VARCHAR(220) NOT NULL,
  amount NUMERIC(14, 2) DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending', -- Pending, Approved, Rejected
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reviewed_at TIMESTAMPTZ
);

-- In-App Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  module_key VARCHAR(50) NOT NULL,
  title VARCHAR(180) NOT NULL,
  message TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Full Audit Trail
CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_username VARCHAR(80),
  module_key VARCHAR(50) NOT NULL,
  action VARCHAR(80) NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id VARCHAR(120),
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address VARCHAR(64),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. Module 1: HR & Payroll System
CREATE TABLE IF NOT EXISTS holidays (
  id SERIAL PRIMARY KEY,
  holiday_date DATE UNIQUE NOT NULL,
  title VARCHAR(150) NOT NULL,
  holiday_type VARCHAR(60) NOT NULL DEFAULT 'Company Holiday' -- Weekly, Govt. Holiday, Company Holiday
);

CREATE TABLE IF NOT EXISTS attendance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  action VARCHAR(20) NOT NULL, -- CHECK_IN, CHECK_OUT
  source VARCHAR(30) NOT NULL DEFAULT 'WEB_1CLICK', -- WEB_1CLICK, BIOMETRIC_DEVICE
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  log_time TIME NOT NULL DEFAULT CURRENT_TIME,
  remarks TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS salary_configurations (
  id SERIAL PRIMARY KEY,
  name VARCHAR(120) UNIQUE NOT NULL,
  house_rent_pct NUMERIC(6, 2) NOT NULL DEFAULT 50.00,
  medical_pct NUMERIC(6, 2) NOT NULL DEFAULT 15.00,
  default_mobile_allowance NUMERIC(14, 2) NOT NULL DEFAULT 1000.00,
  default_conveyance NUMERIC(14, 2) NOT NULL DEFAULT 2500.00,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS payroll_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payslip_no VARCHAR(40) UNIQUE NOT NULL,
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  pay_month VARCHAR(7) NOT NULL, -- YYYY-MM
  basic_amount NUMERIC(14, 2) NOT NULL,
  house_rent_amount NUMERIC(14, 2) NOT NULL,
  medical_amount NUMERIC(14, 2) NOT NULL,
  mobile_allowance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  conveyance_allowance NUMERIC(14, 2) NOT NULL DEFAULT 0,
  other_allowances NUMERIC(14, 2) NOT NULL DEFAULT 0,
  deductions NUMERIC(14, 2) NOT NULL DEFAULT 0,
  net_payable NUMERIC(14, 2) NOT NULL,
  present_days INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'Draft', -- Draft, Approved, Paid
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Module 4: BD / CRM (Created before Projects so Won Deals convert cleanly)
CREATE TABLE IF NOT EXISTS crm_clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  sector VARCHAR(60) NOT NULL, -- Defence Sector, Private Sector, Consultancy / Software
  contact_person VARCHAR(140),
  phone VARCHAR(60),
  email VARCHAR(150),
  address TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS crm_opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  opportunity_code VARCHAR(40) UNIQUE NOT NULL,
  client_id UUID NOT NULL REFERENCES crm_clients(id) ON DELETE RESTRICT,
  title VARCHAR(200) NOT NULL,
  vertical VARCHAR(100) NOT NULL,
  tender_rfq_ref VARCHAR(120),
  submission_deadline DATE,
  earnest_money NUMERIC(14, 2) NOT NULL DEFAULT 0,
  estimated_value NUMERIC(14, 2) NOT NULL DEFAULT 0,
  quotation_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  stage VARCHAR(50) NOT NULL DEFAULT 'Lead / Inquiry', -- Lead / Inquiry, Tender / RFQ, Quotation Submitted, Won, Lost
  approval_status VARCHAR(30) NOT NULL DEFAULT 'Pending', -- Pending, Approved, Rejected
  converted_project_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. Module 2: Project Management (General + Dedicated Defence Metadata)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_code VARCHAR(40) UNIQUE NOT NULL,
  name VARCHAR(200) NOT NULL,
  vertical VARCHAR(100) NOT NULL, -- Civil Construction, Software Development & Implementation, Defence Supply & Embedded, Private Sector Supply, Consultancy
  client_id UUID REFERENCES crm_clients(id) ON DELETE SET NULL,
  client_name VARCHAR(180) NOT NULL,
  start_date DATE,
  end_date DATE,
  budget NUMERIC(14, 2) NOT NULL DEFAULT 0,
  actual_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'Active', -- Planning, Active, On Hold, Completed, Archived
  is_defence BOOLEAN NOT NULL DEFAULT FALSE,
  defence_directorate VARCHAR(180),
  tender_loa_ref VARCHAR(140),
  security_clearance_status VARCHAR(120),
  bg_pg_details TEXT,
  inspection_acceptance_status VARCHAR(120),
  compliance_checklist TEXT,
  closure_remarks TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE crm_opportunities
  ADD CONSTRAINT fk_crm_converted_project
  FOREIGN KEY (converted_project_id) REFERENCES projects(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS project_milestones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title VARCHAR(180) NOT NULL,
  milestone_type VARCHAR(40) NOT NULL DEFAULT 'Phase', -- Phase, Billing
  due_date DATE,
  amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending', -- Pending, In Progress, Completed
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  resource_name VARCHAR(150) NOT NULL,
  role_in_project VARCHAR(120) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS project_progress_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  progress_pct INTEGER NOT NULL DEFAULT 0,
  summary TEXT NOT NULL,
  logged_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 6. Module 3: Task Management
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_code VARCHAR(40) UNIQUE NOT NULL,
  title VARCHAR(220) NOT NULL,
  description TEXT,
  priority VARCHAR(20) NOT NULL DEFAULT 'Medium', -- Low, Medium, High, Critical
  deadline DATE,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending', -- Pending, In Progress, In Review, Completed
  assignee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  linked_module VARCHAR(60),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id UUID REFERENCES users(id) ON DELETE SET NULL,
  comment TEXT NOT NULL,
  status_transition VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 7. Module 6: Account & Finance (CoA, Vouchers, Petty Cash, General Ledger, Billing)
CREATE TABLE IF NOT EXISTS chart_of_accounts (
  id SERIAL PRIMARY KEY,
  account_code VARCHAR(30) UNIQUE NOT NULL,
  account_name VARCHAR(160) NOT NULL,
  account_type VARCHAR(30) NOT NULL, -- Asset, Liability, Equity, Income, Expense
  is_active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS vouchers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_no VARCHAR(40) UNIQUE NOT NULL,
  voucher_type VARCHAR(20) NOT NULL, -- DEBIT, CREDIT
  account_code VARCHAR(30) NOT NULL REFERENCES chart_of_accounts(account_code),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  vertical VARCHAR(100),
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  voucher_date DATE NOT NULL DEFAULT CURRENT_DATE,
  narration TEXT,
  is_petty_cash BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(30) NOT NULL DEFAULT 'Pending', -- Pending, Approved, Rejected
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  entry_date DATE NOT NULL DEFAULT CURRENT_DATE,
  account_code VARCHAR(30) NOT NULL REFERENCES chart_of_accounts(account_code),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  debit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices_payables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_no VARCHAR(40) UNIQUE NOT NULL,
  record_type VARCHAR(20) NOT NULL, -- RECEIVABLE, PAYABLE
  party_name VARCHAR(180) NOT NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  due_date DATE,
  total_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  paid_amount NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(30) NOT NULL DEFAULT 'Open', -- Open, Partial, Settled
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 8. Module 5: Inventory & Fixed Asset Management
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sku VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  category VARCHAR(80) NOT NULL, -- Civil Construction, Defence Supply, Private Supply, IT & Office
  unit VARCHAR(30) NOT NULL DEFAULT 'Unit',
  location VARCHAR(120) NOT NULL DEFAULT 'Central Store',
  stock_qty NUMERIC(14, 2) NOT NULL DEFAULT 0,
  reorder_level NUMERIC(14, 2) NOT NULL DEFAULT 5,
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  movement_no VARCHAR(40) UNIQUE NOT NULL,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  movement_type VARCHAR(30) NOT NULL, -- STOCK_IN_GRN, STOCK_OUT_CHALLAN, TRANSFER, REQUISITION
  quantity NUMERIC(14, 2) NOT NULL CHECK (quantity > 0),
  unit_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  from_location VARCHAR(120),
  to_location VARCHAR(120),
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  reference_no VARCHAR(120),
  status VARCHAR(30) NOT NULL DEFAULT 'Completed', -- Pending, Approved, Completed, Rejected
  remarks TEXT,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS fixed_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_tag VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(180) NOT NULL,
  serial_number VARCHAR(120),
  category VARCHAR(80) NOT NULL DEFAULT 'Equipment & IT',
  purchase_date DATE,
  purchase_cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  site_location VARCHAR(120) DEFAULT 'HQ',
  condition_status VARCHAR(40) NOT NULL DEFAULT 'Good', -- Good, Needs Maintenance, Under Repair, Retired
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS asset_maintenance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  log_date DATE NOT NULL DEFAULT CURRENT_DATE,
  cost NUMERIC(14, 2) NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  performed_by VARCHAR(140),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Module 7: Research & Development (R&D)
CREATE TABLE IF NOT EXISTS rnd_initiatives (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rnd_code VARCHAR(40) UNIQUE NOT NULL,
  title VARCHAR(200) NOT NULL,
  vertical VARCHAR(100) NOT NULL, -- AI Healthcare, Defence Tech, Software, Civil Methods
  prototype_notes TEXT,
  feasibility_notes TEXT,
  budget_allocated NUMERIC(14, 2) NOT NULL DEFAULT 0,
  expense_incurred NUMERIC(14, 2) NOT NULL DEFAULT 0,
  status VARCHAR(40) NOT NULL DEFAULT 'In Research', -- In Research, Prototype Testing, Validated, Commercialized
  linked_project_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  commercial_product_name VARCHAR(180),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rnd_expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rnd_id UUID NOT NULL REFERENCES rnd_initiatives(id) ON DELETE CASCADE,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  description TEXT NOT NULL,
  voucher_id UUID REFERENCES vouchers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Helpful Indexes
CREATE INDEX IF NOT EXISTS idx_attendance_emp_date ON attendance_logs(employee_id, log_date);
CREATE INDEX IF NOT EXISTS idx_tasks_status_assignee ON tasks(status, assignee_id);
CREATE INDEX IF NOT EXISTS idx_vouchers_date_status ON vouchers(voucher_date, status);
CREATE INDEX IF NOT EXISTS idx_ledger_account_date ON ledger_entries(account_code, entry_date);
CREATE INDEX IF NOT EXISTS idx_audit_module_created ON audit_logs(module_key, created_at DESC);
