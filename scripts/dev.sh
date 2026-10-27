#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$(pwd)/node_modules/.bin:$PATH"
# Always regenerate before boot so Turbopack never starts on a stale client.
prisma generate
exec next dev --turbopack "$@"
