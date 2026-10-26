// backend/scripts/storageReport.js
// Storage budget reporter for MongoDB Atlas M0 (512 MB limit)

const path = require('path');
const { connect, mongoose } = require('../db');

const M0_LIMIT_MB = 512;
const DEFAULT_WARN_THRESHOLD_MB = 400;

async function generateStorageReport({
  warnThresholdMB = DEFAULT_WARN_THRESHOLD_MB,
  failOnWarn = false,
  db,
  quiet = false,
} = {}) {
  const shouldDisconnect = mongoose.connection.readyState !== 1;
  if (shouldDisconnect) {
    await connect();
  }

  const database = db || mongoose.connection.db;
  if (!database) {
    throw new Error('Database connection is not established.');
  }

  let dbStats = {};
  try {
    dbStats = await database.stats();
  } catch (err) {
    dbStats = { dataSize: 0, storageSize: 0, indexSize: 0 };
  }

  const collectionsList = await database.listCollections().toArray();
  const collections = [];

  let aggregateDataBytes = 0;
  let aggregateStorageBytes = 0;
  let aggregateIndexBytes = 0;

  for (const collInfo of collectionsList) {
    const collName = collInfo.name;
    if (collName.startsWith('system.')) continue;

    const coll = database.collection(collName);
    let docCount = 0;
    let collDataSize = 0;
    let collStorageSize = 0;
    let collIndexSize = 0;

    try {
      const statsCmd = await database.command({ collStats: collName });
      docCount = statsCmd.count ?? 0;
      collDataSize = statsCmd.size ?? 0;
      collStorageSize = statsCmd.storageSize ?? 0;
      collIndexSize = statsCmd.totalIndexSize ?? 0;
    } catch {
      try {
        const collStatsAgg = await coll
          .aggregate([{ $collStats: { storageStats: {} } }])
          .toArray();
        if (collStatsAgg && collStatsAgg[0] && collStatsAgg[0].storageStats) {
          const s = collStatsAgg[0].storageStats;
          docCount = s.count ?? 0;
          collDataSize = s.size ?? 0;
          collStorageSize = s.storageSize ?? 0;
          collIndexSize = s.totalIndexSize ?? 0;
        } else {
          docCount = await coll.countDocuments().catch(() => 0);
        }
      } catch {
        docCount = await coll.countDocuments().catch(() => 0);
      }
    }

    aggregateDataBytes += collDataSize;
    aggregateStorageBytes += collStorageSize;
    aggregateIndexBytes += collIndexSize;

    collections.push({
      name: collName,
      documents: docCount,
      dataMB: Number((collDataSize / (1024 * 1024)).toFixed(4)),
      storageMB: Number((collStorageSize / (1024 * 1024)).toFixed(4)),
      indexMB: Number((collIndexSize / (1024 * 1024)).toFixed(4)),
      totalMB: Number(((collStorageSize + collIndexSize) / (1024 * 1024)).toFixed(4)),
    });
  }

  // Use higher of dbStats or aggregate
  const finalStorageBytes = Math.max(dbStats.storageSize || 0, aggregateStorageBytes);
  const finalDataBytes = Math.max(dbStats.dataSize || 0, aggregateDataBytes);
  const finalIndexBytes = Math.max(dbStats.indexSize || 0, aggregateIndexBytes);

  const totalUsedBytes = (finalStorageBytes > 0 ? finalStorageBytes : finalDataBytes) + finalIndexBytes;
  const totalMB = Number((totalUsedBytes / (1024 * 1024)).toFixed(4));
  const dataMB = Number((finalDataBytes / (1024 * 1024)).toFixed(4));
  const storageMB = Number((finalStorageBytes / (1024 * 1024)).toFixed(4));
  const indexMB = Number((finalIndexBytes / (1024 * 1024)).toFixed(4));

  const isWarning = totalMB >= warnThresholdMB;

  if (!quiet) {
    console.log(`\n============================================================`);
    console.log(` Oddspot Atlas M0 Storage Report (Limit: ${M0_LIMIT_MB} MB)`);
    console.log(` Database: ${database.databaseName}`);
    console.log(` Warning Threshold: ${warnThresholdMB} MB`);
    console.log(`============================================================`);

    if (collections.length > 0) {
      console.table(
        collections.map((c) => ({
          Collection: c.name,
          Documents: c.documents,
          'Data (MB)': c.dataMB,
          'Storage (MB)': c.storageMB,
          'Index (MB)': c.indexMB,
          'Total (MB)': c.totalMB,
        }))
      );
    } else {
      console.log('No user collections found.');
    }

    console.log(`------------------------------------------------------------`);
    console.log(`Summary:`);
    console.log(`  Data Size:    ${dataMB} MB`);
    console.log(`  Storage Size: ${storageMB} MB`);
    console.log(`  Index Size:   ${indexMB} MB`);
    console.log(`  Total Used:   ${totalMB} MB / ${M0_LIMIT_MB} MB (${((totalMB / M0_LIMIT_MB) * 100).toFixed(2)}%)`);
    console.log(`------------------------------------------------------------`);

    if (isWarning) {
      console.warn(
        `[WARNING] Total database size (${totalMB} MB) has reached or exceeded warning threshold (${warnThresholdMB} MB)!`
      );
    } else {
      console.log(`[OK] Storage usage is within safe operating parameters.`);
    }
    console.log(`============================================================\n`);
  }

  if (shouldDisconnect && require.main === module) {
    await mongoose.disconnect();
  }

  return {
    database: database.databaseName,
    m0LimitMB: M0_LIMIT_MB,
    warnThresholdMB,
    totalMB,
    dataMB,
    storageMB,
    indexMB,
    collections,
    warning: isWarning,
  };
}

async function main() {
  const args = process.argv.slice(2);
  const failOnWarn = args.includes('--fail-on-warn');
  let warnThreshold = DEFAULT_WARN_THRESHOLD_MB;

  const thresholdIdx = args.findIndex((a) => a === '--threshold' || a === '--warn-threshold');
  if (thresholdIdx !== -1 && args[thresholdIdx + 1]) {
    const parsed = parseFloat(args[thresholdIdx + 1]);
    if (!isNaN(parsed) && parsed > 0) {
      warnThreshold = parsed;
    }
  }

  const report = await generateStorageReport({
    warnThresholdMB: warnThreshold,
    failOnWarn,
  });

  if (failOnWarn && report.warning) {
    console.error(`Exiting with code 1 due to --fail-on-warn (used: ${report.totalMB} MB)`);
    process.exit(1);
  }

  process.exit(0);
}

if (require.main === module) {
  main().catch((err) => {
    console.error('Failed to generate storage report:', err);
    process.exit(1);
  });
}

module.exports = {
  generateStorageReport,
  M0_LIMIT_MB,
  DEFAULT_WARN_THRESHOLD_MB,
};
