#!/usr/bin/env node
// Starts the ASP.NET Core server (which also serves the built React SPA).
// Run via: npm run start:web  (from repo root)
// The server prints the LAN IP automatically on startup.

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverDir = path.join(__dirname, '..', 'server');

console.log('\n  ╔════════════════════════════════════════╗');
console.log('  ║  Beatify Web — starting backend…       ║');
console.log('  ╚════════════════════════════════════════╝\n');

const proc = spawn('dotnet', ['run'], {
  cwd: serverDir,
  stdio: 'inherit',
  shell: true,
});

proc.on('error', (err) => {
  console.error('Failed to start dotnet:', err.message);
  process.exit(1);
});

proc.on('exit', (code) => process.exit(code ?? 0));

// Forward Ctrl+C
process.on('SIGINT', () => proc.kill('SIGINT'));
process.on('SIGTERM', () => proc.kill('SIGTERM'));
