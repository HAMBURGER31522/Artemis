import { spawn } from 'node:child_process';
import { childEnvironment } from './tool-paths.mjs';

const command = process.platform === 'win32' ? 'tauri.cmd' : 'tauri';
const child = spawn(command, process.argv.slice(2), {
  env: childEnvironment(),
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('error', (error) => {
  console.error(`无法启动 Tauri CLI：${error.message}`);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  process.exitCode = typeof code === 'number' ? code : 1;
  if (signal) {
    console.error(`Tauri CLI 被信号 ${signal} 终止`);
  }
});
