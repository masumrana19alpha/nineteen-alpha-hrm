import { env } from './src/config/env.js';
import { query } from './src/db/pool.js';
import app from './src/app.js';
import bcrypt from 'bcryptjs';

const PORT = env.port || process.env.PORT || 3000;
const HOST = env.host || '0.0.0.0';

// ============================================================================
// 1. ADMIN BOOTSTRAP (এটি নিশ্চিত করবে যে ডাটাবেসে সঠিক পাসওয়ার্ড হ্যাশ তৈরি হয়)
// ============================================================================
async function ensureAdminUser() {
  try {
    const existing = await query(`SELECT id FROM users WHERE LOWER(username) = 'admin' LIMIT 1`);
    if (existing.rows[0]) {
      console.log('✔ Admin user already exists');
      return;
    }

    // আপনার পছন্দমতো পাসওয়ার্ড দিন, অথবা Render-এ ADMIN_INITIAL_PASSWORD সেট করুন
    const initialPassword = process.env.ADMIN_INITIAL_PASSWORD || 'Admin@19Alpha';
    const rounds = env.auth?.bcryptRounds || 12;
    const hash = await bcrypt.hash(initialPassword, rounds);

    const roleRes = await query(`SELECT id FROM roles WHERE code = 'SUPER_ADMIN' LIMIT 1`);
    if (!roleRes.rows[0]) {
      console.error('❌ SUPER_ADMIN role missing. Please run migrations first.');
      return;
    }

    const empRes = await query(`SELECT id FROM employees WHERE employee_code = 'EMP-001' LIMIT 1`);
    const employeeId = empRes.rows[0]?.id || null;

    const userRes = await query(
      `INSERT INTO users (employee_id, username, email, password_hash, role_id, is_active)
       VALUES ($1, 'admin', 'admin@nineteenalpha.com', $2, $3, TRUE)
       RETURNING id`,
      [employeeId, hash, roleRes.rows[0].id]
    );
    const userId = userRes.rows[0].id;

    const modules = ['hr', 'projects', 'tasks', 'crm', 'inventory', 'finance', 'rnd', 'admin'];
    for (const moduleKey of modules) {
      await query(
        `INSERT INTO user_access_controls
           (user_id, module_key, can_view, can_create, can_edit, can_delete, can_approve, can_export)
         VALUES ($1, $2, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE)
         ON CONFLICT (user_id, module_key) DO NOTHING`,
        [userId, moduleKey]
      );
    }

    console.log('✔ Admin user bootstrapped');
    console.log(`   Username: admin`);
    console.log(`   Password: ${initialPassword}`);
  } catch (error) {
    console.error('❌ Admin bootstrap failed:', error.message);
  }
}

// ============================================================================
// 2. START SERVER
// ============================================================================
async function start() {
  try {
    console.log('▶ Starting Nineteen Alpha BMS...');
    
    // ডাটাবেস কানেকশন চেক
    await query('SELECT 1');
    console.log('✔ Database connected successfully');

    // অ্যাডমিন ইউজার তৈরি করা
    await ensureAdminUser();

    // সার্ভার স্টার্ট
    app.listen(PORT, HOST, () => {
      console.log(`✔ BMS API running on http://${HOST}:${PORT}`);
      console.log(`  → Login Endpoint: POST /api/auth/login`);
    });
  } catch (error) {
    console.error('❌ Failed to start application:', error);
    process.exit(1);
  }
}

start();
