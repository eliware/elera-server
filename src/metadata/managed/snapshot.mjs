import { identifier, literal } from "../../accounts/sql.mjs";

const tables = [
  "metadata",
  "applications",
  "managed_databases",
  "identities",
  "grants_policy",
  "scoped_tokens",
  "artifacts",
  "routing_assignments",
];
const value = (item) =>
  item === null || item === undefined
    ? "NULL"
    : typeof item === "object"
      ? literal(JSON.stringify(item))
      : literal(item);

export function createManagedMetadataSnapshot({ query, database = "elera_meta" }) {
  const schema = identifier(database);
  return {
    async exportMetadataSnapshot() {
      const data = {};
      for (const table of tables) {
        const [rows] = await query(`SELECT * FROM ${schema}.${identifier(table)}`);
        data[table] = rows;
      }
      return { format: 1, tables: data };
    },
    async restoreMetadataSnapshot(snapshot) {
      if (snapshot?.format !== 1 || !snapshot.tables)
        throw Object.assign(new Error("metadata snapshot is invalid"), { statusCode: 400 });
      for (const table of tables) {
        const rows = snapshot.tables[table];
        if (!Array.isArray(rows))
          throw Object.assign(new Error(`metadata snapshot omits ${table}`), { statusCode: 400 });
        await query(`DELETE FROM ${schema}.${identifier(table)}`);
        for (const row of rows) {
          const columns = Object.keys(row);
          if (!columns.length || columns.some((column) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)))
            throw Object.assign(new Error("metadata snapshot row is invalid"), { statusCode: 400 });
          await query(
            `INSERT INTO ${schema}.${identifier(table)} (${columns.map(identifier).join(",")}) VALUES (${columns.map((key) => value(row[key])).join(",")})`,
          );
        }
      }
      for (const database of snapshot.tables.managed_databases) {
        if (typeof database.physical_name !== "string")
          throw Object.assign(new Error("metadata snapshot database is invalid"), {
            statusCode: 400,
          });
        await query(`CREATE DATABASE IF NOT EXISTS ${identifier(database.physical_name)}`);
      }
      return { tables: tables.length, scopedTokens: snapshot.tables.scoped_tokens.length };
    },
  };
}
