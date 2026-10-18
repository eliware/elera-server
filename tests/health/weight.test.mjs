import { expect, test } from "@jest/globals";
import { calculateWeight } from "../../src/health/weight.mjs";

test("returns full weight for a synced primary node", () => {
  const values = {
    wsrep_local_state_comment: "Synced",
    wsrep_ready: "ON",
    wsrep_cluster_status: "Primary",
    wsrep_local_recv_queue: "0",
    wsrep_local_send_queue: "0",
    wsrep_flow_control_paused: "0",
  };
  expect(calculateWeight(values)).toBe(100);
  expect(calculateWeight({ ...values, wsrep_local_state_comment: "Joining" })).toBe(0);
  expect(calculateWeight({ ...values, wsrep_local_recv_queue: "17" })).toBe(0);
  expect(calculateWeight({ ...values, wsrep_flow_control_paused: "0.05" })).toBe(0);
});
