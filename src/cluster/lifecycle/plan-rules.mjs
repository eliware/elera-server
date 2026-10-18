const actions = new Set(["bootstrap", "join", "leave", "recover"]);
const initializedStates = new Set([
  "Initialized",
  "Joining",
  "Joined",
  "Synced",
  "Donor",
  "Donor/Desynced",
  "Desynced",
]);

export const isLifecycleAction = (action) => actions.has(action);
export const isInitializedLifecycleState = (state) => initializedStates.has(state);
export const isLifecycleFqdn = (value) =>
  typeof value === "string" &&
  value.length <= 253 &&
  value.includes(".") &&
  !value.endsWith(".") &&
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);
