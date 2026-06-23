#!/usr/bin/env bash
# Run the FastAPI backend and the Vite dev server together in one container.
# If either process exits, tear the other down so the failure surfaces.
set -euo pipefail

pids=()
cleanup() { kill "${pids[@]}" 2>/dev/null || true; }
trap cleanup SIGINT SIGTERM EXIT

# Backend — hot reload on source changes.
uvicorn main:app --host 0.0.0.0 --port 8000 --reload &
pids+=($!)

# Frontend — Vite dev server with HMR (host/port/polling come from vite.config.js).
( cd frontend && npm run dev ) &
pids+=($!)

# Return as soon as either backend or frontend exits.
wait -n
