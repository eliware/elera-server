import { expect, test } from "@jest/globals";
import { mariaDbArguments } from "../../src/config/mariadb-arguments.mjs";

test("builds non-cluster MariaDB arguments", () => {
  expect(mariaDbArguments({ dataDir: "/data", elera: false })).toEqual([
    "--datadir=/data",
    "--user=mysql",
    "--bind-address=0.0.0.0",
    "--binlog-format=ROW",
  ]);
});
