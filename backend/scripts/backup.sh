#!/usr/bin/env bash
# backend/scripts/backup.sh
# Creates a snapshot of the Oddspot MongoDB database.
# Usage:
#   MONGODB_URI="..." bash backend/scripts/backup.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

if [ -z "${MONGODB_URI:-}" ]; then
  echo "Error: MONGODB_URI is not set in the environment." >&2
  echo "Usage: MONGODB_URI=\"...\" bash backend/scripts/backup.sh" >&2
  exit 1
fi

TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUPS_DIR="$PROJECT_ROOT/backups"
OUT_DIR="$BACKUPS_DIR/dump-$TIMESTAMP"

mkdir -p "$BACKUPS_DIR"

echo "=== Oddspot Database Backup ==="
echo "Target Directory: $OUT_DIR"
echo "Timestamp:        $TIMESTAMP"

if command -v mongodump >/dev/null 2>&1; then
  echo "Using native 'mongodump' binary with gzip compression..."
  mongodump --uri="$MONGODB_URI" --gzip --out="$OUT_DIR"
  echo "Backup successfully created via mongodump at: $OUT_DIR"
else
  echo "'mongodump' not found in PATH. Using built-in Node EJSON export engine..."
  node "$SCRIPT_DIR/jsonBackupRestore.js" --dump "$OUT_DIR"
  echo "Backup successfully created via jsonBackupRestore at: $OUT_DIR"
fi

echo "================================"
