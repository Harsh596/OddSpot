# Oddspot Production Incident Playbooks & Operations Runbook

This runbook defines step-by-step emergency procedures and diagnostic playbooks for four high-impact operational incidents on Oddspot:

1. [Playbook 1: Leaked `JWT_SECRET` or `FUZZ_SECRET` Rotation](#1-playbook-1-leaked-jwt_secret-or-fuzz_secret-rotation)
2. [Playbook 2: Accidental Data Deletion & Disaster Restore](#2-playbook-2-accidental-data-deletion--disaster-restore)
3. [Playbook 3: Coordinated Brigading & Abuse Wave Mitigation](#3-playbook-3-coordinated-brigading--abuse-wave-mitigation)
4. [Playbook 4: Atlas M0 Storage Limit Approaching Capacity (>400 MB Alert)](#4-playbook-4-atlas-m0-storage-approaching-capacity-400-mb-alert)

---

## 1. Playbook 1: Leaked `JWT_SECRET` or `FUZZ_SECRET` Rotation

### 1.1 Incident: Leaked `JWT_SECRET` (Severity: P1 Critical)

**Impact:** An attacker in possession of `JWT_SECRET` can forge valid HS256 JWTs for any user, impersonate administrators, and bypass access control.

#### Option A: Immediate Hard Revocation (Active Compromise)
Use this procedure if an active compromise is suspected and all sessions must be terminated instantly.

1. **Invalidate All Existing Sessions in Database**:
   Run this one-line command against the production database to increment `tokenVersion` across all users and revoke all refresh tokens:
   ```bash
   node -e "
     const mongoose = require('mongoose');
     const { connect } = require('./backend/db');
     const { User, RefreshToken } = require('./backend/models');
     (async () => {
       await connect();
       const uRes = await User.updateMany({}, { \$inc: { tokenVersion: 1 } });
       const rRes = await RefreshToken.updateMany({}, { \$set: { revoked: true, revokedAt: new Date() } });
       console.log(\`Hard revocation complete: \${uRes.modifiedCount} users bumped, \${rRes.modifiedCount} refresh tokens revoked.\`);
       await mongoose.disconnect();
     })().catch(e => { console.error(e); process.exit(1); });
   "
   ```

2. **Generate a New Cryptographic Secret**:
   ```bash
   NEW_JWT_SECRET=$(openssl rand -hex 32)
   echo "Generated 64-character secret"
   ```

3. **Update Server Environment**:
   Replace `JWT_SECRET` in your secure environment secret manager or production `.env`:
   ```bash
   JWT_SECRET="<NEW_JWT_SECRET>"
   ```

4. **Restart Backend Service**:
   ```bash
   docker compose restart backend
   # OR for systemd:
   sudo systemctl restart oddspot-backend
   ```

5. **Verify Incident Resolution**:
   - Attempt an API call with an old JWT: must return `401 Unauthorized` (`INVALID_OR_EXPIRED_TOKEN`).
   - Log in with valid credentials: must receive a new access token and successfully authenticate.

---

#### Option B: Zero-Downtime Keyring Rotation (Planned Rotation)
Use this procedure for scheduled key rotations without forcing immediate user logouts.

1. **Generate a New Key Identifier (`kid`)**:
   ```bash
   NEW_KID="key-$(date +%Y-%m-%d)"
   NEW_SECRET=$(openssl rand -hex 32)
   ```

2. **Update Environment Keyring**:
   Append the new key to `JWT_SECRETS` JSON and set `JWT_CURRENT_KEY_ID`:
   ```bash
   JWT_CURRENT_KEY_ID="key-2026-10-27"
   JWT_SECRETS='{"key-2026-07-01":"<OLD_SECRET>","key-2026-10-27":"<NEW_SECRET>"}'
   ```

3. **Deploy Backend**:
   - The backend signs all **new** access tokens using `key-2026-10-27`.
   - Existing tokens signed with `key-2026-07-01` continue to verify until their 15-minute expiration.

4. **Retire Old Key**:
   After 20 minutes (15-minute token TTL + 5-minute clock skew), update `JWT_SECRETS` to remove `key-2026-07-01`.

---

### 1.2 Incident: Leaked `FUZZ_SECRET` / `LOCATION_FUZZ_SALT` (Severity: P2 High)

**Impact:** An attacker who possesses the fuzz secret and an exported database dump could theoretically invert polar coordinate fuzzing to narrow down the true locations of `hideExact: true` spots. In production, `validateFuzzConfig()` requires `FUZZ_SECRET` (or `LOCATION_FUZZ_SALT`) to be at least 32 characters long.

1. **Generate a New Random Salt**:
   ```bash
   NEW_FUZZ_SECRET=$(openssl rand -hex 32)
   ```

2. **Update Environment**:
   Update `FUZZ_SECRET` (or `LOCATION_FUZZ_SALT`) in the backend environment. Must be at least 32 characters long.

3. **Execute Feed Location Backfill Migration**:
   Run the tested migration script to re-fuzz all spots with `hideExact: true` using the new salt:
   ```bash
   node backend/scripts/backfillFeedLocation.js
   ```
   *Note: This updates only `feedLocation`; the true physical `location` remains completely unchanged.*

4. **Re-synchronize Geospatial Indexes**:
   ```bash
   node backend/scripts/syncIndexes.js
   ```

5. **Purge Reverse Proxy Cache & Restart**:
   Purge edge caches (e.g. Cloudflare / Nginx) to invalidate stale serialized responses.

---

## 2. Playbook 2: Accidental Data Deletion & Disaster Restore

### 2.1 Pre-Flight Rules

> [!CAUTION]
> **Never restore directly to the production database without first running a staging drill.**
> Always restore into an isolated database (`oddspot_staging` or `oddspot_restore_test`) to verify document counts and run counter reconciliation.

### 2.2 Step-by-Step Restoration Procedure

```
                     +---------------------------------------+
                     |       Accidental Deletion Detected    |
                     +---------------------------------------+
                                          |
                                          v
                     +---------------------------------------+
                     | 1. Pause Inbound Write Traffic        |
                     +---------------------------------------+
                                          |
                                          v
                     +---------------------------------------+
                     | 2. Identify Target Backup in backups/ |
                     +---------------------------------------+
                                          |
                                          v
                     +---------------------------------------+
                     | 3. Execute Staging Restore Drill      |
                     |    - jsonBackupRestore.js             |
                     |    - runner.js (migrations)          |
                     |    - syncIndexes.js                   |
                     |    - reconcileCounters.js (0 drift)   |
                     |    - storageReport.js (<400 MB)       |
                     +---------------------------------------+
                                          |
                                  Did drill pass?
                                 /               \
                               YES                NO -> Abort & inspect dump
                               /
                              v
                     +---------------------------------------+
                     | 4. Take Snapshot of Current Prod DB   |
                     +---------------------------------------+
                                          |
                                          v
                     +---------------------------------------+
                     | 5. Execute Production Restore         |
                     +---------------------------------------+
                                          |
                                          v
                     +---------------------------------------+
                     | 6. Reconcile Counters & Reopen Traffic|
                     +---------------------------------------+
```

#### Step 1: Pause Inbound Write Traffic
Temporarily return `503 Service Unavailable` for write routes (`POST`, `PUT`, `PATCH`, `DELETE`) via Nginx or Cloudflare firewall rule to prevent data divergence.

#### Step 2: Locate and Inspect Backup Manifest
Backups are located in `backups/dump-YYYYMMDDTHHMMSSZ/`:
```bash
ls -la backups/
cat backups/dump-TARGET-TIMESTAMP/metadata.json
```
Verify that the target timestamp contains the records prior to deletion.

#### Step 3: Run the Staging Restore Drill
```bash
# 1. Point to isolated staging DB
export RESTORE_DRILL_URI="mongodb+srv://<USER>:<PASS>@cluster.mongodb.net/oddspot_restore_drill"

# 2. Restore all 17 collections
MONGODB_URI="$RESTORE_DRILL_URI" node backend/scripts/jsonBackupRestore.js --restore "backups/dump-TARGET-TIMESTAMP"

# 3. Synchronize database indexes
MONGODB_URI="$RESTORE_DRILL_URI" node backend/scripts/syncIndexes.js

# 4. Verify counter integrity (0 drift expected)
MONGODB_URI="$RESTORE_DRILL_URI" node backend/scripts/reconcileCounters.js

# 5. Check storage budget
MONGODB_URI="$RESTORE_DRILL_URI" node backend/scripts/storageReport.js --warn-threshold 400
```

#### Step 4: Backup the Current Production State
Before touching production, create a safety snapshot of the current state:
```bash
bash backend/scripts/backup.sh
```

#### Step 5: Execute Production Restoration
Once the staging drill succeeds:
```bash
# Execute production restore
MONGODB_URI="$PRODUCTION_MONGODB_URI" node backend/scripts/jsonBackupRestore.js --restore "backups/dump-TARGET-TIMESTAMP"

# Synchronize indexes
MONGODB_URI="$PRODUCTION_MONGODB_URI" node backend/scripts/syncIndexes.js

# Run counter reconciliation and apply fixes if any drift occurred
MONGODB_URI="$PRODUCTION_MONGODB_URI" node backend/scripts/reconcileCounters.js --apply
```

#### Step 6: Reopen Inbound Traffic
Disable the maintenance mode rule and verify application functionality with `backend/scripts/manualChecks.sh`.

---

## 3. Playbook 3: Coordinated Brigading & Abuse Wave Mitigation

### 3.1 Attack Symptoms & Detection
- **Sybil Vote Brigade**: Multiple new or unverified accounts rapidly upvoting or downvoting targeted spots to force tier promotions or trigger auto-review hiding.
- **Spam Flood**: Bot accounts flooding comment threads with repetitive links or phishing attempts.
- **Mass False Reporting**: Coordinated reports on innocent spots to weaponize the 5-report threshold (`underReview: true`).

### 3.2 Automated Circuit Breakers in Code
The Oddspot engine includes built-in protection:
1. **Automated Velocity Freeze (`meter.js`)**:
   If $\ge 10$ distinct users interact with a single spot within 60 seconds, `post.velocityFrozen` is automatically tripped to `true`. Further reactions are logged to ledgers, but the Oddometer score and tier progression are locked.
2. **Automated Review Quarantine (`posts.js`)**:
   If a post receives $\ge 5$ distinct reports or weighted reports $\ge 5.0$, `post.underReview` is set to `true`, auto-hiding the post from public feeds until moderator triage.

### 3.3 Active Mitigation Playbook

#### Action 1: Manually Freeze Velocity on Target Spot(s)
Lock a spot's score immediately to prevent manipulation:
```bash
# Using Admin/Mod endpoint
curl -X POST "https://api.oddspot.app/api/v1/mod/posts/<POST_ID>/freeze-velocity" \
  -H "Authorization: Bearer $MOD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Active voting brigade detected under investigation"}'
```

#### Action 2: Apply Shadow-Bans to Sybil Accounts
Shadow-banning suppresses the attacker's visibility without alerting them:
- Their votes do not affect scores.
- Their comments and posts are visible only to themselves.
- Their actions do not generate notifications for innocent users.
```bash
curl -X POST "https://api.oddspot.app/api/v1/mod/users/<USER_ID>/shadow-ban" \
  -H "Authorization: Bearer $MOD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "Sybil vote brigading cluster #42"}'
```

#### Action 3: Review and Triage the Moderation Queue
Pull the live queue of reported spots sorted by report weight:
```bash
curl -X GET "https://api.oddspot.app/api/v1/mod/queue" \
  -H "Authorization: Bearer $MOD_TOKEN"
```
Dismiss false reports or confirm actions:
```bash
# Dismiss false report brigade on legitimate spot
curl -X POST "https://api.oddspot.app/api/v1/mod/reports/<REPORT_ID>/resolve" \
  -H "Authorization: Bearer $MOD_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "dismissed", "resolutionNote": "Coordinated false flag brigade"}'
```

#### Action 4: Emergency Rate-Limit Hardening
In case of intense distributed traffic, tighten write rate limits temporarily via reverse proxy or environment variables:
```bash
# Lower write limits to 5 requests per minute per IP
WRITE_RATE_LIMIT_MAX=5 docker compose restart backend
```

---

## 4. Playbook 4: Atlas M0 Storage Approaching Capacity (>400 MB Alert)

### 4.1 Root Cause Analysis & Storage Limits
MongoDB Atlas free M0 clusters enforce a hard **512 MB disk quota**. Exceeding 512 MB triggers cluster-wide write throttling or read-only lockout.

Oddspot emits a warning when storage exceeds **400 MB** (~78% quota).

### 4.2 Diagnostic Inspection

Run the storage diagnostic tool to identify which collections and indexes are consuming disk space:
```bash
node backend/scripts/storageReport.js --warn-threshold 400
```

The script outputs a sorted table:
```
Collection          Count       Data Size   Index Size  Total Size
------------------------------------------------------------------
auditlogs           45,200      142.1 MB    48.3 MB     190.4 MB
notifications       82,100       85.4 MB    32.1 MB     117.5 MB
idempotencykeys     31,000       42.0 MB    15.0 MB      57.0 MB
posts                3,200       12.1 MB     6.4 MB      18.5 MB
...
TOTAL CLUSTER SIZE: 412.3 MB / 512.0 MB [WARNING: THRESHOLD EXCEEDED]
```

### 4.3 Remediation Procedures

#### Step 1: Verify MongoDB TTL Thread Execution
Check if background TTL threads are purging expired records:
```bash
node -e "
  const { connect, mongoose } = require('./backend/db');
  (async () => {
    await connect();
    const admin = mongoose.connection.db.admin();
    const serverStatus = await admin.serverStatus();
    console.log('TTL metrics:', serverStatus.metrics?.ttl);
    await mongoose.disconnect();
  })();
"
```
If `serverStatus.metrics.ttl.passes` is zero or not incrementing, proceed to manual pruning.

#### Step 2: Manually Prune Old Audit Logs (>90 Days)
Retain only recent regulatory audit logs:
```bash
node -e "
  const { connect, mongoose } = require('./backend/db');
  const { AuditLog } = require('./backend/models');
  (async () => {
    await connect();
    const cutoff = new Date(Date.now() - 90 * 86400000);
    const result = await AuditLog.deleteMany({ createdAt: { \$lt: cutoff } });
    console.log(\`Deleted \${result.deletedCount} audit logs older than 90 days.\`);
    await mongoose.disconnect();
  })();
"
```

#### Step 3: Prune Stale Notifications & Idempotency Keys
```bash
node -e "
  const { connect, mongoose } = require('./backend/db');
  const { Notification, IdempotencyKey, RefreshToken } = require('./backend/models');
  (async () => {
    await connect();
    const notifCutoff = new Date(Date.now() - 30 * 86400000);
    const nRes = await Notification.deleteMany({ createdAt: { \$lt: notifCutoff } });
    const iRes = await IdempotencyKey.deleteMany({ createdAt: { \$lt: new Date(Date.now() - 86400000) } });
    const rRes = await RefreshToken.deleteMany({ expiresAt: { \$lt: new Date() } });
    console.log(\`Pruned: \${nRes.deletedCount} notifications, \${iRes.deletedCount} idempotency keys, \${rRes.deletedCount} expired refresh tokens.\`);
    await mongoose.disconnect();
  })();
"
```

#### Step 4: Verify Zero Base64 Embedded Images
Verify that no client managed to bypass validators and upload inline base64 image strings:
```bash
node -e "
  const { connect, mongoose } = require('./backend/db');
  const { Post } = require('./backend/models');
  (async () => {
    await connect();
    const oversized = await Post.find({ 'images.url': { \$regex: '^data:' } });
    console.log(\`Found \${oversized.length} posts with inline data URI images.\`);
    await mongoose.disconnect();
  })();
"
```

#### Step 5: Run Collection Compaction
WiredTiger storage engines do not automatically return freed space to the operating system without compaction. Run compaction on the pruned collections:
```javascript
// Run in mongosh or Atlas Data Explorer
use oddspot;
db.runCommand({ compact: 'auditlogs' });
db.runCommand({ compact: 'notifications' });
db.runCommand({ compact: 'idempotencykeys' });
```

#### Step 6: Re-run Storage Verification
```bash
node backend/scripts/storageReport.js --warn-threshold 400
```
Confirm total storage is reduced safely below the 400 MB warning watermark.
