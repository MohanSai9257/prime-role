#!/usr/bin/env bash

set -Eeuo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
PYTHON_BIN="${PROJECT_ROOT}/.venv/bin/python"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"
BACKEND_PID=""
FRONTEND_PID=""

if [[ ! -x "${PYTHON_BIN}" ]]; then
  echo "Python virtual environment not found at ${PROJECT_ROOT}/.venv."
  echo "Create it with: python3.13 -m venv .venv"
  exit 1
fi

if [[ ! -d "${PROJECT_ROOT}/frontend/node_modules" ]]; then
  echo "Frontend dependencies are not installed."
  echo "Run: npm --prefix frontend install"
  exit 1
fi

cleanup() {
  trap - EXIT INT TERM

  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}" 2>/dev/null || true
  fi

  if [[ -n "${FRONTEND_PID}" ]] && kill -0 "${FRONTEND_PID}" 2>/dev/null; then
    kill "${FRONTEND_PID}" 2>/dev/null || true
  fi

  [[ -n "${BACKEND_PID}" ]] && wait "${BACKEND_PID}" 2>/dev/null || true
  [[ -n "${FRONTEND_PID}" ]] && wait "${FRONTEND_PID}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

cd "${PROJECT_ROOT}"

echo "Starting FastAPI at http://127.0.0.1:${BACKEND_PORT}"
"${PYTHON_BIN}" -m uvicorn app.main:app \
  --app-dir backend \
  --reload \
  --host 127.0.0.1 \
  --port "${BACKEND_PORT}" &
BACKEND_PID=$!

echo "Starting React at http://127.0.0.1:${FRONTEND_PORT}"
npm --prefix frontend run dev -- \
  --host 127.0.0.1 \
  --port "${FRONTEND_PORT}" &
FRONTEND_PID=$!

while kill -0 "${BACKEND_PID}" 2>/dev/null && kill -0 "${FRONTEND_PID}" 2>/dev/null; do
  sleep 1
done

if ! kill -0 "${BACKEND_PID}" 2>/dev/null; then
  wait "${BACKEND_PID}"
else
  wait "${FRONTEND_PID}"
fi
