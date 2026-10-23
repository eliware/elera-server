import { createIntentState } from "../intent/state.mjs";
import { createObservationStore } from "../cluster/observation-store.mjs";
import { createDurableObservationStore } from "../cluster/durable-observation-store.mjs";
import { createMetadataService } from "../metadata/service.mjs";
import { createManagedMetadata } from "../metadata/managed.mjs";
import { createApplicationService } from "../metadata/applications.mjs";
import { createMetadataReconciler } from "../metadata/reconcile.mjs";
import { createArtifactStore } from "../metadata/artifacts.mjs";
import { createManagedAccounts } from "../accounts/managed.mjs";
import { createTokenSqlAccounts } from "../accounts/token-sql-accounts.mjs";

export function createSupervisorComposition({
  environment = process.env,
  identity,
  log,
  query,
  optionalQuery = query,
} = {}) {
  if (typeof query !== "function" || typeof optionalQuery !== "function")
    throw new TypeError("metadata query dependencies are required");
  if (!identity?.name || !identity.name.includes("."))
    throw new TypeError("shared runtime identity must be a valid hostname");
  const intentState = createIntentState({
    stateDir:
      environment.ELERA_CONFIG_STATE_DIR ??
      `${environment.MARIADB_DATA_DIR ?? "/var/lib/mysql"}/elera-state`,
  });
  const memoryObservationStore = createObservationStore();
  const observationStore = environment.ELERA_OBSERVATION_STATE_PATH
    ? createDurableObservationStore({
        store: memoryObservationStore,
        statePath: environment.ELERA_OBSERVATION_STATE_PATH,
        log,
      })
    : memoryObservationStore;
  const metadata = createMetadataService({ query });
  const tokenAccounts = createTokenSqlAccounts({ query });
  const managed = createManagedMetadata({
    query,
    identity,
    tokenAccounts,
    credentialKey: environment.ELERA_CREDENTIAL_KEY,
  });
  const applications = createApplicationService({ query, tokenAccounts });
  const managedAccounts = createManagedAccounts({ query });
  const reconciler = createMetadataReconciler({ managed, accounts: managedAccounts });
  const artifactStore = createArtifactStore({ query: optionalQuery });
  return {
    intentState,
    observationStore,
    metadata,
    managed,
    applications,
    managedAccounts,
    tokenAccounts,
    reconciler,
    artifactStore,
  };
}
