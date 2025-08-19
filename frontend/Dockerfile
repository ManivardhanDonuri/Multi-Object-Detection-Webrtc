FROM node:20-alpine
WORKDIR /app

# Install curl for downloading WASM files
RUN apk add --no-cache curl

# Install dependencies
COPY package.json package-lock.json* /app/
RUN npm ci || npm install

# Copy source code and scripts
COPY . /app

# Download WASM files directly
RUN mkdir -p public && \
    curl -L "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm.wasm" -o public/ort-wasm.wasm && \
    curl -L "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-simd.wasm" -o public/ort-wasm-simd.wasm && \
    curl -L "https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-threaded.wasm" -o public/ort-wasm-threaded.wasm

# Build the application
ARG VITE_BACKEND_URL
ARG VITE_DEFAULT_MODE
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL
ENV VITE_DEFAULT_MODE=$VITE_DEFAULT_MODE
RUN npm run build

# Copy WASM files to dist directory
RUN cp public/*.wasm dist/

# Expose port
EXPOSE 3000

# Start the Express server
CMD ["npm", "run", "serve"]
