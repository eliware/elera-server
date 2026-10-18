import { evaluateQuorum } from "../../../cluster/quorum.mjs";
import { filterReachableNodes } from "../../address-validation.mjs";

export async function resolveEligibleBundleObservations(
  observations,
  { environment, now, validateAddresses, resolveAddress, log },
) {
  const quorum = evaluateQuorum(observations, {
    now,
    expectedSize: Number(environment.ELERA_CLUSTER_SIZE ?? observations.length),
  });
  if (!quorum.quorum) return { quorum, observations: [] };
  const eligible = validateAddresses
    ? await filterReachableNodes(observations, { resolve: resolveAddress, log })
    : observations;
  return { quorum, observations: eligible };
}
