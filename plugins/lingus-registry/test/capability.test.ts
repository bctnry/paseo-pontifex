import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import type { CapabilityClaims, CapabilityKind } from "../shared/model.js";
import {
  canonicalize,
  DEFAULT_TTL_SEC,
  encodeToken,
  generateIssuerPem,
  loadIssuerKeys,
  resolveTtlSec,
  TOKEN_VERSION,
  verifyToken,
  type IssuerKeys,
} from "../server/capability.js";
import { getMeta, openRegistryDatabase, setMeta } from "../server/db.js";
import { Registry, RegistryError } from "../server/registry.js";

const roots: string[] = [];
const AT = 1_700_000_000_000;

afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function makeKeys(): IssuerKeys {
  return loadIssuerKeys(generateIssuerPem().privateKeyPem);
}

function makeRegistry(options: { hostId?: string; now?: () => number } = {}): Registry {
  const directory = mkdtempSync(path.join(os.tmpdir(), "lingus-capability-"));
  roots.push(directory);
  const db = openRegistryDatabase(path.join(directory, "registry.db"));
  const registry = new Registry(
    db,
    options.hostId ?? "srv_test",
    makeKeys(),
    options.now ?? Date.now,
  );
  registry.bootstrap();
  return registry;
}

function claims(keys: IssuerKeys, overrides: Partial<CapabilityClaims> = {}): CapabilityClaims {
  return {
    v: TOKEN_VERSION,
    id: "cap_test",
    serial: "cap_test",
    kid: keys.kid,
    issuer: "user:local",
    subject: "srv_test/operator",
    project: "srv_test/project",
    resource: "srv_test/repo",
    kind: "access",
    scope: { write: true },
    caveats: {},
    iat: AT,
    exp: AT + 60_000,
    ...overrides,
  };
}

/** A project with one work resource, an allocation, and a bound operator. */
function makeFixture(hostId = "srv_test") {
  const registry = makeRegistry({ hostId });
  const project = registry.createProject("demo");
  registry.bindWorkspace(project.id, "wks_1", hostId);
  const resource = registry.registerResource({
    name: "repo",
    kind: "write-authority",
    class: "work",
  });
  const allocation = { write: true, paths: { repo: ["src"] } };
  registry.addMember(project.id, resource.id, allocation);
  const operator = registry.bindOperator({
    projectId: project.id,
    role: "builder",
    agentSessionId: "agent-1",
  });
  return { registry, project, resource, operator };
}

describe("capability tokens", () => {
  test("sign, verify, and reject a payload signed by someone else", () => {
    const keys = makeKeys();
    const token = encodeToken(claims(keys), keys);
    const now = AT + 1000;

    const result = verifyToken(token, keys, { now, revoked: new Set() });
    expect(result.ok).toBe(true);
    expect(result.claims?.subject).toBe("srv_test/operator");

    // A different payload under the original signature must not verify.
    const foreign = encodeToken(claims(keys, { subject: "attacker" }), keys);
    const swapped = `${foreign.split(".")[0]}.${token.split(".")[1]}`;
    expect(verifyToken(swapped, keys, { now, revoked: new Set() }).reason).toBe("bad_signature");

    // A token signed by another issuer must not verify against this key.
    expect(verifyToken(token, makeKeys(), { now, revoked: new Set() }).reason).toBe(
      "bad_signature",
    );
  });

  test("refuse malformed, unsupported, and out-of-window tokens", () => {
    const keys = makeKeys();
    const token = encodeToken(claims(keys), keys);
    const options = { now: AT + 1000, revoked: new Set() };

    expect(verifyToken("not-a-token", keys, options).reason).toBe("malformed");
    expect(verifyToken(`${token.split(".")[0]}.`, keys, options).reason).toBe("malformed");

    const future = encodeToken(claims(keys, { v: TOKEN_VERSION + 1 }), keys);
    expect(verifyToken(future, keys, options).reason).toBe("unsupported_version");

    const expired = encodeToken(claims(keys, { exp: AT - 1 }), keys);
    expect(verifyToken(expired, keys, options).reason).toBe("expired");

    const early = encodeToken(claims(keys, { iat: AT + 5000, exp: null }), keys);
    expect(verifyToken(early, keys, options).reason).toBe("not_yet_valid");
  });

  test("fail closed on a high-sensitivity resource when revocation state is unreachable", () => {
    const keys = makeKeys();
    const token = encodeToken(claims(keys), keys);
    const now = AT + 1000;

    expect(verifyToken(token, keys, { now, revoked: null }).ok).toBe(true);
    expect(verifyToken(token, keys, { now, revoked: null, failClosed: true }).reason).toBe(
      "revocation_unavailable",
    );

    const revoked = new Set(["cap_test"]);
    expect(verifyToken(token, keys, { now, revoked: revoked, failClosed: true }).reason).toBe(
      "revoked",
    );
    // A different serial is not covered by that list entry.
    expect(verifyToken(token, keys, { now, revoked: new Set(["cap_other"]) }).ok).toBe(true);
  });

  test("check the expectations the verifier passed", () => {
    const keys = makeKeys();
    const token = encodeToken(claims(keys), keys);
    const base = { now: AT + 1000, revoked: new Set() };

    expect(verifyToken(token, keys, { ...base, presenter: "srv_test/other" }).reason).toBe(
      "subject_mismatch",
    );
    expect(verifyToken(token, keys, { ...base, resourceId: "srv_test/other" }).reason).toBe(
      "resource_mismatch",
    );
    expect(verifyToken(token, keys, { ...base, kind: "approval" }).reason).toBe("kind_mismatch");
    expect(verifyToken(token, keys, { ...base, presenter: "srv_test/operator" }).ok).toBe(true);
  });

  test("canonicalize is independent of key order, and TTLs follow kind then resource", () => {
    expect(canonicalize({ b: 1, a: { d: 1, c: 2 } })).toBe(
      canonicalize({ a: { c: 2, d: 1 }, b: 1 }),
    );
    expect(canonicalize({ a: 1, b: undefined })).toBe(canonicalize({ a: 1 }));

    expect(resolveTtlSec("access", undefined)).toBe(DEFAULT_TTL_SEC.access);
    expect(resolveTtlSec("approval", undefined)).toBe(DEFAULT_TTL_SEC.approval);
    // A resource override wins; nonsense falls back to the kind default.
    expect(resolveTtlSec("access", 45)).toBe(45);
    expect(resolveTtlSec("access", 0)).toBe(DEFAULT_TTL_SEC.access);
    expect(resolveTtlSec("access", "900")).toBe(DEFAULT_TTL_SEC.access);
  });
});

describe("capability issuance", () => {
  test("issue a capability that verifies, and refuse anything outside the allocation", () => {
    const { registry, project, resource, operator } = makeFixture();

    const inside = registry.issueCapability({
      projectId: project.id,
      resourceId: resource.id,
      subject: operator.id,
      kind: "access",
      scope: { paths: { repo: ["src"] } },
    });
    expect(inside.capability.id.startsWith("cap_")).toBe(true);
    expect(inside.capability.serial).toBe(inside.capability.id);
    expect(inside.capability.kid).toBe(registry.issuer.kid);

    const verified = registry.verifyCapability(inside.token, {
      presenter: operator.id,
      resourceId: resource.id,
      kind: "access",
    });
    expect(verified.ok).toBe(true);
    expect(verified.subject).toBe(operator.id);
    expect(verified.claims?.scope).toEqual({ paths: { repo: ["src"] } });

    // Wider than the allocation: an unknown key, a wrong nested value.
    expect(() =>
      registry.issueCapability({
        projectId: project.id,
        resourceId: resource.id,
        subject: operator.id,
        kind: "access",
        scope: { admin: true },
      }),
    ).toThrow(RegistryError);
    expect(() =>
      registry.issueCapability({
        projectId: project.id,
        resourceId: resource.id,
        subject: operator.id,
        kind: "access",
        scope: { paths: { repo: ["etc"] } },
      }),
    ).toThrow(RegistryError);

    // The resource must be a member of the project.
    const stranger = registry.registerResource({ name: "other", kind: "storage", class: "work" });
    expect(() =>
      registry.issueCapability({
        projectId: project.id,
        resourceId: stranger.id,
        subject: operator.id,
        kind: "access",
      }),
    ).toThrow(RegistryError);
  });

  test("resolve subjects: local operators must exist, foreign principals are accepted", () => {
    const { registry, project, resource, operator } = makeFixture();

    expect(() =>
      registry.issueCapability({
        projectId: project.id,
        resourceId: resource.id,
        subject: "srv_test/nobody",
        kind: "access",
      }),
    ).toThrow(RegistryError);
    expect(() =>
      registry.issueCapability({
        projectId: project.id,
        resourceId: resource.id,
        subject: "   ",
        kind: "access",
      }),
    ).toThrow(RegistryError);

    // D-B-2 leaves the cross-machine subject shape open.
    const peer = registry.issueCapability({
      projectId: project.id,
      resourceId: resource.id,
      subject: "peer:remote-host",
      kind: "access",
    });
    expect(peer.capability.subject).toBe("peer:remote-host");
    expect(
      registry.issueCapability({
        projectId: project.id,
        resourceId: resource.id,
        subject: operator.id,
        kind: "access",
      }).token,
    ).toBeTruthy();
  });

  test("refuse a serial that was already issued", () => {
    const { registry, project, resource, operator } = makeFixture();
    const first = {
      projectId: project.id,
      resourceId: resource.id,
      subject: operator.id,
      kind: "access",
    } as const;
    registry.issueCapability({ ...first, serial: "serial-1" });
    expect(() => registry.issueCapability({ ...first, serial: "serial-1" })).toThrow(RegistryError);
  });

  test("TTL defaults by kind and follows resources.attrs.ttlSec", () => {
    let now = AT;
    const registry = makeRegistry({ now: () => now });
    const project = registry.createProject("demo");
    registry.bindWorkspace(project.id, "wks_1", "srv_test");
    const plain = registry.registerResource({
      name: "plain",
      kind: "write-authority",
      class: "work",
    });
    const capped = registry.registerResource({
      name: "capped",
      kind: "write-authority",
      class: "work",
      attrs: { ttlSec: 45 },
    });
    const secret = registry.registerResource({
      name: "secret",
      kind: "external",
      class: "work",
      attrs: { sensitivity: "high" },
    });
    for (const resource of [plain, capped, secret]) registry.addMember(project.id, resource.id);
    const operator = registry.bindOperator({ projectId: project.id, agentSessionId: "agent-1" });

    const issue = (resourceId: string, kind: CapabilityKind, ttlSec?: number | null) =>
      registry.issueCapability({
        projectId: project.id,
        resourceId,
        subject: operator.id,
        kind,
        ...(ttlSec === undefined ? {} : { ttlSec }),
      }).capability;

    expect(issue(plain.id, "access").expiresAt).toBe(now + DEFAULT_TTL_SEC.access * 1000);
    expect(issue(plain.id, "approval").expiresAt).toBe(now + DEFAULT_TTL_SEC.approval * 1000);
    expect(issue(capped.id, "access").expiresAt).toBe(now + 45_000);
    expect(issue(plain.id, "access", 10).expiresAt).toBe(now + 10_000);
    expect(issue(plain.id, "access", null).expiresAt).toBe(null);

    // High-sensitivity resources deny when revocation state is out of reach.
    now += 1;
    const token = registry.issueCapability({
      projectId: project.id,
      resourceId: secret.id,
      subject: operator.id,
      kind: "approval",
    }).token;
    expect(
      verifyToken(token, registry.issuer, { now, revoked: null, failClosed: true }).reason,
    ).toBe("revocation_unavailable");
  });

  test("list capabilities by subject, project, and resource", () => {
    const { registry, project, resource, operator } = makeFixture();
    const other = registry.registerResource({ name: "notes", kind: "storage", class: "work" });
    registry.addMember(project.id, other.id);
    registry.issueCapability({
      projectId: project.id,
      resourceId: resource.id,
      subject: operator.id,
      kind: "access",
    });
    registry.issueCapability({
      projectId: project.id,
      resourceId: other.id,
      subject: operator.id,
      kind: "approval",
    });
    expect(registry.listCapabilities({ subject: operator.id })).toHaveLength(2);
    expect(registry.listCapabilities({ resourceId: resource.id })).toHaveLength(1);
    expect(registry.listCapabilities({ projectId: project.id })).toHaveLength(2);
    expect(registry.listCapabilities({ subject: "srv_test/nobody" })).toHaveLength(0);
  });
});

describe("capability revocation", () => {
  test("explicit revocation is idempotent and keeps the first reason", () => {
    const { registry, project, resource, operator } = makeFixture();
    const { capability, token } = registry.issueCapability({
      projectId: project.id,
      resourceId: resource.id,
      subject: operator.id,
      kind: "access",
    });

    const revoked = registry.revokeCapability(capability.id);
    expect(revoked.revokedAt).not.toBe(null);
    expect(revoked.revokedReason).toBe("owner_revoked");
    expect(registry.verifyCapability(token).reason).toBe("revoked");
    expect(registry.tokensForBinding(operator.id)).toHaveLength(0);

    const again = registry.revokeCapability(capability.id, "something_else");
    expect(again.revokedAt).toBe(revoked.revokedAt);
    expect(again.revokedReason).toBe("owner_revoked");
  });

  test("cascade revocations: class, status, operator, and membership", () => {
    const cases: Array<{
      reason: string;
      revoke: (fixture: ReturnType<typeof makeFixture>) => void;
    }> = [
      {
        reason: "class_private",
        revoke: ({ registry, resource }) => registry.setClass(resource.id, "private"),
      },
      {
        reason: "status_revoked",
        revoke: ({ registry, resource }) =>
          registry.updateResource(resource.id, { status: "revoked" }),
      },
      {
        reason: "operator_terminated",
        revoke: ({ registry, operator }) => registry.setOperatorStatus(operator.id, "terminated"),
      },
      {
        reason: "member_removed",
        revoke: ({ registry, project, resource }) => registry.removeMember(project.id, resource.id),
      },
    ];

    for (const item of cases) {
      const fixture = makeFixture();
      const { capability, token } = fixture.registry.issueCapability({
        projectId: fixture.project.id,
        resourceId: fixture.resource.id,
        subject: fixture.operator.id,
        kind: "access",
      });
      item.revoke(fixture);

      const after = fixture.registry.getCapability(capability.id);
      expect(after.revokedAt, item.reason).not.toBe(null);
      expect(after.revokedReason, item.reason).toBe(item.reason);
      expect(fixture.registry.verifyCapability(token).reason, item.reason).toBe("revoked");

      const audited = fixture.registry
        .listEvents(0)
        .filter((event) => event.type === "capability_revoked");
      expect(audited, item.reason).toHaveLength(1);
      expect(audited[0]?.payload.reason, item.reason).toBe(item.reason);
    }
  });

  test("injection hands out live tokens only, and expiry is one of the reasons", () => {
    let now = AT;
    const registry = makeRegistry({ now: () => now });
    const project = registry.createProject("demo");
    registry.bindWorkspace(project.id, "wks_1", "srv_test");
    const resource = registry.registerResource({
      name: "repo",
      kind: "write-authority",
      class: "work",
    });
    registry.addMember(project.id, resource.id);
    const operator = registry.bindOperator({ projectId: project.id, agentSessionId: "agent-1" });
    const issue = (ttlSec: number | null) =>
      registry.issueCapability({
        projectId: project.id,
        resourceId: resource.id,
        subject: operator.id,
        kind: "access",
        ttlSec,
      }).capability;

    const shortLived = issue(1);
    const durable = issue(null);
    const revoked = issue(null);
    registry.revokeCapability(revoked.id);

    expect(registry.tokensForBinding(operator.id)).toHaveLength(2);

    now += 5_000;
    const live = registry.tokensForBinding(operator.id);
    expect(live).toHaveLength(1);
    expect(
      verifyToken(live[0]!, registry.issuer, { now, revoked: registry.revokedSerials() }).claims
        ?.id,
    ).toBe(durable.id);
    expect(shortLived.expiresAt).toBe(AT + 1000);
  });

  test("archiving a session ends every binding of that session", () => {
    const { registry, project, resource, operator } = makeFixture();
    // A second binding of the same paseo session (D-P4 allows a back-fill).
    const second = registry.bindOperator({ projectId: project.id, agentSessionId: "agent-1" });
    expect(registry.findActiveOperatorByAgent("agent-1")?.id).toBe(second.id);

    const issued = [operator, second].map(
      (binding) =>
        registry.issueCapability({
          projectId: project.id,
          resourceId: resource.id,
          subject: binding.id,
          kind: "access",
        }).token,
    );

    const terminated = registry.terminateForAgent("agent-1");
    expect(terminated.map((binding) => binding.status)).toEqual(["terminated", "terminated"]);
    expect(registry.findActiveOperatorByAgent("agent-1")).toBe(null);
    for (const token of issued) expect(registry.verifyCapability(token).reason).toBe("revoked");

    // Idempotent: nothing is left to terminate, and the reason does not change.
    expect(registry.terminateForAgent("agent-1")).toHaveLength(0);
    expect(
      registry.listEvents(0).filter((event) => event.type === "capability_revoked"),
    ).toHaveLength(2);
  });

  test("audit refusals but not successes", () => {
    const { registry, project, resource, operator } = makeFixture();
    const { token } = registry.issueCapability({
      projectId: project.id,
      resourceId: resource.id,
      subject: operator.id,
      kind: "access",
    });
    const denied = () =>
      registry.listEvents(0).filter((event) => event.type === "capability_denied");

    const ok = registry.verifyCapability(token, { presenter: operator.id });
    expect(ok.ok).toBe(true);
    expect(denied()).toHaveLength(0);

    expect(registry.verifyCapability("garbage").reason).toBe("malformed");
    expect(registry.verifyCapability(token, { presenter: "srv_test/other" }).reason).toBe(
      "subject_mismatch",
    );
    const events = denied();
    expect(events).toHaveLength(2);
    expect(events[0]?.payload.reason).toBe("malformed");
    expect(events[1]?.payload.reason).toBe("subject_mismatch");
  });
});

describe("schema migration", () => {
  test("a v1 database gains the capability tables on open", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "lingus-migration-"));
    roots.push(directory);
    const file = path.join(directory, "registry.db");

    // Build a v1 database: the v2 tables dropped, the version rolled back.
    const v1 = openRegistryDatabase(file);
    v1.exec("DROP TABLE revocations");
    v1.exec("DROP TABLE capabilities");
    setMeta(v1, "schema_version", "1");
    v1.close();

    const upgraded = openRegistryDatabase(file);
    expect(getMeta(upgraded, "schema_version")).toBe("2");
    const registry = new Registry(upgraded, "srv_test", makeKeys());
    expect(registry.schemaVersion()).toBe(2);
    expect(registry.listCapabilities()).toHaveLength(0);
    upgraded.close();
  });

  test("refuse a database written by a newer schema", () => {
    const directory = mkdtempSync(path.join(os.tmpdir(), "lingus-newer-"));
    roots.push(directory);
    const file = path.join(directory, "registry.db");
    const db = openRegistryDatabase(file);
    setMeta(db, "schema_version", "99");
    db.close();

    expect(() => openRegistryDatabase(file)).toThrow(/newer than this plugin/);
  });
});
