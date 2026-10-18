const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function retryStartupEvidence({ attempts, delayMs, collect, resolve }) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await resolve(await collect());
    } catch (error) {
      lastError = error;
      if (error?.code === "RECOVERY_EVIDENCE_IDENTITY_MISMATCH")
        return {
          mode: "blocked",
          reason: error.message,
          code: error.code,
          epoch: null,
          evidence: [],
        };
    }
    if (attempt + 1 < attempts) await sleep(delayMs);
  }
  return {
    mode: "blocked",
    reason: `recovery data unavailable: ${lastError?.message ?? "timeout"}`,
    epoch: null,
    evidence: [],
  };
}
