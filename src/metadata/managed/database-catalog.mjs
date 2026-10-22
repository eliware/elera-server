import { generate as generateSnowflake } from "@eliware/common";
import { identifier, literal } from "../../accounts/sql.mjs";
import { validName } from "./validation.mjs";

export function createManagedDatabaseCatalog({ query, q }) {
  const deleteOperations = new Map();
  return {
    async createDatabase({ application, databaseName }) {
      validName(application, "application");
      validName(databaseName, "database");
      const [existing] = await q(
        `SELECT database_id, physical_name FROM elera_meta.managed_databases WHERE name=${literal(databaseName)} AND application_name=${literal(application)}`,
      );
      const databaseId = existing[0]?.database_id ?? String(generateSnowflake());
      const physicalName = existing[0]?.physical_name ?? `elera_db_${databaseId}`;
      const applicationId = String(generateSnowflake());
      await q(
        `INSERT INTO elera_meta.applications (application_id, name) VALUES (${literal(applicationId)}, ${literal(application)}) ON DUPLICATE KEY UPDATE name=name`,
      );
      await q(
        `INSERT INTO elera_meta.managed_databases (database_id, name, physical_name, application_name) VALUES (${literal(databaseId)}, ${literal(databaseName)}, ${literal(physicalName)}, ${literal(application)}) ON DUPLICATE KEY UPDATE application_name=VALUES(application_name), physical_name=VALUES(physical_name)`,
      );
      await query(`CREATE DATABASE IF NOT EXISTS ${identifier(physicalName)}`);
      return { databaseId, application, database: databaseName, physicalName };
    },
    async listDatabases() {
      const [rows] = await q(
        "SELECT database_id, name, application_name AS application, created_at FROM elera_meta.managed_databases ORDER BY name",
      );
      return rows;
    },
    async deleteDatabase({ databaseId, dryRun = false, confirm = false, idempotencyKey } = {}) {
      if (typeof databaseId !== "string" || !databaseId)
        throw Object.assign(new Error("databaseId is required"), { statusCode: 400 });
      if (idempotencyKey && deleteOperations.has(idempotencyKey))
        return deleteOperations.get(idempotencyKey);
      const [rows] = await q(
        `SELECT database_id, name, physical_name, application_name AS application FROM elera_meta.managed_databases WHERE database_id=${literal(databaseId)}`,
      );
      const database = rows[0];
      if (!database) throw Object.assign(new Error("database not found"), { statusCode: 404 });
      const result = {
        databaseId,
        application: database.application,
        database: database.name,
        changed: !dryRun && confirm,
        status: dryRun ? "planned" : confirm ? "completed" : "rejected",
      };
      if (!dryRun && !confirm)
        throw Object.assign(new Error("database deletion requires confirm: true"), {
          statusCode: 409,
        });
      if (!dryRun) {
        await query(`DROP DATABASE IF EXISTS ${identifier(database.physical_name)}`);
        await q(
          `DELETE FROM elera_meta.managed_databases WHERE database_id=${literal(databaseId)}`,
        );
      }
      if (idempotencyKey) deleteOperations.set(idempotencyKey, result);
      return result;
    },
  };
}
