import { expect, test } from "@jest/globals";
import {
  isInitializedLifecycleState,
  isLifecycleAction,
  isLifecycleFqdn,
} from "../../../src/cluster/lifecycle/plan-rules.mjs";

test("validates lifecycle action, state, and FQDN rules", () => {
  expect(isLifecycleAction("bootstrap")).toBe(true);
  expect(isLifecycleAction("unknown")).toBe(false);
  expect(isInitializedLifecycleState("Synced")).toBe(true);
  expect(isInitializedLifecycleState("Unknown")).toBe(false);
  expect(isLifecycleFqdn("node.example.test")).toBe(true);
  expect(isLifecycleFqdn("node")).toBe(false);
});
