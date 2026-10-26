// backend/scripts/jsonBackupRestore.js
// Built-in Node JSON/EJSON backup and restore engine preserving ObjectIds, Dates, and GeoJSON coordinates.

const fs = require('fs');
const path = require('path');
const { BSON } = require('mongodb');
const { EJSON } = BSON;
const { connect, mongoose } = require('../db');

async function dumpDatabase({ uri, db, outDir, quiet = false } = {}) {
  const shouldDisconnect = !db && mongoose.connection.readyState !== 1;
  if (!db) {
    await connect(uri);
  }
  const database = db || mongoose.connection.db;

  if (!outDir) {
    throw new Error('outDir is required for dumpDatabase');
  }

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const collections = await database.listCollections().toArray();
  const summary = {};

  for (const collInfo of collections) {
    const collName = collInfo.name;
    if (collName.startsWith('system.')) continue;

    const coll = database.collection(collName);
    const docs = await coll.find({}).toArray();
    const filePath = path.join(outDir, `${collName}.json`);

    fs.writeFileSync(filePath, EJSON.stringify(docs, null, 2), 'utf8');
    summary[collName] = docs.length;

    if (!quiet) {
      console.log(`[backup] Exported ${collName}: ${docs.length} documents`);
    }
  }

  const metaPath = path.join(outDir, 'metadata.json');
  fs.writeFileSync(
    metaPath,
    JSON.stringify(
      {
        database: database.databaseName,
        dumpedAt: new Date().toISOString(),
        collections: summary,
      },
      null,
      2
    ),
    'utf8'
  );

  if (shouldDisconnect && require.main === module) {
    await mongoose.disconnect();
  }

  return { outDir, summary };
}

async function restoreDatabase({ uri, db, inDir, quiet = false } = {}) {
  const shouldDisconnect = !db && mongoose.connection.readyState !== 1;
  if (!db) {
    await connect(uri);
  }
  const database = db || mongoose.connection.db;

  if (!inDir || !fs.existsSync(inDir)) {
    throw new Error(`inDir does not exist or was not specified: ${inDir}`);
  }

  const files = fs.readdirSync(inDir).filter((f) => f.endsWith('.json') && f !== 'metadata.json');
  const summary = {};

  for (const file of files) {
    const collName = path.basename(file, '.json');
    const filePath = path.join(inDir, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const docs = EJSON.parse(content);

    if (Array.isArray(docs) && docs.length > 0) {
      const coll = database.collection(collName);
      const ops = docs.map((doc) => ({
        replaceOne: {
          filter: { _id: doc._id },
          replacement: doc,
          upsert: true,
        },
      }));
      await coll.bulkWrite(ops, { ordered: false });
      summary[collName] = docs.length;
      if (!quiet) {
        console.log(`[restore] Restored/Upserted ${collName}: ${docs.length} documents`);
      }
    } else {
      summary[collName] = 0;
      if (!quiet) {
        console.log(`[restore] Restored ${collName}: 0 documents`);
      }
    }
  }

  if (shouldDisconnect && require.main === module) {
    await mongoose.disconnect();
  }

  return { inDir, summary };
}

async function main() {
  const args = process.argv.slice(2);
  const dumpIdx = args.indexOf('--dump');
  const restoreIdx = args.indexOf('--restore');

  if (dumpIdx !== -1 && args[dumpIdx + 1]) {
    const outDir = path.resolve(args[dumpIdx + 1]);
    console.log(`=== Starting Oddspot JSON Backup to: ${outDir} ===`);
    await dumpDatabase({ outDir });
    console.log('=== Backup Complete ===');
    process.exit(0);
  }

  if (restoreIdx !== -1 && args[restoreIdx + 1]) {
    const inDir = path.resolve(args[restoreIdx + 1]);
    console.log(`=== Starting Oddspot JSON Restore from: ${inDir} ===`);
    await restoreDatabase({ inDir });
    console.log('=== Restore Complete ===');
    process.exit(0);
  }

  console.log('Usage:');
  console.log('  node backend/scripts/jsonBackupRestore.js --dump <outDir>');
  console.log('  node backend/scripts/jsonBackupRestore.js --restore <inDir>');
  process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[jsonBackupRestore] Error:', err);
    process.exit(1);
  });
}

module.exports = {
  dumpDatabase,
  restoreDatabase,
};
