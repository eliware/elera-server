export const nodeDataResetOptions = (overrides = {}) => ({
  node: "node-a.example.test",
  dataDir: "C:/data",
  getStatus: async () => ({
    ready: false,
    values: { wsrep_local_state_comment: "Initialized", wsrep_cluster_status: "non-Primary" },
  }),
  ...overrides,
});
