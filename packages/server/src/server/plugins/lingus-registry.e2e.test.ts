import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import pino from "pino";
import { expect, test } from "vitest";
import { BuiltinPluginLoader } from "./builtin/index.js";
import { DaemonClient } from "../test-utils/daemon-client.js";
import { createTestAgentClient, createTestAgentClients } from "../test-utils/fake-agent-client.js";
import { createTestPaseoDaemon } from "../test-utils/paseo-daemon.js";

test("lingus-registry runs as a built-in and answers RPC against its SQLite database", async () => {
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.12.0",
    pluginsEnabled: true,
    logger: pino({ level: "error" }),
    builtinPlugins: new BuiltinPluginLoader(undefined, ["lingus-registry"]),
  });
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.12.0",
  });
  try {
    await client.connect();

    const info = (await client.invokePluginRpc("lingus-registry", "registry.info", {})) as {
      hostId: string;
      schemaVersion: number;
      builtinResourceId: string;
      dataDirectory: string;
    };
    const serverId = readFileSync(path.join(daemon.paseoHome, "server-id"), "utf8").trim();
    expect(info.schemaVersion).toBe(1);
    expect(info.hostId).toBe(serverId);
    expect(info.builtinResourceId).toBe(`${serverId}/registry`);
    expect(info.dataDirectory).toBe(path.join(daemon.paseoHome, "plugin-data", "lingus-registry"));
    expect(existsSync(path.join(info.dataDirectory, "registry.db"))).toBe(true);

    const created = (await client.invokePluginRpc("lingus-registry", "resource.register", {
      name: "vertical-check",
      kind: "service",
    })) as { resource: { id: string; class: string } };
    expect(created.resource.class).toBe("private");
    expect(created.resource.id.startsWith(`${serverId}/`)).toBe(true);

    const listed = (await client.invokePluginRpc("lingus-registry", "resource.list", {
      includeBuiltin: true,
    })) as { resources: Array<{ name: string }> };
    expect(listed.resources.some((r) => r.name === "vertical-check")).toBe(true);
  } finally {
    await client.close();
    await daemon.close();
  }
}, 120_000);

test("lingus-registry creates operator sessions through its paseo API and back-fills existing ones", async () => {
  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.12.0",
    pluginsEnabled: true,
    logger: pino({ level: "error" }),
    builtinPlugins: new BuiltinPluginLoader(undefined, ["lingus-registry"]),
    agentClients: { ...createTestAgentClients(), pi: createTestAgentClient("pi") },
  });
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.12.0",
  });
  try {
    await client.connect();

    const workspaceId = (
      await client.createWorkspace({ source: { kind: "directory", path: daemon.staticDir } })
    ).workspace?.id;
    if (!workspaceId) throw new Error("the test workspace was not created");

    const providers = (await client.invokePluginRpc("lingus-registry", "provider.list", {})) as {
      providers: Array<{ id: string; available: boolean }>;
    };
    expect(providers.providers.map((provider) => provider.id)).toContain("pi");

    const project = (await client.invokePluginRpc("lingus-registry", "project.create", {
      name: "fleet",
    })) as { project: { id: string } };
    await client.invokePluginRpc("lingus-registry", "project.bind_workspace", {
      projectId: project.project.id,
      workspaceId,
    });

    // D-P4: the plugin creates the operator's paseo agent session itself.
    const bound = (await client.invokePluginRpc("lingus-registry", "operator.bind", {
      projectId: project.project.id,
      role: "builder",
      provider: "pi/test",
    })) as {
      created: boolean;
      operator: { agentSessionId: string | null; workspaceId: string | null };
    };
    expect(bound.created).toBe(true);
    expect(bound.operator.agentSessionId).toMatch(/^[0-9a-f-]{36}$/);
    expect(bound.operator.workspaceId).toBe(workspaceId);

    const sessions = (await client.invokePluginRpc("lingus-registry", "session.list", {})) as {
      sessions: Array<{ agentSessionId: string }>;
    };
    expect(sessions.sessions.map((session) => session.agentSessionId)).toEqual([
      bound.operator.agentSessionId,
    ]);

    // Back-fill binds the existing session to a second project and creates nothing.
    const other = (await client.invokePluginRpc("lingus-registry", "project.create", {
      name: "shadow",
    })) as { project: { id: string } };
    await client.invokePluginRpc("lingus-registry", "project.bind_workspace", {
      projectId: other.project.id,
      workspaceId,
    });
    const backfilled = (await client.invokePluginRpc("lingus-registry", "operator.bind", {
      projectId: other.project.id,
      agentSessionId: bound.operator.agentSessionId,
    })) as { created: boolean; operator: { agentSessionId: string | null } };
    expect(backfilled.created).toBe(false);
    expect(backfilled.operator.agentSessionId).toBe(bound.operator.agentSessionId);
    const afterBackfill = (await client.invokePluginRpc("lingus-registry", "session.list", {})) as {
      sessions: unknown[];
    };
    expect(afterBackfill.sessions).toHaveLength(1);

    // An unknown session id is rejected rather than recorded.
    await expect(
      client.invokePluginRpc("lingus-registry", "operator.bind", {
        projectId: other.project.id,
        agentSessionId: "00000000-0000-4000-8000-000000000000",
      }),
    ).rejects.toThrow();
    const afterReject = (await client.invokePluginRpc("lingus-registry", "session.list", {})) as {
      sessions: unknown[];
    };
    expect(afterReject.sessions).toHaveLength(1);
  } finally {
    await client.close();
    await daemon.close();
  }
}, 120_000);
