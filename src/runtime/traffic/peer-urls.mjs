export const isTrafficFqdn = (value) =>
  typeof value === "string" &&
  value.length <= 253 &&
  value.includes(".") &&
  /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(value);

export function createTrafficPeerUrls(members, nodeName, httpPort) {
  return members
    .filter((member) => member.name !== nodeName)
    .map((member) => {
      if (!isTrafficFqdn(member.name) || !isTrafficFqdn(member.address))
        throw new TypeError("traffic peers must use FQDN identities and addresses");
      const url = member.url ?? `http://${member.address}:${httpPort}`;
      if (new URL(url).hostname !== member.address)
        throw new Error(`traffic peer URL ${url} does not match ${member.address}`);
      return url;
    });
}
