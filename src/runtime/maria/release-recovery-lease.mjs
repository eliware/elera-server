export async function releaseRecoveryLease(lease, log = {}) {
  if (typeof lease?.release !== "function") return;
  try {
    await lease.release();
  } catch (error) {
    log.warn?.("Recovery lease cleanup failed", { error });
  }
}
