import type pino from "pino";
import type { KeyPair } from "@getpaseo/relay/e2ee";
import type { ExternalSocketMetadata } from "./websocket-server.js";
import {
  startRelayTransport,
  type RelaySocketLike,
  type RelayTransportController,
} from "./relay-transport.js";

export interface RelayRuntimeConfig {
  enabled: boolean;
  endpoint: string;
  publicEndpoint: string;
  useTls: boolean;
  publicUseTls: boolean;
}

interface RelayRuntimeOptions {
  config: RelayRuntimeConfig;
  logger: pino.Logger;
  attachSocket(ws: RelaySocketLike, metadata?: ExternalSocketMetadata): Promise<void>;
  serverId: string;
  daemonKeyPair: KeyPair;
  startTransport?: typeof startRelayTransport;
}

export interface RelayRuntime {
  getConfig(): RelayRuntimeConfig;
  setEnabled(enabled: boolean): void;
  setConfig(config: RelayRuntimeConfig): void;
  stop(): Promise<void>;
}

function relayTransportChanged(previous: RelayRuntimeConfig, next: RelayRuntimeConfig): boolean {
  return previous.endpoint !== next.endpoint || previous.useTls !== next.useTls;
}

function relayConfigsEqual(left: RelayRuntimeConfig, right: RelayRuntimeConfig): boolean {
  return (
    left.enabled === right.enabled &&
    left.endpoint === right.endpoint &&
    left.publicEndpoint === right.publicEndpoint &&
    left.useTls === right.useTls &&
    left.publicUseTls === right.publicUseTls
  );
}

export function createRelayRuntime(options: RelayRuntimeOptions): RelayRuntime {
  const startTransport = options.startTransport ?? startRelayTransport;
  let config = options.config;
  let transport: RelayTransportController | null = null;

  function start(): void {
    if (transport) return;
    transport = startTransport({
      logger: options.logger,
      attachSocket: options.attachSocket,
      relayEndpoint: config.endpoint,
      relayUseTls: config.useTls,
      serverId: options.serverId,
      daemonKeyPair: options.daemonKeyPair,
    });
  }

  function stopTransport(): RelayTransportController | null {
    const current = transport;
    transport = null;
    return current;
  }

  function stopInBackground(current: RelayTransportController | null): void {
    void current?.stop().catch((error) => {
      options.logger.warn({ err: error }, "Failed to stop relay transport");
    });
  }

  function setConfig(next: RelayRuntimeConfig): void {
    if (relayConfigsEqual(config, next)) return;

    if (!next.enabled) {
      config = next;
      stopInBackground(stopTransport());
      return;
    }

    const needsNewTransport = !transport || relayTransportChanged(config, next);
    if (needsNewTransport) {
      const previous = stopTransport();
      stopInBackground(previous);
      const previousConfig = config;
      config = next;
      try {
        start();
      } catch (error) {
        config = { ...previousConfig, enabled: false };
        throw error;
      }
      return;
    }

    config = next;
  }

  function setEnabled(enabled: boolean): void {
    setConfig({ ...config, enabled });
  }

  async function stop(): Promise<void> {
    const current = stopTransport();
    await current?.stop();
  }

  if (config.enabled) start();

  return {
    getConfig: () => config,
    setEnabled,
    setConfig,
    stop,
  };
}
