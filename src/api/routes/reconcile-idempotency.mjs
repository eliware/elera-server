const operations = new WeakMap();

export async function applyReconcileIdempotently(reconciler, path, desired, options, key) {
  if (typeof key !== "string" || key.length === 0)
    throw Object.assign(new Error("restore apply requires an Idempotency-Key"), {
      statusCode: 400,
    });
  let requests = operations.get(reconciler);
  if (!requests) operations.set(reconciler, (requests = new Map()));
  const fingerprint = JSON.stringify({ path, desired });
  const existing = requests.get(key);
  if (existing) {
    if (existing.fingerprint !== fingerprint)
      throw Object.assign(new Error("Idempotency-Key was already used for another request"), {
        statusCode: 409,
      });
    return existing.result;
  }
  const entry = { fingerprint, result: reconciler.apply(desired, options) };
  requests.set(key, entry);
  try {
    entry.result = await entry.result;
    return entry.result;
  } catch (error) {
    requests.delete(key);
    throw error;
  }
}
