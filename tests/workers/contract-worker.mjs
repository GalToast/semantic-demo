import { parentPort } from 'node:worker_threads';
import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';

function closeBrowserTree(pid) {
  if (process.platform !== 'win32') return;
  try {
    execFileSync('taskkill', ['/T', '/F', '/PID', String(pid)], { stdio: 'ignore', timeout: 8000 });
  } catch { }
}

async function runContract(filename, timeoutMs, baseUrl) {
  const start = Date.now();
  const projectRoot = path.resolve('.');
  const filePath = path.resolve('tests', filename);

  return new Promise((resolve) => {
    const cmd = process.execPath;
    let args;

    if (filename.endsWith('.spec.js')) {
      // Playwright test - use @playwright/test cli
      const playwrightCli = path.join(projectRoot, 'node_modules', '@playwright', 'test', 'cli.js');
      args = [playwrightCli, 'test', `tests/${filename}`, '--browser=chromium'];
    } else if (filename.endsWith('.mjs')) {
      // Node ESM contract
      args = [filePath];
    } else {
      // Fallback: run directly
      args = [filePath];
    }

    const child = spawn(cmd, args, {
      cwd: projectRoot,
      env: { ...process.env, TEST_BASE_URL: baseUrl },
      shell: false
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => { stdout += data.toString(); });
    child.stderr.on('data', (data) => { stderr += data.toString(); });

    const timeout = setTimeout(() => {
      // On Windows, kill the entire process tree
      closeBrowserTree(child.pid);
      child.kill('SIGKILL');
      resolve({
        filename,
        ok: false,
        duration: Date.now() - start,
        error: `Timed out after ${timeoutMs}ms`,
        stdout,
        stderr
      });
    }, timeoutMs);

    child.on('exit', (code, signal) => {
      clearTimeout(timeout);
      // On Windows, clean up any Chromium child processes
      if (process.platform === 'win32' && filename.endsWith('.spec.js')) {
        closeBrowserTree(child.pid);
      }
      resolve({
        filename,
        ok: code === 0,
        duration: Date.now() - start,
        exitCode: code,
        signal,
        stdout,
        stderr
      });
    });

    child.on('error', (err) => {
      clearTimeout(timeout);
      resolve({
        filename,
        ok: false,
        duration: Date.now() - start,
        error: `Spawn error: ${err.message}`,
        stdout,
        stderr
      });
    });
  });
}

if (parentPort) {
  parentPort.on('message', async (data) => {
    const { filename, timeoutMs, baseUrl } = data;
    const result = await runContract(filename, timeoutMs, baseUrl);
    parentPort.postMessage(result);
  });
}