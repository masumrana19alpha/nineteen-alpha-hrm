const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Initial Test Drive State (7 Core BMS Modules)
const bmsState = {
  company: 'Nineteen Alpha',
  systemName: 'Business Management System (BMS)',
  biometricDeviceEnabled: false,
  employees: [
    {
      id: 'EMP-001',
      name: 'Masum Rana',
      designation: 'Junior Software Implementer',
      department: 'Software & Implementation',
      nid: '1999000000001',
      phone: '+8801700000001',
      emergencyPhone: '+8801800000001',
      presentAddress: 'Mirpur, Dhaka-1216',
      permanentAddress: 'Bangladesh',
      bankAccount: 'AC-19A-0001',
      basicSalary: 20000
    }
  ],
  attendanceLogs: [],
  holidays: [
    { date: '2026-12-16', title: 'Victory Day', type: 'Govt. Holiday' },
    { date: '2026-12-25', title: 'Christmas Day', type: 'Govt. Holiday' }
  ],
  projects: [
    {
      code: 'PRJ-DEF-001',
      name: 'Defence Signal & Embedded Telemetry Unit',
      vertical: 'Defence Supply & Embedded',
      client: 'Defence Directorate (Test)',
      budget: 2500000,
      status: 'In Progress',
      isDefence: true,
      defenceMeta: {
        directorateOrUnit: 'Signals / Ordnance Directorate',
        tenderOrLoaRef: 'LOA-19A-2026-01',
        clearanceStatus: 'Pending / Under Review',
        bgOrPgDetails: 'BG-8821 (Valid)',
        inspectionStatus: 'Pre-Delivery Check'
      }
    }
  ],
  tasks: [
    {
      id: 'TSK-101',
      title: 'Verify BMS Test Drive & 7-Module Navigation',
      priority: 'High',
      deadline: '2026-11-28',
      status: 'In Progress',
      assignee: 'Masum Rana',
      linkedModule: 'HR & Payroll System'
    }
  ],
  crmDeals: [
    {
      id: 'CRM-201',
      clientName: 'Defence Procurement Wing (Sample)',
      sector: 'Defence Sector',
      tenderRef: 'RFQ-2026-09',
      estimatedValue: 1800000,
      stage: 'Quotation Submitted'
    }
  ],
  inventoryItems: [
    {
      sku: 'INV-301',
      name: 'Embedded Sensor & Controller Kit',
      category: 'Defence / Hardware Supply',
      location: 'Main Store',
      stockQty: 15,
      reorderLevel: 5
    }
  ],
  assets: [
    {
      assetId: 'AST-401',
      name: 'Development & Testing Workstation',
      serialNo: 'SN-19A-401',
      assignedTo: 'Masum Rana',
      condition: 'Good'
    }
  ],
  vouchers: [
    {
      id: 'VCH-501',
      type: 'Debit Voucher',
      head: 'Office & Software Ops',
      amount: 12500,
      note: 'Test drive operational entry',
      date: new Date().toISOString().slice(0, 10)
    }
  ],
  rndItems: [
    {
      id: 'RND-601',
      topic: 'AI Healthcare & Embedded Diagnostics Prototype',
      vertical: 'AI Healthcare / R&D',
      expense: 45000,
      status: 'Prototype Testing'
    }
  ]
};

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: `${bmsState.company} ${bmsState.systemName}`,
    timestamp: new Date().toISOString()
  });
});

app.get('/api/state', (req, res) => {
  res.json(bmsState);
});

app.post('/api/attendance', (req, res) => {
  const { employeeId, employeeName, action } = req.body;
  const now = new Date();
  const entry = {
    id: `ATT-${Date.now()}`,
    employeeId: employeeId || 'EMP-001',
    employeeName: employeeName || 'Masum Rana',
    action: action === 'CHECK_OUT' ? 'CHECK_OUT' : 'CHECK_IN',
    date: now.toISOString().slice(0, 10),
    time: now.toTimeString().slice(0, 8)
  };
  bmsState.attendanceLogs.unshift(entry);
  res.status(201).json(entry);
});

app.post('/api/settings/biometric', (req, res) => {
  bmsState.biometricDeviceEnabled = Boolean(req.body.enabled);
  res.json({ biometricDeviceEnabled: bmsState.biometricDeviceEnabled });
});

app.post('/api/projects', (req, res) => {
  const item = {
    code: req.body.code || `PRJ-${Date.now().toString().slice(-4)}`,
    name: req.body.name || 'Untitled Project',
    vertical: req.body.vertical || 'Software Development',
    client: req.body.client || 'Internal / Client',
    budget: Number(req.body.budget) || 0,
    status: req.body.status || 'Active',
    isDefence: Boolean(req.body.isDefence),
    defenceMeta: req.body.defenceMeta || null
  };
  bmsState.projects.unshift(item);
  res.status(201).json(item);
});

app.post('/api/tasks', (req, res) => {
  const item = {
    id: `TSK-${Date.now().toString().slice(-4)}`,
    title: req.body.title || 'New Task',
    priority: req.body.priority || 'Medium',
    deadline: req.body.deadline || new Date().toISOString().slice(0, 10),
    status: req.body.status || 'Pending',
    assignee: req.body.assignee || 'Masum Rana',
    linkedModule: req.body.linkedModule || 'General'
  };
  bmsState.tasks.unshift(item);
  res.status(201).json(item);
});

app.post('/api/vouchers', (req, res) => {
  const item = {
    id: `VCH-${Date.now().toString().slice(-4)}`,
    type: req.body.type || 'Debit Voucher',
    head: req.body.head || 'General Expense',
    amount: Number(req.body.amount) || 0,
    note: req.body.note || '',
    date: new Date().toISOString().slice(0, 10)
  };
  bmsState.vouchers.unshift(item);
  res.status(201).json(item);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Nineteen Alpha BMS Test Drive running on port ${PORT}`);
});
