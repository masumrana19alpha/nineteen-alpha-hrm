import app from './app.js';
import { env } from './config/env.js';
import { query } from './db/pool.js';

async function start() {
  try {
    await query('SELECT 1');
    app.listen(env.port, env.host, () => {
      console.log(`19 Alpha BMS API running at http://${env.host}:${env.port}`);
    });
  } catch (err) {
    console.error('Failed to start 19 Alpha BMS API:', err);
    process.exit(1);
  }
}

start();
