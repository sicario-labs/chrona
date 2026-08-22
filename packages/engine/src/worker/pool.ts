import os from 'node:os';

export interface PoolOptions {
  concurrency?: number;
}

/**
 * Parallel Batch Execution Pool
 *
 * Runs asynchronous tasks with bounded concurrency to maximize CPU throughput
 * without exceeding memory or file descriptor limits.
 */
export async function parallelMap<T, R>(
  items: T[],
  workerFn: (item: T, index: number) => Promise<R>,
  options: PoolOptions = {}
): Promise<R[]> {
  const concurrency = Math.max(1, options.concurrency || Math.min(os.cpus().length || 4, 8));
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      const item = items[currentIndex];
      results[currentIndex] = await workerFn(item, currentIndex);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);

  return results;
}
