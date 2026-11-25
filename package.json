const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'bms-data.json');

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function getDefaultState() {
  return {
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
    chartOfAccounts: [
      { code: '1000', name: 'Cash & Bank / Petty Cash', type: 'Asset' },
      { code: '1100', name: 'Accounts Receivable & Inventory', type: 'Asset' },
      { code: '2000', name: 'Accounts Payable & Accrued Dues', type: 'Liability' },
      { code: '3000', name: 'Capital & Retained Earnings', type: 'Equity' },
      { code: '4000', name: 'Project, Supply & Consultancy Revenue', type: 'Income' },
      { code: '5000', name: 'Operating, Project & R&D Expense', type: 'Expense' }
    ],
    vouchers: [
      {
        id: 'VCH-501',
        type: 'Debit Voucher',
        head: 'Operating, Project & R&D Expense',
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
}

function ensureStorage() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(getDefaultState(), null, 2), 'utf8');
  }
}

function loadState() {
  ensureStorage();
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    return { ...getDefaultState(), ...JSON.parse(raw) };
  } catch (err) {
    const fallback = getDefaultState();
    saveState(fallback);
    return fallback;
  }
}

function saveState(nextState) {
  ensureStorage();
  fs.writeFileSync(DATA_FILE, JSON.stringify(nextState, null, 2), 'utf8');
}

let bmsState = loadState();

function computeFinanceSummary() {
  let totalDebit = 0;
  let totalCredit = 0;
  const headTotals = {};

  for (const v of bmsState.vouchers || []) {
    const amt = Number(v.amount) || 0;
    if (v.type === 'Credit Voucher') {
      totalCredit += amt;
    } else {
      totalDebit += amt;
    }
    const key = v.head || 'General Account';
    if (!headTotals[key]) {
      headTotals[key] = { head: key, debit: 0, credit: 0, net: 0 };
    }
    if (v.type === 'Credit Voucher') {
      headTotals[key].credit += amt;
    } else {
      headTotals[key].debit += amt;
    }
    headTotals[key].net = headTotals[key].credit - headTotals[key].debit;
  }

  return {
    totalDebit,
    totalCredit,
    netCashFlow: totalCredit - totalDebit,
    trialBalance: Object.values(headTotals)
  };
}

app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: `${bmsState.company} ${bmsState.systemName}`,
    persistence: 'json-file',
    timestamp: new Date().toISOString()
  });
});

app.get('/api/state', (req, res) => {
  res.json({
    ...bmsState,
    financeSummary: computeFinanceSummary()
  });
});

app.post('/api/reset-test-drive', (req, res) => {
  bmsState = getDefaultState();
  saveState(bmsState);
  res.json({ ok: true, message: 'Test drive state reset to initial seed data.' });
});

app.post('/api/employees', (req, res) => {
  const emp = {
    id: req.body.id || `EMP-${String((bmsState.employees || []).length + 1).padStart(3, '0')}`,
    name: req.body.name || 'New Staff',
    designation: req.body.designation || 'Staff',
    department: req.body.department || 'Operations',
    nid: req.body.nid || 'N/A',
    phone: req.body.phone || '',
    emergencyPhone: req.body.emergencyPhone || '',
    presentAddress: req.body.presentAddress || '',
    permanentAddress: req.body.permanentAddress || '',
    bankAccount: req.body.bankAccount || 'N/A',
    basicSalary: Number(req.body.basicSalary) || 15000
  };
  bmsState.employees.push(emp);
  saveState(bmsState);
  res.status(201).json(emp);
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
  saveState(bmsState);
  res.status(201).json(entry);
});

app.post('/api/settings/biometric', (req, res) => {
  bmsState.biometricDeviceEnabled = Boolean(req.body.enabled);
  saveState(bmsState);
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
  saveState(bmsState);
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
  saveState(bmsState);
  res.status(201).json(item);
});

app.post('/api/crm', (req, res) => {
  const item = {
    id: `CRM-${Date.now().toString().slice(-4)}`,
    clientName: req.body.clientName || 'New Client',
    sector: req.body.sector || 'Defence Sector',
    tenderRef: req.body.tenderRef || 'RFQ-NEW',
    estimatedValue: Number(req.body.estimatedValue) || 0,
    stage: req.body.stage || 'Lead / Inquiry'
  };
  bmsState.crmDeals.unshift(item);
  saveState(bmsState);
  res.status(201).json(item);
});

app.post('/api/inventory', (req, res) => {
  const item = {
    sku: req.body.sku || `INV-${Date.now().toString().slice(-4)}`,
    name: req.body.name || 'Inventory Item',
    category: req.body.category || 'General Supply',
    location: req.body.location || 'Main Store',
    stockQty: Number(req.body.stockQty) || 0,
    reorderLevel: Number(req.body.reorderLevel) || 5
  };
  bmsState.inventoryItems.unshift(item);
  saveState(bmsState);
  res.status(201).json(item);
});

app.post('/api/assets', (req, res) => {
  const item = {
    assetId: req.body.assetId || `AST-${Date.now().toString().slice(-4)}`,
    name: req.body.name || 'Fixed Asset',
    serialNo: req.body.serialNo || 'N/A',
    assignedTo: req.body.assignedTo || 'Unassigned',
    condition: req.body.condition || 'Good'
  };
  bmsState.assets.unshift(item);
  saveState(bmsState);
  res.status(201).json(item);
});

app.post('/api/vouchers', (req, res) => {
  const item = {
    id: `VCH-${Date.now().toString().slice(-4)}`,
    type: req.body.type || 'Debit Voucher',
    head: req.body.head || 'Operating, Project & R&D Expense',
    amount: Number(req.body.amount) || 0,
    note: req.body.note || '',
    date: new Date().toISOString().slice(0, 10)
  };
  bmsState.vouchers.unshift(item);
  saveState(bmsState);
  res.status(201).json(item);
});

app.post('/api/rnd', (req, res) => {
  const item = {
    id: `RND-${Date.now().toString().slice(-4)}`,
    topic: req.body.topic || 'R&D Initiative',
    vertical: req.body.vertical || 'R&D',
    expense: Number(req.body.expense) || 0,
    status: req.body.status || 'In Research'
  };
  bmsState.rndItems.unshift(item);
  saveState(bmsState);
  res.status(201).json(item);
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Nineteen Alpha BMS Test Drive running on port ${PORT}`);
});
