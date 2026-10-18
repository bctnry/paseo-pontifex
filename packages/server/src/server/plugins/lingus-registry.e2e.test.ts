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
    expect(info.schemaVersion).toBe(2);
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

/**
 * The capability slice end to end: resource, allocation, operator, capability,
 * the token in a launch environment, and revocation. The launch environment is
 * read back from the provider client, which is the last place paseo itself
 * touches it before handing it to a provider, so this covers every hop in
 * between: RPC -> plugin process -> registry -> session-open hook -> launch.
 */
test("lingus-registry injects a live capability on session open and revokes it on archive", async () => {
  const launches: Array<Record<string, string> | undefined> = [];
  const base = createTestAgentClient("pi");
  const pi: typeof base = Object.create(base);
  pi.createSession = async (config, launchContext) => {
    launches.push(launchContext?.env);
    return base.createSession(config, launchContext);
  };
  pi.resumeSession = async (handle, overrides, launchContext) => {
    launches.push(launchContext?.env);
    return base.resumeSession(handle, overrides, launchContext);
  };

  const daemon = await createTestPaseoDaemon({
    daemonVersion: "0.12.0",
    pluginsEnabled: true,
    logger: pino({ level: "error" }),
    builtinPlugins: new BuiltinPluginLoader(undefined, ["lingus-registry"]),
    agentClients: { ...createTestAgentClients(), pi },
  });
  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.12.0",
  });
  const rpc = (name: string, input: unknown) =>
    client.invokePluginRpc("lingus-registry", name, input);
  try {
    await client.connect();

    const workspaceId = (
      await client.createWorkspace({ source: { kind: "directory", path: daemon.staticDir } })
    ).workspace?.id;
    if (!workspaceId) throw new Error("the test workspace was not created");

    const projectId = (
      (await rpc("project.create", { name: "fleet" })) as { project: { id: string } }
    ).project.id;
    await rpc("project.bind_workspace", { projectId, workspaceId });

    const resourceId = (
      (await rpc("resource.register", { name: "repo", kind: "write-authority" })) as {
        resource: { id: string };
      }
    ).resource.id;
    await rpc("resource.set_class", { id: resourceId, class: "work" });
    await rpc("project.add_member", { projectId, resourceId, allocation: { write: true } });

    const bound = (await rpc("operator.bind", {
      projectId,
      provider: "pi/test",
      role: "builder",
    })) as { created: boolean; operator: { id: string; agentSessionId: string } };
    expect(bound.created).toBe(true);
    const agentId = bound.operator.agentSessionId;

    // The session was opened before any capability existed, so its environment
    // has no Lingus variables yet: injection happens at open, not at issue.
    expect(launches).toHaveLength(1);
    expect(launches[0]?.PASEO_AGENT_ID).toBe(agentId);
    expect(launches[0]?.LINGUS_CAPABILITIES).toBeUndefined();

    const issued = (await rpc("capability.issue", {
      projectId,
      resourceId,
      subject: bound.operator.id,
      kind: "access",
      scope: { write: true },
    })) as { capability: { id: string; serial: string }; token: string };
    expect(issued.capability.id).toMatch(/^cap_[0-9a-f]{32}$/);
    expect(issued.capability.serial).toBe(issued.capability.id);

    const verified = (await rpc("capability.verify", {
      token: issued.token,
      presenter: bound.operator.id,
      resourceId,
      kind: "access",
    })) as { verification: { ok: boolean; subject: string | null } };
    expect(verified.verification.ok).toBe(true);
    expect(verified.verification.subject).toBe(bound.operator.id);

    // A scope the member's allocation does not cover is refused.
    await expect(
      rpc("capability.issue", {
        projectId,
        resourceId,
        subject: bound.operator.id,
        kind: "access",
        scope: { admin: true },
      }),
    ).rejects.toThrow();

    // Re-opening the session is what carries the token into the environment.
    await client.refreshAgent(agentId);
    expect(launches.length).toBeGreaterThan(1);
    const injected = launches[launches.length - 1]!;
    expect(JSON.parse(injected.LINGUS_CAPABILITIES ?? "null")).toEqual([issued.token]);
    expect(JSON.parse(injected.LINGUS_DESCRIPTOR ?? "{}").project.id).toBe(projectId);

    // Revoking empties the next injection and flips verification.
    await rpc("capability.revoke", { id: issued.capability.id });
    const denied = (await rpc("capability.verify", { token: issued.token })) as {
      verification: { ok: boolean; reason: string | null };
    };
    expect(denied.verification).toMatchObject({ ok: false, reason: "revoked" });

    await client.refreshAgent(agentId);
    const afterRevocation = launches[launches.length - 1]!;
    expect(JSON.parse(afterRevocation.LINGUS_CAPABILITIES ?? "null")).toEqual([]);

    // Archiving the session ends its operator; the already-revoked capability
    // keeps its first reason, and the refusal above was audited.
    await client.archiveAgent(agentId);
    await expect
      .poll(async () => {
        const operators = (await rpc("operator.list", { projectId })) as {
          operators: Array<{ status: string }>;
        };
        return operators.operators.map((operator) => operator.status);
      })
      .toEqual(["terminated"]);

    const events = (await rpc("events.list", { since: 0 })) as {
      events: Array<{ type: string; payload: Record<string, unknown> }>;
    };
    const revoked = events.events.filter((event) => event.type === "capability_revoked");
    expect(revoked).toHaveLength(1);
    expect(revoked[0]?.payload.reason).toBe("owner_revoked");
    const refusals = events.events.filter((event) => event.type === "capability_denied");
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.payload.reason).toBe("revoked");
  } finally {
    await client.close();
    await daemon.close();
  }
}, 120_000);
