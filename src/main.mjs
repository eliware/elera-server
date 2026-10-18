#!/usr/bin/env node
import { log } from "@eliware/common";
import { loadIntent } from "./intent/model.mjs";
import { createSupervisorApplicationContext } from "./runtime/application-context.mjs";
import { createSupervisorRecoveryJoiner } from "./runtime/recovery/join/wiring.mjs";
import { startSupervisor } from "./runtime/startup/coordinator.mjs";

export async function main({
  environment = process.env,
  logger = log,
  createContext = createSupervisorApplicationContext,
  createJoiner = createSupervisorRecoveryJoiner,
  start = startSupervisor,
  exit = process.exit,
} = {}) {
  const context = createContext({ environment, log: logger });
  const { identity, config, dbEnv, state, restartMarker, composition } = context;
  const { intentState, observationStore, routingEnvironment, sharedRoutingAssignments } =
    composition;
  const recoverJoiners = createJoiner({
    identity,
    token: environment.ELERA_PEER_TOKEN ?? environment.ROOT_TOKEN,
    timeoutMs: config.startupTimeoutMs,
    httpPort: config.httpPort,
    recoveryState: context.recoveryState,
    recoveryAudit: context.recoveryAudit,
    publishRecovery: composition.traffic.recover,
    log: logger,
  });
  try {
    await start({
      config,
      identity,
      log: logger,
      loadEnvironmentIntent: loadIntent,
      intentState,
      routingEnvironment,
      recoveryState: context.recoveryState,
      recoveryAudit: context.recoveryAudit,
      health: composition.health,
      environment,
      dbEnv,
      probes: composition.probes,
      routingEvent: composition.routingEvent,
      routingBus: composition.routingBus,
      sharedRoutingAssignments,
      observationStore,
      getDrained: composition.traffic.getDrained,
      recoverTraffic: composition.traffic.recover,
      cleanRestartIntent: restartMarker,
      telemetry: context.telemetry,
      state,
      recoverJoiners,
    });
  } catch (error) {
    logger.error("Supervisor startup failed", { error });
    await state.signals?.shutdown?.("startup-failure");
    exit(1);
  }
}
