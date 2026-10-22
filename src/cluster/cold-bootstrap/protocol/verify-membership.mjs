export async function verifyRecoveryMembership({ collect, nodes, clusterId }) {
  const { evidence } = await collect();
  const members = evidence.filter((item) => {
    const galera = item.galera;
    return (
      item.active === true &&
      galera?.clusterUuid === clusterId &&
      galera?.clusterStatus === "Primary" &&
      galera?.localState === "Synced" &&
      (galera?.ready === "ON" || galera?.ready === true) &&
      Number(galera?.clusterSize) === nodes.length
    );
  });
  const names = members.map((item) => item.node).sort();
  const expected = nodes.map((node) => node.name).sort();
  if (names.length !== expected.length || names.some((name, index) => name !== expected[index]))
    throw Object.assign(new Error("live Galera membership does not match the approved quorum"), {
      statusCode: 409,
    });
  return names;
}
