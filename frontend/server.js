import express from 'express';
import path from 'path';
import cors from 'cors';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Enable CORS
app.use(cors());

// Set CORS headers for cross-origin isolation
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  next();
});

// Serve WASM files with correct MIME type
app.get('*.wasm', (req, res, next) => {
  res.setHeader('Content-Type', 'application/wasm');
  next();
});

// Serve static files from public directory
app.use(express.static('public'));

// Serve the React app
app.use(express.static('dist'));

// For any other route, serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('WASM files will be served with correct MIME types');
});
