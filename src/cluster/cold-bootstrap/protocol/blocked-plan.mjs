export async function saveBlockedRecoveryPlan({
  reason,
  code,
  evidence = [],
  failures = [],
  eventReason = reason,
  now,
  persist,
  publishEvent,
  setCurrent,
}) {
  const current = {
    version: 1,
    phase: "blocked",
    reason,
    ...(code ? { code } : {}),
    evidence,
    ...(failures.length
      ? {
          errors: failures.map((failure) => ({
            code: failure.code,
            message: failure.message,
            endpoint: failure.endpoint,
            expectedNode: failure.expectedNode,
            actualNode: failure.actualNode,
          })),
        }
      : {}),
    updatedAt: now().toISOString(),
  };
  setCurrent(current);
  await persist(current);
  await publishEvent({
    type: "recovery.refused",
    reason: eventReason,
    code: current.code,
    ...(evidence.length ? { evidence } : {}),
  });
  return { eligible: false, mode: "blocked", ...current };
}
