import { Worker } from 'node:worker_threads';
import path from 'node:path';
import os from 'node:os';

export function createWorkerPool(concurrency = Math.min(os.cpus().length, 6)) {
  const workers = [];
  const queue = [];
  const activeTasks = new Map();
  let workerScript = path.resolve('tests/workers/contract-worker.mjs');

  const createWorker = () => {
    const worker = new Worker(workerScript);
    const w = { worker, busy: false };

    worker.on('message', (result) => {
      const { resolve } = activeTasks.get(w);
      activeTasks.delete(w);
      w.busy = false;
      resolve(result);
      dispatch();
    });

    worker.on('error', (err) => {
      console.error('Worker error:', err);
    });

    workers.push(w);
  };

  for (let i = 0; i < concurrency; i++) {
    createWorker();
  }

  const dispatch = () => {
    if (queue.length === 0) return;
    const availableWorker = workers.find(w => !w.busy);
    if (!availableWorker) return;

    const { task, resolve, reject } = queue.shift();
    availableWorker.busy = true;
    activeTasks.set(availableWorker, { resolve, reject });
    availableWorker.worker.postMessage(task);
  };

  return {
    run: (task) => new Promise((resolve, reject) => {
      queue.push({ task, resolve, reject });
      dispatch();
    }),
    stop: () => {
      workers.forEach(w => w.worker.terminate());
    }
  };
}
