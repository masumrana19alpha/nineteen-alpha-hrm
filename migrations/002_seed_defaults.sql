-- Nineteen Alpha Business Management System (BMS)
-- Default Seed Data: Roles, Admin Account, UACL, Salary Config, CoA & Holidays (Version 002)

-- 1. Default Roles
INSERT INTO roles (code, name, description) VALUES
  ('SUPER_ADMIN', 'System Administrator', 'Full administrative access across all 7 BMS modules, UACL, settings, and audit logs'),
  ('MANAGEMENT', 'Executive Management', 'Executive visibility, approval authority, financial statements, and operational reports'),
  ('HR_ADMIN', 'HR & Admin Officer', 'Employee profiles, document vault, attendance, holidays, biometric toggle, and payroll'),
  ('PROJECT_LEAD', 'Project & Defence Lead', 'General and Defence projects, milestones, team assignments, progress logs, and tasks'),
  ('FINANCE_OFFICER', 'Accounts & Finance Officer', 'Chart of accounts, vouchers, petty cash, general ledger, trial balance, and billing'),
  ('STORE_ASSET_OFFICER', 'Inventory & Asset Officer', 'Stock master, GRN/challan movements, requisitions, and fixed asset custody/maintenance'),
  ('STAFF', 'General Staff', 'Self-service attendance, assigned tasks, comments, and authorized module views')
ON CONFLICT (code) DO NOTHING;

-- 2. Default Salary Structure Configuration
INSERT INTO salary_configurations (
  name,
  house_rent_pct,
  medical_pct,
  default_mobile_allowance,
  default_conveyance,
  is_active
) VALUES (
  'Nineteen Alpha Standard Scale',
  50.00,
  15.00,
  1000.00,
  2500.00,
  TRUE
) ON CONFLICT (name) DO NOTHING;

-- 3. Default Holidays
INSERT INTO holidays (holiday_date, title, holiday_type) VALUES
  ('2026-12-16', 'Victory Day', 'Govt. Holiday'),
  ('2026-12-25', 'Christmas Day', 'Govt. Holiday')
ON CONFLICT (holiday_date) DO NOTHING;

-- 4. Chart of Accounts (CoA)
INSERT INTO chart_of_accounts (account_code, account_name, account_type) VALUES
  ('1010', 'Cash in Hand & Petty Cash', 'Asset'),
  ('1020', 'Bank Accounts', 'Asset'),
  ('1110', 'Accounts Receivable (Client Billing / Dues)', 'Asset'),
  ('1210', 'Inventory & Stock in Store', 'Asset'),
  ('1310', 'Fixed Assets & Equipment', 'Asset'),
  ('1410', 'Earnest Money & Security Deposits', 'Asset'),
  ('2010', 'Accounts Payable (Vendor Dues)', 'Liability'),
  ('2020', 'Salary & Allowances Payable', 'Liability'),
  ('2030', 'Tax, VAT & Statutory Dues', 'Liability'),
  ('3010', 'Share Capital & Retained Earnings', 'Equity'),
  ('4010', 'Defence Supply & Project Revenue', 'Income'),
  ('4020', 'Private Supply & Civil Construction Revenue', 'Income'),
  ('4030', 'Software & Consultancy Revenue', 'Income'),
  ('5010', 'Project & Supply Direct Cost', 'Expense'),
  ('5020', 'Salaries, Wages & Allowances', 'Expense'),
  ('5030', 'Office Rent, Utilities & Admin Expense', 'Expense'),
  ('5040', 'Research & Development (R&D) Expense', 'Expense'),
  ('5050', 'Asset Maintenance & Repairs', 'Expense')
ON CONFLICT (account_code) DO NOTHING;

-- 5. Default Module Settings (including Biometric Device ON/OFF toggle)
INSERT INTO module_settings (module_key, setting_key, setting_value) VALUES
  ('hr', 'biometric_device', '{"enabled": false, "device_mode": "API_WEBHOOK", "note": "Admin ON/OFF toggle ready for future Biometric/RFID attendance device integration"}'::jsonb),
  ('hr', 'salary_rules', '{"basic_pct": 100, "house_rent_pct": 50, "medical_pct": 15, "allow_custom_allowances": true}'::jsonb),
  ('projects', 'defence_compliance', '{"require_clearance_ref": true, "track_bg_pg": true, "track_ia_crv": true}'::jsonb),
  ('finance', 'voucher_approval', '{"require_approval_above": 0, "petty_cash_account": "1010"}'::jsonb),
  ('inventory', 'stock_alerts', '{"auto_low_stock_alert": true}'::jsonb),
  ('system', 'branding', '{"company_name": "Nineteen Alpha", "location": "Dhaka-1216, Bangladesh", "theme": "nineteen-alpha"}'::jsonb)
ON CONFLICT (module_key, setting_key) DO NOTHING;

-- 6. Initial Seed Employee & Super Admin User
-- Default password for initial setup: Admin@19Alpha (must be rotated after first login)
WITH inserted_emp AS (
  INSERT INTO employees (
    employee_code,
    full_name,
    designation,
    department,
    date_of_joining,
    nid,
    present_address,
    permanent_address,
    office_phone,
    emergency_phone,
    email,
    bank_name,
    bank_account,
    basic_salary,
    status
  ) VALUES (
    'EMP-001',
    'System Administrator',
    'System & ERP Administrator',
    'Software & Implementation',
    '2026-01-01',
    '0000000000',
    'Dhaka-1216, Bangladesh',
    'Bangladesh',
    '+8801700000000',
    '+8801800000000',
    'admin@nineteenalpha.local',
    'Standard Bank',
    'AC-19A-0001',
    20000.00,
    'Active'
  )
  ON CONFLICT (employee_code) DO NOTHING
  RETURNING id
),
admin_role AS (
  SELECT id FROM roles WHERE code = 'SUPER_ADMIN' LIMIT 1
)
INSERT INTO users (employee_id, username, email, password_hash, role_id, is_active)
SELECT
  (SELECT id FROM inserted_emp LIMIT 1),
  'admin',
  'admin@nineteenalpha.local',
  '$2a$12$KIXQ8f5w5Z3r9tV8sL2nCe6yM1pQ7rS4tU6vW8xY0zA2bC4dE6fGe',
  (SELECT id FROM admin_role),
  TRUE
WHERE (SELECT id FROM admin_role) IS NOT NULL
ON CONFLICT (username) DO NOTHING;

-- 7. Full UACL Matrix for Initial Admin User
INSERT INTO user_access_controls (
  user_id,
  module_key,
  can_view,
  can_create,
  can_edit,
  can_delete,
  can_approve,
  can_export
)
SELECT
  u.id,
  m.module_key,
  TRUE, TRUE, TRUE, TRUE, TRUE, TRUE
FROM users u
CROSS JOIN (
  VALUES
    ('hr'),
    ('projects'),
    ('tasks'),
    ('crm'),
    ('inventory'),
    ('finance'),
    ('rnd'),
    ('admin')
) AS m(module_key)
WHERE u.username = 'admin'
ON CONFLICT (user_id, module_key) DO NOTHING;
