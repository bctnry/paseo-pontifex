import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { openRegistryDatabase } from "../server/db.js";
import { Registry, RegistryError } from "../server/registry.js";

const roots: string[] = [];

function makeRegistry(hostId = "srv_test"): Registry {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lingus-registry-"));
  roots.push(directory);
  const db = openRegistryDatabase(path.join(directory, "registry.db"));
  const registry = new Registry(db, hostId);
  registry.bootstrap();
  return registry;
}

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe("registry resources", () => {
  test("bootstrap installs a private built-in registry resource, idempotently", () => {
    const registry = makeRegistry("srv_a");
    const builtin = registry.getResource("srv_a/registry");
    expect(builtin.kind).toBe("registry");
    expect(builtin.class).toBe("private");
    expect(builtin.locality).toBe("local");
    expect(builtin.builtin).toBe(true);

    // Re-running bootstrap must not duplicate or mutate it.
    registry.bootstrap();
    expect(registry.listResources({ includeBuiltin: true })).toHaveLength(1);
    expect(registry.listResources()).toHaveLength(0); // built-ins are hidden by default
  });

  test("registers resources private/local by default and rejects unknown kinds", () => {
    const registry = makeRegistry();
    const resource = registry.registerResource({ name: "notes", kind: "storage" });
    expect(resource.class).toBe("private");
    expect(resource.locality).toBe("local");
    expect(resource.id.startsWith("srv_test/")).toBe(true);

    expect(() => registry.registerResource({ name: "x", kind: "not-a-kind" })).toThrow(
      RegistryError,
    );
  });

  test("work->private emits a revocation and drops the resource from the projection", () => {
    const registry = makeRegistry();
    const project = registry.createProject("demo");
    registry.bindWorkspace(project.id, "wks_1", "srv_test");
    const resource = registry.registerResource({ name: "repo", kind: "write-authority" });

    registry.setClass(resource.id, "work");
    registry.addMember(project.id, resource.id);
    expect(registry.descriptor(project.id).members).toHaveLength(1);

    const before = registry.listEvents(0);
    registry.setClass(resource.id, "private");
    const descriptor = registry.descriptor(project.id);
    expect(descriptor.members).toHaveLength(0); // I6

    const revocations = registry.listEvents(0).filter((event) => event.type === "revocation");
    expect(revocations).toHaveLength(1);
    expect(revocations[0]?.subject).toBe(resource.id);
    expect(revocations[0]?.payload.reason).toBe("class_private");
    expect(registry.listEvents(0).length).toBeGreaterThan(before.length);

    // The revocation surfaces in the broadcast too.
    const broadcast = registry.broadcast(0);
    expect(
      broadcast.some((entry) => entry.type === "revocation" && entry.resourceId === resource.id),
    ).toBe(true);
  });

  test("descriptor models local state and leaves remote members unmodelled", () => {
    const registry = makeRegistry();
    const project = registry.createProject("mixed");
    const local = registry.registerResource({ name: "dataset", kind: "storage", class: "work" });
    const remote = registry.registerResource({
      name: "saas",
      kind: "external",
      class: "work",
      locality: "remote",
    });
    registry.addMember(project.id, local.id);
    registry.addMember(project.id, remote.id);

    const descriptor = registry.descriptor(project.id);
    expect(descriptor.project.sequencer).toBe("srv_test");
    expect(descriptor.members.map((member) => member.resource.id).sort()).toEqual(
      [local.id, remote.id].sort(),
    );
    expect(descriptor.state.members.find((m) => m.resourceId === local.id)?.modeled).toBe(true);
    expect(descriptor.state.members.find((m) => m.resourceId === remote.id)?.modeled).toBe(false);
  });
});

describe("operator bindings", () => {
  test("require a bound paseo workspace (invariant I11)", () => {
    const registry = makeRegistry();
    const project = registry.createProject("guarded");
    expect(() => registry.bindOperator({ projectId: project.id })).toThrow(RegistryError);

    registry.bindWorkspace(project.id, "wks_42", "srv_test", "primary");
    const operator = registry.bindOperator({
      projectId: project.id,
      role: "builder",
      agentSessionId: "agent-1",
      workspaceId: "wks_42",
    });
    expect(operator.status).toBe("active");
    expect(operator.agentSessionId).toBe("agent-1");
    expect(registry.listOperators(project.id)).toHaveLength(1);

    const suspended = registry.setOperatorStatus(operator.id, "suspended");
    expect(suspended.status).toBe("suspended");
  });

  test("resolve the session workspace and refuse to guess between several", () => {
    const registry = makeRegistry();
    const project = registry.createProject("venues");
    expect(() => registry.resolveOperatorWorkspace(project.id)).toThrow(RegistryError);

    registry.bindWorkspace(project.id, "wks_a", "srv_test");
    expect(registry.resolveOperatorWorkspace(project.id)).toBe("wks_a");
    expect(registry.resolveOperatorWorkspace(project.id, "wks_a")).toBe("wks_a");
    expect(() => registry.resolveOperatorWorkspace(project.id, "wks_other")).toThrow(RegistryError);

    registry.bindWorkspace(project.id, "wks_b", "srv_test");
    expect(() => registry.resolveOperatorWorkspace(project.id)).toThrow(RegistryError);
    expect(registry.resolveOperatorWorkspace(project.id, "wks_b")).toBe("wks_b");
  });

  test("index the operator's paseo session once, idempotently (D-P4)", () => {
    const registry = makeRegistry();
    const project = registry.createProject("bound");
    registry.bindWorkspace(project.id, "wks_42", "srv_test");

    const operator = registry.bindOperator({
      projectId: project.id,
      agentSessionId: "agent-1",
      provider: "pi",
      label: "builder",
      created: true,
    });
    expect(operator.agentSessionId).toBe("agent-1");
    expect(operator.workspaceId).toBe("wks_42");

    const sessions = registry.listSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.agentSessionId).toBe("agent-1");

    // A second binding of the same session keeps one session row.
    registry.bindOperator({ projectId: project.id, agentSessionId: "agent-1" });
    expect(registry.listSessions()).toHaveLength(1);
    expect(registry.listOperators(project.id)).toHaveLength(2);

    // An operator without a session still records the resolved workspace.
    const unattended = registry.bindOperator({ projectId: project.id });
    expect(unattended.agentSessionId).toBeNull();
    expect(unattended.workspaceId).toBe("wks_42");
    expect(registry.listSessions()).toHaveLength(1);
  });
});

describe("audit events", () => {
  test("project rename and workspace binding mutations append events", () => {
    const registry = makeRegistry();
    const project = registry.createProject("before");
    registry.renameProject(project.id, "after");
    registry.bindWorkspace(project.id, "wks_1", "srv_test", "primary");
    registry.unbindWorkspace(project.id, "wks_1");

    const events = registry.listEvents(0);
    const renamed = events.find((event) => event.type === "project_renamed");
    expect(renamed?.subject).toBe(project.id);
    expect(renamed?.payload).toEqual({ from: "before", to: "after" });

    const bound = events.find((event) => event.type === "workspace_bound");
    expect(bound?.subject).toBe(project.id);
    expect(bound?.payload).toEqual({
      workspace_id: "wks_1",
      daemon_id: "srv_test",
      role: "primary",
    });

    const unbound = events.find((event) => event.type === "workspace_unbound");
    expect(unbound?.subject).toBe(project.id);
    expect(unbound?.payload).toEqual({ workspace_id: "wks_1" });
  });
});

describe("shares and broadcast", () => {
  test("only shared projects appear in the broadcast", () => {
    const registry = makeRegistry();
    const shared = registry.createProject("shared");
    registry.createProject("private");
    registry.addShare(shared.id, "fleet:peer", "collaborator");

    const broadcast = registry.broadcast(0);
    const projectEntries = broadcast.filter((entry) => entry.type === "project");
    expect(projectEntries).toHaveLength(1);
    expect(
      projectEntries[0]?.type === "project" ? projectEntries[0].project.project.id : null,
    ).toBe(shared.id);
  });
});
