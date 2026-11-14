/** Run async jobs with at most `limit` in flight. */
export async function runPool<T>(items: T[], limit: number, job: (item: T) => Promise<void>) {
  const queue = [...items];
  const workers = Array.from({ length: Math.min(limit, queue.length) }, async () => {
    while (queue.length) await job(queue.shift()!);
  });
  await Promise.all(workers);
}
