# Oddspot Database Backup & Restore Runbook

This runbook outlines the operational procedures for backing up, restoring, and verifying the integrity of Oddspot's MongoDB database, specifically designed for MongoDB Atlas M0 (512 MB storage budget) and staging/test environments.

---

## 1. Safety Rules & Pre-Flight Checks

> [!IMPORTANT]
> **Never restore directly to the production database (`oddspot`) without a dry-run drill.**
> Always restore into an isolated staging or test database (e.g. `oddspot_test`) first, verify document counts, run counter reconciliation, and check storage budgets before touching production.

- **Production Database Name**: `oddspot`
- **Staging / Test Database Name**: `oddspot_test`
- **M0 Tier Storage Limit**: `512 MB` (Soft alert threshold: `400 MB`)
- **Required Environment Variables**:
  - `MONGODB_URI`: Connection string to the target MongoDB cluster.

---

## 2. Creating a Database Backup

Backups are executed via `backend/scripts/backup.sh`. The script automatically uses `mongodump` with gzip compression if installed, or falls back to the built-in Node EJSON engine (`backend/scripts/jsonBackupRestore.js --dump`).

```bash
# 1. Provide MONGODB_URI in environment
export MONGODB_URI="mongodb+srv://..."

# 2. Run the backup script
bash backend/scripts/backup.sh
```

Backups are stored in `backups/dump-YYYYMMDDTHHMMSSZ/`. This directory is git-ignored and contains EJSON dumps for all active collections along with a `metadata.json` manifest.

---

## 3. Step-by-Step Restore Procedure (Staging Drill First)

### Step 1: Prepare the Staging / Test Environment
Ensure the staging database URI points to `oddspot_test`:
```bash
export STAGING_URI="mongodb+srv://.../oddspot_test"
```

### Step 2: Restore from Backup Directory
Use `jsonBackupRestore.js` (or `mongorestore` if gzip archive was used):

```bash
# Using Node EJSON engine
MONGODB_URI="$STAGING_URI" node backend/scripts/jsonBackupRestore.js --restore "backups/dump-YYYYMMDDTHHMMSSZ"

# OR using native mongorestore (if mongodump was used)
mongorestore --uri="$STAGING_URI" --gzip --dir="backups/dump-YYYYMMDDTHHMMSSZ"
```

### Step 3: Run Database Migrations & Index Sync
Ensure all indexes and native collection validators are synchronized on the restored database:
```bash
MONGODB_URI="$STAGING_URI" node backend/migrations/runner.js --status
MONGODB_URI="$STAGING_URI" node backend/migrations/runner.js
MONGODB_URI="$STAGING_URI" node backend/scripts/syncIndexes.js
```

### Step 4: Run Counter Reconciliation & State Verification
Run the counter reconciliation script to verify zero drift across votes, comments, visits, and meters:
```bash
# Dry run first to detect discrepancies
MONGODB_URI="$STAGING_URI" node backend/scripts/reconcileCounters.js

# If clean or after fixing drift with --apply:
MONGODB_URI="$STAGING_URI" node backend/scripts/reconcileCounters.js --apply
```

### Step 5: Check Storage Budget & Indexes
Verify that storage usage is well within the 512 MB limit:
```bash
MONGODB_URI="$STAGING_URI" node backend/scripts/storageReport.js --warn-threshold 400
```

### Step 6: Production Restore Execution (Only After Staging Verification)
Once the restore drill is verified on `oddspot_test`:
1. Put the application into maintenance mode or pause inbound writes.
2. Create a pre-restore backup of the current production database:
   ```bash
   MONGODB_URI="$PRODUCTION_URI" bash backend/scripts/backup.sh
   ```
3. Execute the restore to the production database:
   ```bash
   MONGODB_URI="$PRODUCTION_URI" node backend/scripts/jsonBackupRestore.js --restore "backups/dump-TARGET-TIMESTAMP"
   ```
4. Verify indexes, migrations, counters, and storage report:
   ```bash
   MONGODB_URI="$PRODUCTION_URI" node backend/migrations/runner.js
   MONGODB_URI="$PRODUCTION_URI" node backend/scripts/syncIndexes.js
   MONGODB_URI="$PRODUCTION_URI" node backend/scripts/reconcileCounters.js
   MONGODB_URI="$PRODUCTION_URI" node backend/scripts/storageReport.js
   ```
5. Resume application traffic and monitor error rates.

---

## 4. Disaster Recovery Checklist

- [ ] Target backup directory identified and validated (`metadata.json` present).
- [ ] Staging restoration drill succeeded with 0 errors.
- [ ] Counter reconciliation reported 0 drift.
- [ ] Storage report confirmed database size < 400 MB.
- [ ] Pre-restore backup created of current production state.
- [ ] Production restore executed and verified.
