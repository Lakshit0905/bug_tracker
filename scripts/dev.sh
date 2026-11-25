#!/usr/bin/env bash
# Start the whole stack locally: migrate the DB, then run the API (:8000) and the web app (:5173).
# Usage: ./scripts/dev.sh [--seed]     (--seed loads the demo team and bugs; wipes existing bugs)
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PY="$ROOT/backend/.venv/bin/python"
[ -x "$PY" ] || { echo "Backend venv missing: cd backend && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt"; exit 1; }
[ -d "$ROOT/frontend/node_modules" ] || (cd "$ROOT/frontend" && npm install)

cd "$ROOT/backend"
"$PY" -m alembic upgrade head
"$PY" -m scripts.seed_admin || true
if [ "${1:-}" = "--seed" ]; then "$PY" -m scripts.seed_demo --reset; fi

cleanup() { kill 0 2>/dev/null || true; }
trap cleanup EXIT INT TERM

"$PY" -m uvicorn app.main:app --reload --port 8000 &
(cd "$ROOT/frontend" && npm run dev -- --port 5173) &

echo
echo "  API      http://localhost:8000/docs"
echo "  Web app  http://localhost:5173"
echo "  Ctrl+C stops both."
wait
