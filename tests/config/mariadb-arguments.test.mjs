import { expect, test } from "@jest/globals";
import { mariaDbArguments } from "../../src/config/mariadb-arguments.mjs";

test("builds non-cluster MariaDB arguments", () => {
  expect(mariaDbArguments({ dataDir: "/data", elera: false })).toEqual([
    "--datadir=/data",
    "--user=mysql",
    "--bind-address=0.0.0.0",
    "--binlog-format=ROW",
  ]);
  expect(
    mariaDbArguments({ dataDir: "/data", elera: false, intentConfigPath: "/etc/maria.cnf" })[0],
  ).toBe("--defaults-extra-file=/etc/maria.cnf");
});

test("builds Galera arguments from the runtime member identity", () => {
  const config = {
    dataDir: "/data",
    elera: true,
    intentConfigPath: "/etc/maria.cnf",
    runtimeIdentity: { name: "db2.example.test" },
    intent: {
      cluster: {
        name: "payments",
        members: [
          { name: "db1.example.test", address: "db1.example.test" },
          { name: "db2.example.test", address: "db2.example.test" },
        ],
      },
    },
  };
  expect(mariaDbArguments(config)).toEqual(
    expect.arrayContaining([
      "--wsrep-cluster-name=payments",
      "--wsrep-cluster-address=gcomm://db1.example.test,db2.example.test",
      "--wsrep-node-name=db2.example.test",
      "--wsrep-node-address=db2.example.test",
    ]),
  );
});

test("rejects missing or invalid runtime members", () => {
  const config = {
    dataDir: "/data",
    elera: true,
    runtimeIdentity: { name: "missing.example.test" },
    intent: {
      cluster: {
        name: "payments",
        members: [{ name: "db1.example.test", address: "db1.example.test" }],
      },
    },
  };
  expect(() => mariaDbArguments(config, null)).toThrow("runtime identity is required");
  expect(() => mariaDbArguments(config)).toThrow("not a configured cluster member");
  expect(() =>
    mariaDbArguments(
      {
        ...config,
        runtimeIdentity: { name: "db1.example.test" },
        intent: {
          cluster: {
            ...config.intent.cluster,
            members: [{ name: "db1.example.test", address: "10.0.0.1" }],
          },
        },
      },
      { name: "db1.example.test" },
    ),
  ).toThrow("hostname -f as its address");
});
