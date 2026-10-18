export function mariaDbArguments(config, identity = config.runtimeIdentity) {
  const args = [
    ...(config.intentConfigPath ? [`--defaults-extra-file=${config.intentConfigPath}`] : []),
    `--datadir=${config.dataDir}`,
    "--user=mysql",
    "--bind-address=0.0.0.0",
    "--binlog-format=ROW",
  ];
  if (!config.elera) return args;
  const members = config.intent.cluster.members;
  if (!identity?.name) throw new Error("runtime identity is required for MariaDB arguments");
  const local = members.find((item) => item.name === identity.name);
  if (!local)
    throw new Error(`runtime hostname ${identity.name} is not a configured cluster member`);
  if (local.address !== local.name)
    throw new Error(`cluster member ${local.name} must use hostname -f as its address`);
  args.push(
    "--wsrep-provider-options=pc.recovery=TRUE",
    "--wsrep-on=ON",
    "--wsrep-provider=/usr/lib/galera/libgalera_smm.so",
    `--wsrep-cluster-name=${config.intent.cluster.name}`,
    `--wsrep-cluster-address=gcomm://${members.map((item) => item.address).join(",")}`,
    `--wsrep-node-name=${local.name}`,
    `--wsrep-node-address=${local.name}`,
  );
  return args;
}
