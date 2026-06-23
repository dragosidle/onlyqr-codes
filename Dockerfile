# OnlyQR backend image.
#   - dev target:  backend only (the full dev stack lives in Dockerfile.dev)
#   - prod target: self-contained — builds the React app and serves it from the
#     same FastAPI/gunicorn process, so one container holds the whole app.

# ---- Build the React frontend ----
FROM node:22-slim AS frontend-build
WORKDIR /frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci
COPY frontend/ ./
RUN npm run build          # -> /frontend/dist

# ---- Python base (shared deps) ----
FROM python:3.12-slim AS base
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .

# ---- Dev: backend only, hot reload ----
FROM base AS dev
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]

# ---- Prod: API + built frontend in one process ----
FROM base AS prod
ENV ENV=production
COPY --from=frontend-build /frontend/dist ./frontend/dist
CMD ["gunicorn", "main:app", "-w", "5", "-k", "uvicorn.workers.UvicornWorker", "--bind", "0.0.0.0:8000"]
