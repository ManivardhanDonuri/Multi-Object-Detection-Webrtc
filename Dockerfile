# Multi-stage build: build frontend, then package with backend

# 1) Build frontend
FROM node:20-alpine AS frontend
WORKDIR /app

# Install curl for downloading WASM files
RUN apk add --no-cache curl

COPY frontend/package*.json ./
RUN npm ci || npm install
COPY frontend/ ./

# Download WASM files directly
RUN mkdir -p public && \
    curl -L "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm.wasm" -o public/ort-wasm.wasm && \
    curl -L "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-simd.wasm" -o public/ort-wasm-simd.wasm && \
    curl -L "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-threaded.wasm" -o public/ort-wasm-threaded.wasm

# Build the application
RUN npm run build

# Copy WASM files to dist directory
RUN cp public/*.wasm dist/

# 2) Backend runtime
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1
WORKDIR /app
# System deps for OpenCV/AV
RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*
# Install backend deps
COPY backend/requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
# Copy backend app
COPY backend/app /app/app
# Copy built frontend
COPY --from=frontend /app/dist /app/frontend_dist
# Expose and run
EXPOSE 8000
ENV HOST=0.0.0.0
# Allow platforms like Render/Railway to inject PORT; default 8000
ENV PORT=8000
CMD sh -c 'uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}'
