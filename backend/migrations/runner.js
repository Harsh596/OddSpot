// backend/migrations/runner.js
// Versioned, idempotent migration runner for Oddspot

const fs = require('fs');
const path = require('path');
const { connect, mongoose } = require('../db');
const SchemaVersion = require('../models/SchemaVersion');

function loadMigrations() {
  const dir = __dirname;
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.js') && f !== 'runner.js' && !f.includes('.test.'))
    .sort();

  return files
    .map((file) => {
      const mod = require(path.join(dir, file));
      const match = file.match(/^(\d+)/);
      const version = typeof mod.version === 'number' ? mod.version : match ? parseInt(match[1], 10) : 0;
      return {
        file,
        version,
        name: mod.name || file.replace(/\.js$/, ''),
        up: mod.up,
      };
    })
    .sort((a, b) => a.version - b.version);
}

async function getMigrationStatus({ db } = {}) {
  const shouldDisconnect = mongoose.connection.readyState !== 1;
  if (shouldDisconnect) {
    await connect();
  }

  const migrations = loadMigrations();
  const appliedRecords = await SchemaVersion.find().sort({ version: 1 }).lean();
  const appliedMap = new Map(appliedRecords.map((r) => [r.version, r]));

  const status = migrations.map((m) => {
    const applied = appliedMap.get(m.version);
    return {
      version: m.version,
      name: m.name,
      file: m.file,
      applied: Boolean(applied),
      appliedAt: applied ? applied.appliedAt : null,
    };
  });

  if (shouldDisconnect && require.main === module) {
    await mongoose.disconnect();
  }

  return status;
}

async function runMigrations({ dryRun = false, db } = {}) {
  const shouldDisconnect = mongoose.connection.readyState !== 1;
  if (shouldDisconnect) {
    await connect();
  }

  const database = db || mongoose.connection.db;
  const migrations = loadMigrations();
  const appliedRecords = await SchemaVersion.find().sort({ version: 1 }).lean();
  const appliedSet = new Set(appliedRecords.map((r) => r.version));

  const pending = migrations.filter((m) => !appliedSet.has(m.version));

  if (dryRun) {
    console.log(`[migrations] Dry run: ${pending.length} pending migration(s):`);
    for (const m of pending) {
      console.log(`  - Version ${m.version}: ${m.name} (${m.file})`);
    }
    if (shouldDisconnect && require.main === module) {
      await mongoose.disconnect();
    }
    return {
      dryRun: true,
      pendingCount: pending.length,
      appliedCount: 0,
      pending: pending.map((m) => ({ version: m.version, name: m.name })),
      total: migrations.length,
    };
  }

  const applied = [];
  for (const m of pending) {
    console.log(`[migrations] Applying version ${m.version}: ${m.name}...`);
    if (typeof m.up === 'function') {
      await m.up(database);
    }
    await SchemaVersion.create({
      version: m.version,
      name: m.name,
      appliedAt: new Date(),
    });
    console.log(`[migrations] Applied version ${m.version}: ${m.name}`);
    applied.push({ version: m.version, name: m.name });
  }

  if (shouldDisconnect && require.main === module) {
    await mongoose.disconnect();
  }

  return {
    dryRun: false,
    appliedCount: applied.length,
    applied,
    total: migrations.length,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isStatus = args.includes('--status');
  const isDryRun = args.includes('--dry-run');

  if (isStatus) {
    console.log('=== Migration Status ===');
    const statuses = await getMigrationStatus();
    for (const s of statuses) {
      const check = s.applied ? '[x]' : '[ ]';
      const time = s.appliedAt ? ` (applied: ${new Date(s.appliedAt).toISOString()})` : ' (pending)';
      console.log(`${check} ${String(s.version).padStart(3, '0')} - ${s.name}${time}`);
    }
    process.exit(0);
  }

  console.log(`=== Oddspot Migration Runner (${isDryRun ? 'DRY RUN' : 'EXECUTE'}) ===`);
  const result = await runMigrations({ dryRun: isDryRun });
  console.log(`[migrations] Done. Applied: ${result.appliedCount}, Total: ${result.total}`);
  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[migrations] Fatal error:', err);
    process.exit(1);
  });
}

module.exports = {
  loadMigrations,
  getMigrationStatus,
  runMigrations,
};
