#!/bin/bash

# Create public directory if it doesn't exist
mkdir -p public

# Download ONNX Runtime Web WASM files
echo "Downloading ONNX Runtime Web WASM files..."

# Base URL for ONNX Runtime Web WASM files
BASE_URL="https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist"

# Download the required WASM files
curl -L "${BASE_URL}/ort-wasm.wasm" -o public/ort-wasm.wasm
curl -L "${BASE_URL}/ort-wasm-simd.wasm" -o public/ort-wasm-simd.wasm
curl -L "${BASE_URL}/ort-wasm-threaded.wasm" -o public/ort-wasm-threaded.wasm

echo "WASM files downloaded successfully!"
echo "Files downloaded:"
ls -la public/*.wasm
