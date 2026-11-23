const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'nineteen_alpha_super_secret_key_2026';

const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, `${Date.now()}-${safeName}`);
  }
});
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } });

const db = new Database(path.join(__dirname, 'hrm.db'));
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    emp_code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT DEFAULT 'employee',
    department TEXT NOT NULL,
    designation TEXT NOT NULL,
    phone TEXT,
    join_date TEXT NOT NULL,
    status TEXT DEFAULT 'Active'
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    check_in TEXT,
    check_out TEXT,
    status TEXT DEFAULT 'Present',
    note TEXT,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    UNIQUE(employee_id, date)
  );

  CREATE TABLE IF NOT EXISTS leaves (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    leave_type TEXT NOT NULL,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    reason TEXT NOT NULL,
    status TEXT DEFAULT 'Pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id)
  );

  CREATE TABLE IF NOT EXISTS documents (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    category TEXT NOT NULL,
    employee_id INTEGER,
    file_path TEXT NOT NULL,
    uploaded_by TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS office_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    assigned_to INTEGER,
    priority TEXT DEFAULT 'Medium',
    due_date TEXT,
    status TEXT DEFAULT 'Pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (assigned_to) REFERENCES employees(id)
  );
`);

const userCount = db.prepare('SELECT COUNT(*) as count FROM employees').get().count;
if (userCount === 0) {
  const adminHash = bcrypt.hashSync('admin123', 10);
  const empHash = bcrypt.hashSync('emp123', 10);

  const insertEmp = db.prepare(`
    INSERT INTO employees (emp_code, name, email, password, role, department, designation, phone, join_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insertEmp.run('NA-001', 'HR Admin (Nineteen Alpha)', 'admin@nineteenalpha.com', adminHash, 'admin', 'HR & Operations', 'HR Manager', '+8801700000001', '2025-01-01', 'Active');
  insertEmp.run('NA-002', 'Masum Rana', 'masum@nineteenalpha.com', empHash, 'employee', 'Software & ERP', 'Junior Software Implementer', '+8801700000002', '2026-01-15', 'Active');

  db.prepare(`
    INSERT INTO office_tasks (title, description, assigned_to, priority, due_date, status)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run('ERP Module UAT & Documentation', 'Complete functional testing checklist and submit sign-off report.', 2, 'High', '2026-11-30', 'In Progress');
}

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ error: 'Unauthorized' });

  const token = authHeader.split(' ')[1];
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

function getDhakaDateTime() {
  const now = new Date();
  const optionsDate = { timeZone: 'Asia/Dhaka', year: 'numeric', month: '2-digit', day: '2-digit' };
  const optionsTime = { timeZone: 'Asia/Dhaka', hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' };
  const parts = new Intl.DateTimeFormat('en-CA', optionsDate).format(now);
  const time = new Intl.DateTimeFormat('en-GB', optionsTime).format(now);
  return { date: parts, time };
}

app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  const user = db.prepare('SELECT * FROM employees WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const token = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, emp_code: user.emp_code },
    JWT_SECRET,
    { expiresIn: '12h' }
  );

  res.json({
    token,
    user: { id: user.id, emp_code: user.emp_code, name: user.name, email: user.email, role: user.role, department: user.department, designation: user.designation }
  });
});

app.get('/api/dashboard', authenticate, (req, res) => {
  const { date } = getDhakaDateTime();
  const totalEmployees = db.prepare("SELECT COUNT(*) as count FROM employees WHERE status = 'Active'").get().count;
  const presentToday = db.prepare("SELECT COUNT(*) as count FROM attendance WHERE date = ?").get(date).count;
  const pendingLeaves = db.prepare("SELECT COUNT(*) as count FROM leaves WHERE status = 'Pending'").get().count;
  const openTasks = db.prepare("SELECT COUNT(*) as count FROM office_tasks WHERE status != 'Completed'").get().count;
  const totalDocs = db.prepare("SELECT COUNT(*) as count FROM documents").get().count;

  const myAttendanceToday = db.prepare("SELECT * FROM attendance WHERE employee_id = ? AND date = ?").get(req.user.id, date);

  res.json({
    date,
    stats: { totalEmployees, presentToday, pendingLeaves, openTasks, totalDocs },
    myAttendanceToday
  });
});

app.get('/api/employees', authenticate, (req, res) => {
  const employees = db.prepare('SELECT id, emp_code, name, email, role, department, designation, phone, join_date, status FROM employees ORDER BY id ASC').all();
  res.json(employees);
});

app.post('/api/employees', authenticate, isAdmin, (req, res) => {
  const { emp_code, name, email, password, role, department, designation, phone, join_date } = req.body;
  try {
    const hash = bcrypt.hashSync(password || '123456', 10);
    const stmt = db.prepare(`
      INSERT INTO employees (emp_code, name, email, password, role, department, designation, phone, join_date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(emp_code, name, email, hash, role || 'employee', department, designation, phone, join_date);
    res.json({ id: info.lastInsertRowid, message: 'Employee added successfully' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

app.delete('/api/employees/:id', authenticate, isAdmin, (req, res) => {
  if (Number(req.params.id) === req.user.id) {
    return res.status(400).json({ error: 'Cannot delete your own account' });
  }
  db.prepare('DELETE FROM employees WHERE id = ?').run(req.params.id);
  res.json({ message: 'Employee deleted' });
});

app.get('/api/attendance', authenticate, (req, res) => {
  const query = req.user.role === 'admin'
    ? `SELECT a.*, e.name, e.emp_code, e.department FROM attendance a JOIN employees e ON a.employee_id = e.id ORDER BY a.date DESC, a.check_in DESC`
    : `SELECT a.*, e.name, e.emp_code, e.department FROM attendance a JOIN employees e ON a.employee_id = e.id WHERE a.employee_id = ? ORDER BY a.date DESC`;
  
  const logs = req.user.role === 'admin' ? db.prepare(query).all() : db.prepare(query).all(req.user.id);
  res.json(logs);
});

app.post('/api/attendance/check-in', authenticate, (req, res) => {
  const { date, time } = getDhakaDateTime();
  const existing = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(req.user.id, date);
  if (existing) return res.status(400).json({ error: 'Already checked in today' });

  const status = time > '09:30:00' ? 'Late' : 'Present';
  db.prepare('INSERT INTO attendance (employee_id, date, check_in, status, note) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, date, time, status, req.body.note || 'Office Check-In'
  );
  res.json({ message: `Checked in at ${time} (${status})`, date, time, status });
});

app.post('/api/attendance/check-out', authenticate, (req, res) => {
  const { date, time } = getDhakaDateTime();
  const existing = db.prepare('SELECT * FROM attendance WHERE employee_id = ? AND date = ?').get(req.user.id, date);
  if (!existing) return res.status(400).json({ error: 'You have not checked in today' });
  if (existing.check_out) return res.status(400).json({ error: 'Already checked out today' });

  db.prepare('UPDATE attendance SET check_out = ? WHERE id = ?').run(time, existing.id);
  res.json({ message: `Checked out at ${time}`, time });
});

app.get('/api/leaves', authenticate, (req, res) => {
  const query = req.user.role === 'admin'
    ? `SELECT l.*, e.name, e.emp_code, e.department FROM leaves l JOIN employees e ON l.employee_id = e.id ORDER BY l.id DESC`
    : `SELECT l.*, e.name, e.emp_code, e.department FROM leaves l JOIN employees e ON l.employee_id = e.id WHERE l.employee_id = ? ORDER BY l.id DESC`;
  
  const rows = req.user.role === 'admin' ? db.prepare(query).all() : db.prepare(query).all(req.user.id);
  res.json(rows);
});

app.post('/api/leaves', authenticate, (req, res) => {
  const { leave_type, start_date, end_date, reason } = req.body;
  db.prepare('INSERT INTO leaves (employee_id, leave_type, start_date, end_date, reason) VALUES (?, ?, ?, ?, ?)').run(
    req.user.id, leave_type, start_date, end_date, reason
  );
  res.json({ message: 'Leave request submitted' });
});

app.patch('/api/leaves/:id', authenticate, isAdmin, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE leaves SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: `Leave ${status}` });
});

app.get('/api/documents', authenticate, (req, res) => {
  const docs = db.prepare(`
    SELECT d.*, e.name as employee_name 
    FROM documents d 
    LEFT JOIN employees e ON d.employee_id = e.id 
    ORDER BY d.id DESC
  `).all();
  res.json(docs);
});

app.post('/api/documents', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'File is required' });
  const { title, category, employee_id } = req.body;
  const filePath = `/uploads/${req.file.filename}`;

  db.prepare('INSERT INTO documents (title, category, employee_id, file_path, uploaded_by) VALUES (?, ?, ?, ?, ?)').run(
    title, category, employee_id || null, filePath, req.user.name
  );
  res.json({ message: 'Document uploaded successfully', filePath });
});

app.get('/api/tasks', authenticate, (req, res) => {
  const tasks = db.prepare(`
    SELECT t.*, e.name as assignee_name, e.emp_code 
    FROM office_tasks t 
    LEFT JOIN employees e ON t.assigned_to = e.id 
    ORDER BY t.id DESC
  `).all();
  res.json(tasks);
});

app.post('/api/tasks', authenticate, (req, res) => {
  const { title, description, assigned_to, priority, due_date } = req.body;
  db.prepare('INSERT INTO office_tasks (title, description, assigned_to, priority, due_date) VALUES (?, ?, ?, ?, ?)').run(
    title, description, assigned_to || req.user.id, priority || 'Medium', due_date
  );
  res.json({ message: 'Office task created' });
});

app.patch('/api/tasks/:id', authenticate, (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE office_tasks SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ message: 'Task status updated' });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Nineteen Alpha HRM Server running on http://localhost:${PORT}`);
});
