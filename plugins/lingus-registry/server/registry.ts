// Registry business logic, ported from the Track A Go service + store onto
// Node's synchronous `node:sqlite`. The invariants referenced as I1..I11 are the
// ones in the registry design note (`registry-plugin-2026-10-18.md`, section 8).
import type { DatabaseSync } from "node:sqlite";
import {
  EVENTS,
  isHighSensitivity,
  isScopeWithinAllocation,
  KIND_REGISTRY,
  REVOCATION_REASONS,
  RESOURCE_KINDS,
  type BroadcastEntry,
  type Capability,
  type CapabilityClaims,
  type CapabilityKind,
  type CapabilityVerification,
  type Descriptor,
  type JsonObject,
  type OperatorBinding,
  type OperatorStatus,
  type ProjectMember,
  type ProjectShare,
  type ProjectWorkspace,
  type RegistryEvent,
  type RegistryProject,
  type Resource,
  type ResourceClass,
  type ResourceStatus,
  type SessionRef,
} from "../shared/model.js";
import {
  decodeToken,
  encodeToken,
  resolveTtlSec,
  TOKEN_VERSION,
  verifyToken,
  type IssuerKeys,
} from "./capability.js";
import { getMeta, SCHEMA_VERSION, setMeta } from "./db.js";
import { compose, hostOf, newCapabilityId, newLocalId } from "./ids.js";

export class RegistryError extends Error {
  constructor(
    readonly code: "invalid" | "not_found",
    message: string,
  ) {
    super(message);
    this.name = "RegistryError";
  }
}

const invalid = (message: string) => new RegistryError("invalid", message);
const notFound = (message: string) => new RegistryError("not_found", message);

const LOCAL_OWNER = "user:local";
const KIND_SET = new Set<string>(RESOURCE_KINDS);

interface ResourceRow {
  id: string;
  name: string;
  kind: string;
  locality: string;
  class: string;
  status: string;
  owner: string;
  attrs: string;
  provenance: string;
  builtin: number;
  created_at: number;
  updated_at: number;
}

interface ProjectRow {
  id: string;
  name: string;
  owner: string;
  sequencer: string;
  epoch: number;
  created_at: number;
  updated_at: number;
}

interface SessionRow {
  id: string;
  agent_session_id: string;
  daemon_id: string;
  provider: string | null;
  label: string | null;
  created_at: number;
}

interface EventRow {
  seq: number;
  ts: number;
  type: string;
  subject: string | null;
  payload: string;
}

interface OperatorRow {
  id: string;
  project_id: string;
  agent_session_id: string | null;
  workspace_id: string | null;
  role: string | null;
  status: string;
  created_at: number;
}

interface CapabilityRow {
  id: string;
  serial: string;
  kid: string;
  issuer: string;
  subject: string;
  project_id: string | null;
  resource_id: string;
  kind: string;
  scope: string;
  caveats: string;
  issued_at: number;
  expires_at: number | null;
  token: string;
  /** From the revocation list, which is the only place revocations live. */
  revoked_at: number | null;
  revoked_reason: string | null;
}

const RESOURCE_COLS =
  "id,name,kind,locality,class,status,owner,attrs,provenance,builtin,created_at,updated_at";
const PROJECT_COLS = "id,name,owner,sequencer,epoch,created_at,updated_at";
const OPERATOR_COLS = "id,project_id,agent_session_id,workspace_id,role,status,created_at";
const CAPABILITY_COLS =
  "c.id,c.serial,c.kid,c.issuer,c.subject,c.project_id,c.resource_id,c.kind,c.scope,c.caveats,c.issued_at,c.expires_at,c.token,r.at AS revoked_at,r.reason AS revoked_reason";

function parseJson(raw: string | null): JsonObject {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as JsonObject;
    }
    return {};
  } catch {
    return {};
  }
}

function mustJson(value: JsonObject | undefined): string {
  if (!value) return "{}";
  try {
    return JSON.stringify(value);
  } catch {
    return "{}";
  }
}

function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    locality: row.locality as Resource["locality"],
    class: row.class as ResourceClass,
    status: row.status as ResourceStatus,
    owner: row.owner,
    attrs: parseJson(row.attrs),
    provenance: parseJson(row.provenance),
    builtin: row.builtin !== 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toProject(row: ProjectRow): RegistryProject {
  return {
    id: row.id,
    name: row.name,
    owner: row.owner,
    sequencer: row.sequencer,
    epoch: row.epoch,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSessionRef(row: SessionRow): SessionRef {
  return {
    id: row.id,
    agentSessionId: row.agent_session_id,
    daemonId: row.daemon_id,
    provider: row.provider,
    label: row.label,
    createdAt: row.created_at,
  };
}

function toOperator(row: OperatorRow): OperatorBinding {
  return {
    id: row.id,
    projectId: row.project_id,
    agentSessionId: row.agent_session_id,
    workspaceId: row.workspace_id,
    role: row.role,
    status: row.status as OperatorStatus,
    createdAt: row.created_at,
  };
}

function toCapability(row: CapabilityRow): Capability {
  return {
    id: row.id,
    serial: row.serial,
    kid: row.kid,
    issuer: row.issuer,
    subject: row.subject,
    projectId: row.project_id,
    resourceId: row.resource_id,
    kind: row.kind as CapabilityKind,
    scope: parseJson(row.scope),
    caveats: parseJson(row.caveats),
    issuedAt: row.issued_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    revokedReason: row.revoked_reason,
  };
}

export interface ResourceFilter {
  class?: ResourceClass;
  locality?: Resource["locality"];
  kind?: string;
  includeBuiltin?: boolean;
}

export interface RegisterResourceInput {
  name: string;
  kind: string;
  locality?: Resource["locality"];
  class?: ResourceClass;
  attrs?: JsonObject;
  provenance?: JsonObject;
}

export interface UpdateResourceInput {
  name?: string;
  attrs?: JsonObject;
  status?: ResourceStatus;
}

export interface IssueCapabilityInput {
  projectId: string;
  resourceId: string;
  subject: string;
  kind: CapabilityKind;
  /** Narrower than the project member's allocation, or the issue is refused. */
  scope?: JsonObject;
  caveats?: JsonObject;
  /** Seconds of validity; null means no expiry, relying on the revocation list. */
  ttlSec?: number | null;
  /** Revocation key; defaults to the capability id. */
  serial?: string;
}

export interface CapabilityFilter {
  subject?: string;
  projectId?: string;
  resourceId?: string;
}

/** What a verifier expects to find on the token it was handed. */
export interface CapabilityExpectation {
  presenter?: string;
  resourceId?: string;
  kind?: string;
}

/**
 * The registry. Every public method is synchronous (as `node:sqlite` is) and
 * safe to call from RPC handlers. Mutations that write an audit event do so in
 * the same transaction as the change.
 */
export class Registry {
  constructor(
    private readonly db: DatabaseSync,
    readonly hostId: string,
    /** Signing key pair; the issuer identity is this host's owner. */
    readonly issuer: IssuerKeys,
    private readonly now: () => number = Date.now,
  ) {}

  close(): void {
    this.db.close();
  }

  private tx<T>(fn: () => T): T {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      const out = fn();
      this.db.exec("COMMIT");
      return out;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // The transaction may already be unwound; surface the original error.
      }
      throw error;
    }
  }

  private appendEvent(type: string, subject: string, payload: JsonObject, at: number): void {
    this.db
      .prepare("INSERT INTO events(ts,type,subject,payload) VALUES(?,?,?,?)")
      .run(at, type, subject, mustJson(payload));
  }

  private resourceRow(id: string): ResourceRow | undefined {
    return this.db.prepare(`SELECT ${RESOURCE_COLS} FROM resources WHERE id=?`).get(id) as
      | ResourceRow
      | undefined;
  }

  private requireResourceRow(id: string): ResourceRow {
    const row = this.resourceRow(id);
    if (!row) throw notFound(`resource not found: ${id}`);
    return row;
  }

  private projectRow(id: string): ProjectRow | undefined {
    return this.db.prepare(`SELECT ${PROJECT_COLS} FROM projects WHERE id=?`).get(id) as
      | ProjectRow
      | undefined;
  }

  private requireProjectRow(id: string): ProjectRow {
    const row = this.projectRow(id);
    if (!row) throw notFound(`project not found: ${id}`);
    return row;
  }

  /** Idempotent: records the host id and ensures the built-in registry resource. */
  bootstrap(): void {
    if (getMeta(this.db, "host_id") === "") setMeta(this.db, "host_id", this.hostId);
    const registryId = compose(this.hostId, KIND_REGISTRY);
    if (this.resourceRow(registryId)) return;
    const at = this.now();
    this.tx(() => {
      this.db
        .prepare(`INSERT INTO resources(${RESOURCE_COLS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          registryId,
          "local registry",
          KIND_REGISTRY,
          "local",
          "private",
          "registered",
          LOCAL_OWNER,
          "{}",
          "{}",
          1,
          at,
          at,
        );
      this.appendEvent(
        EVENTS.resourceRegistered,
        registryId,
        { name: "local registry", kind: KIND_REGISTRY, locality: "local", class: "private" },
        at,
      );
    });
  }

  schemaVersion(): number {
    return Number(getMeta(this.db, "schema_version") || SCHEMA_VERSION);
  }

  builtinResourceId(): string {
    return compose(this.hostId, KIND_REGISTRY);
  }

  // --- resources -----------------------------------------------------------

  registerResource(input: RegisterResourceInput): Resource {
    const locality = input.locality ?? "local";
    const resourceClass = input.class ?? "private";
    const name = input.name.trim();
    if (name === "") throw invalid("name is required");
    if (!KIND_SET.has(input.kind)) throw invalid(`invalid kind "${input.kind}"`);

    const at = this.now();
    const resource: Resource = {
      id: compose(this.hostId, newLocalId()),
      name,
      kind: input.kind,
      locality,
      class: resourceClass,
      status: "registered",
      owner: LOCAL_OWNER,
      attrs: input.attrs ?? {},
      provenance: input.provenance ?? {},
      builtin: false,
      createdAt: at,
      updatedAt: at,
    };
    this.tx(() => {
      this.db
        .prepare(`INSERT INTO resources(${RESOURCE_COLS}) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`)
        .run(
          resource.id,
          resource.name,
          resource.kind,
          resource.locality,
          resource.class,
          resource.status,
          resource.owner,
          mustJson(resource.attrs),
          mustJson(resource.provenance),
          0,
          resource.createdAt,
          resource.updatedAt,
        );
      this.appendEvent(
        EVENTS.resourceRegistered,
        resource.id,
        {
          name: resource.name,
          kind: resource.kind,
          locality: resource.locality,
          class: resource.class,
        },
        at,
      );
    });
    return resource;
  }

  getResource(id: string): Resource {
    return toResource(this.requireResourceRow(id));
  }

  listResources(filter: ResourceFilter = {}): Resource[] {
    const where: string[] = [];
    const args: Array<string | number> = [];
    if (filter.class) {
      where.push("class=?");
      args.push(filter.class);
    }
    if (filter.locality) {
      where.push("locality=?");
      args.push(filter.locality);
    }
    if (filter.kind) {
      where.push("kind=?");
      args.push(filter.kind);
    }
    if (!filter.includeBuiltin) where.push("builtin=0");
    let sql = `SELECT ${RESOURCE_COLS} FROM resources`;
    if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
    sql += " ORDER BY created_at, id";
    const rows = this.db.prepare(sql).all(...args) as ResourceRow[];
    return rows.map(toResource);
  }

  updateResource(id: string, input: UpdateResourceInput): Resource {
    return this.tx(() => {
      const row = this.requireResourceRow(id);
      let name = row.name;
      let attrs = row.attrs;
      if (input.name !== undefined) {
        if (input.name.trim() === "") throw invalid("name is required");
        name = input.name;
      }
      if (input.attrs !== undefined) attrs = mustJson(input.attrs);
      let status = row.status;
      let statusChanged = false;
      if (input.status !== undefined && input.status !== row.status) {
        status = input.status;
        statusChanged = true;
      }
      if (name !== row.name || attrs !== row.attrs) {
        this.db
          .prepare("UPDATE resources SET name=?, attrs=?, updated_at=? WHERE id=?")
          .run(name, attrs, this.now(), id);
      }
      if (statusChanged) return this.applyStatusChange(row, status);
      return toResource(this.requireResourceRow(id));
    });
  }

  private applyStatusChange(row: ResourceRow, status: string): Resource {
    const at = this.now();
    const revoking = status === "revoked" && row.status !== "revoked";
    this.db
      .prepare("UPDATE resources SET status=?, updated_at=? WHERE id=?")
      .run(status, at, row.id);
    let type: string = EVENTS.resourceStatus;
    const payload: JsonObject = { from: row.status, to: status };
    if (revoking) {
      type = EVENTS.revocation;
      payload.reason = REVOCATION_REASONS.statusRevoked;
    }
    this.appendEvent(type, row.id, payload, at);
    // Cascade (draft 3.5): a revoked resource cannot keep live capabilities.
    if (revoking) this.revokeForResource(row.id, REVOCATION_REASONS.statusRevoked, at);
    return toResource(this.requireResourceRow(row.id));
  }

  setClass(id: string, resourceClass: ResourceClass): Resource {
    return this.tx(() => {
      const row = this.requireResourceRow(id);
      if (row.class === resourceClass) return toResource(row);
      const at = this.now();
      const revoking = resourceClass === "private" && row.class === "work";
      this.db
        .prepare("UPDATE resources SET class=?, updated_at=? WHERE id=?")
        .run(resourceClass, at, id);
      const payload: JsonObject = { from: row.class, to: resourceClass };
      let type: string = EVENTS.classChanged;
      if (revoking) {
        type = EVENTS.revocation;
        payload.reason = REVOCATION_REASONS.classPrivate;
      }
      this.appendEvent(type, id, payload, at);
      // Cascade: leaving the work class withdraws the access handed out for it,
      // in the same transaction, so no window keeps a token alive.
      if (revoking) this.revokeForResource(id, REVOCATION_REASONS.classPrivate, at);
      return toResource(this.requireResourceRow(id));
    });
  }

  // --- projects ------------------------------------------------------------

  createProject(name: string, owner?: string): RegistryProject {
    const trimmed = name.trim();
    if (trimmed === "") throw invalid("name is required");
    const at = this.now();
    const project: RegistryProject = {
      id: compose(this.hostId, newLocalId()),
      name: trimmed,
      owner: owner ?? LOCAL_OWNER,
      sequencer: this.hostId,
      epoch: 0,
      createdAt: at,
      updatedAt: at,
    };
    this.tx(() => {
      this.db
        .prepare(`INSERT INTO projects(${PROJECT_COLS}) VALUES(?,?,?,?,?,?,?)`)
        .run(
          project.id,
          project.name,
          project.owner,
          project.sequencer,
          project.epoch,
          project.createdAt,
          project.updatedAt,
        );
      this.appendEvent(EVENTS.projectCreated, project.id, { name: project.name }, at);
    });
    return project;
  }

  getProject(id: string): RegistryProject {
    return toProject(this.requireProjectRow(id));
  }

  listProjects(): RegistryProject[] {
    const rows = this.db
      .prepare(`SELECT ${PROJECT_COLS} FROM projects ORDER BY created_at, id`)
      .all() as ProjectRow[];
    return rows.map(toProject);
  }

  renameProject(id: string, name: string): RegistryProject {
    const trimmed = name.trim();
    if (trimmed === "") throw invalid("name is required");
    return this.tx(() => {
      const row = this.requireProjectRow(id);
      if (trimmed === row.name) return toProject(row);
      const at = this.now();
      this.db.prepare("UPDATE projects SET name=?, updated_at=? WHERE id=?").run(trimmed, at, id);
      this.appendEvent(EVENTS.projectRenamed, id, { from: row.name, to: trimmed }, at);
      return this.getProject(id);
    });
  }

  // --- members -------------------------------------------------------------

  listMembers(projectId: string): ProjectMember[] {
    const rows = this.db
      .prepare(
        "SELECT resource_id, allocation, added_at FROM project_members WHERE project_id=? ORDER BY added_at, resource_id",
      )
      .all(projectId) as Array<{ resource_id: string; allocation: string; added_at: number }>;
    return rows.map((row) => ({
      projectId,
      resourceId: row.resource_id,
      allocation: parseJson(row.allocation),
      addedAt: row.added_at,
    }));
  }

  addMember(projectId: string, resourceId: string, allocation?: JsonObject): ProjectMember[] {
    return this.tx(() => {
      this.requireProjectRow(projectId);
      this.requireResourceRow(resourceId);
      const at = this.now();
      this.db
        .prepare(
          `INSERT INTO project_members(project_id,resource_id,allocation,added_at) VALUES(?,?,?,?)
           ON CONFLICT(project_id,resource_id) DO UPDATE SET allocation=excluded.allocation`,
        )
        .run(projectId, resourceId, mustJson(allocation), at);
      this.appendEvent(EVENTS.memberAdded, projectId, { resource_id: resourceId }, at);
      return this.listMembers(projectId);
    });
  }

  removeMember(projectId: string, resourceId: string): ProjectMember[] {
    return this.tx(() => {
      const at = this.now();
      const result = this.db
        .prepare("DELETE FROM project_members WHERE project_id=? AND resource_id=?")
        .run(projectId, resourceId);
      if (Number(result.changes) === 0) throw notFound("member not found");
      this.appendEvent(EVENTS.memberRemoved, projectId, { resource_id: resourceId }, at);
      // Cascade: capabilities for this resource die with the membership.
      this.revokeForMember(projectId, resourceId, REVOCATION_REASONS.memberRemoved, at);
      return this.listMembers(projectId);
    });
  }

  // --- workspace bindings --------------------------------------------------

  listWorkspaces(projectId: string): ProjectWorkspace[] {
    const rows = this.db
      .prepare(
        "SELECT project_id, workspace_id, daemon_id, role, added_at FROM project_workspaces WHERE project_id=? ORDER BY added_at, workspace_id",
      )
      .all(projectId) as Array<{
      project_id: string;
      workspace_id: string;
      daemon_id: string;
      role: string | null;
      added_at: number;
    }>;
    return rows.map((row) => ({
      projectId: row.project_id,
      workspaceId: row.workspace_id,
      daemonId: row.daemon_id,
      role: row.role,
      addedAt: row.added_at,
    }));
  }

  bindWorkspace(
    projectId: string,
    workspaceId: string,
    daemonId?: string,
    role?: string,
  ): ProjectWorkspace[] {
    return this.tx(() => {
      this.requireProjectRow(projectId);
      const at = this.now();
      this.db
        .prepare(
          `INSERT INTO project_workspaces(project_id,workspace_id,daemon_id,role,added_at) VALUES(?,?,?,?,?)
           ON CONFLICT(project_id,workspace_id) DO UPDATE SET daemon_id=excluded.daemon_id, role=excluded.role`,
        )
        .run(projectId, workspaceId, daemonId ?? "", role ?? null, at);
      this.appendEvent(
        EVENTS.workspaceBound,
        projectId,
        { workspace_id: workspaceId, daemon_id: daemonId ?? "", role: role ?? null },
        at,
      );
      return this.listWorkspaces(projectId);
    });
  }

  unbindWorkspace(projectId: string, workspaceId: string): ProjectWorkspace[] {
    return this.tx(() => {
      const result = this.db
        .prepare("DELETE FROM project_workspaces WHERE project_id=? AND workspace_id=?")
        .run(projectId, workspaceId);
      if (Number(result.changes) === 0) throw notFound("workspace binding not found");
      this.appendEvent(
        EVENTS.workspaceUnbound,
        projectId,
        { workspace_id: workspaceId },
        this.now(),
      );
      return this.listWorkspaces(projectId);
    });
  }

  // --- shares --------------------------------------------------------------

  listShares(projectId: string): ProjectShare[] {
    const rows = this.db
      .prepare(
        "SELECT peer, role, granted_at FROM project_shares WHERE project_id=? ORDER BY granted_at, peer",
      )
      .all(projectId) as Array<{ peer: string; role: string; granted_at: number }>;
    return rows.map((row) => ({
      projectId,
      peer: row.peer,
      role: row.role,
      grantedAt: row.granted_at,
    }));
  }

  addShare(projectId: string, peer: string, role: string): ProjectShare[] {
    if (peer.trim() === "") throw invalid("peer is required");
    return this.tx(() => {
      this.requireProjectRow(projectId);
      const at = this.now();
      this.db
        .prepare(
          `INSERT INTO project_shares(project_id,peer,role,granted_at) VALUES(?,?,?,?)
           ON CONFLICT(project_id,peer) DO UPDATE SET role=excluded.role`,
        )
        .run(projectId, peer, role, at);
      this.appendEvent(EVENTS.shareAdded, projectId, { peer, role }, at);
      return this.listShares(projectId);
    });
  }

  removeShare(projectId: string, peer: string): ProjectShare[] {
    return this.tx(() => {
      const result = this.db
        .prepare("DELETE FROM project_shares WHERE project_id=? AND peer=?")
        .run(projectId, peer);
      if (Number(result.changes) === 0) throw notFound("share not found");
      this.appendEvent(EVENTS.shareRemoved, projectId, { peer }, this.now());
      return this.listShares(projectId);
    });
  }

  sharedProjectIds(): string[] {
    const rows = this.db
      .prepare("SELECT DISTINCT project_id FROM project_shares ORDER BY project_id")
      .all() as Array<{ project_id: string }>;
    return rows.map((row) => row.project_id);
  }

  // --- operators -----------------------------------------------------------

  listOperators(projectId?: string): OperatorBinding[] {
    const sql = projectId
      ? `SELECT ${OPERATOR_COLS} FROM operator_bindings WHERE project_id=? ORDER BY created_at, id`
      : `SELECT ${OPERATOR_COLS} FROM operator_bindings ORDER BY created_at, id`;
    const rows = (
      projectId ? this.db.prepare(sql).all(projectId) : this.db.prepare(sql).all()
    ) as OperatorRow[];
    return rows.map(toOperator);
  }

  getOperator(id: string): OperatorBinding {
    const row = this.db
      .prepare(`SELECT ${OPERATOR_COLS} FROM operator_bindings WHERE id=?`)
      .get(id) as OperatorRow | undefined;
    if (!row) throw notFound(`operator not found: ${id}`);
    return toOperator(row);
  }

  /**
   * Picks the paseo workspace an operator session runs in. An explicit id must be
   * one the project has bound; otherwise the single bound workspace is used, so a
   * project with several fails loudly instead of guessing (invariant I11).
   */
  resolveOperatorWorkspace(projectId: string, workspaceId?: string): string {
    this.requireProjectRow(projectId);
    const workspaces = this.listWorkspaces(projectId);
    if (workspaces.length === 0) {
      throw invalid("bind a paseo workspace to the project before binding an operator");
    }
    if (workspaceId) {
      const bound = workspaces.some((workspace) => workspace.workspaceId === workspaceId);
      if (!bound) throw invalid(`workspace is not bound to the project: ${workspaceId}`);
      return workspaceId;
    }
    if (workspaces.length > 1) {
      throw invalid("project has several bound workspaces; pass workspaceId to choose one");
    }
    return workspaces[0]!.workspaceId;
  }

  /**
   * Records an operator binding. The caller (the RPC handler) owns the paseo side
   * of D-P4: it creates the agent session, or verifies a back-filled one, and
   * passes the outcome here. When a session id is present the session index row
   * is written in the same transaction, so a bound operator always has one.
   */
  bindOperator(input: {
    projectId: string;
    role?: string;
    agentSessionId?: string;
    workspaceId?: string;
    /** paseo provider of the session, kept on the session index. */
    provider?: string;
    /** Human label for the session, kept on the session index. */
    label?: string;
    /** True when the caller created the paseo session rather than binding one. */
    created?: boolean;
  }): OperatorBinding {
    return this.tx(() => {
      const workspaceId = this.resolveOperatorWorkspace(input.projectId, input.workspaceId);
      const at = this.now();
      const agentSessionId = input.agentSessionId ?? null;
      if (agentSessionId) {
        this.indexSessionRow(
          {
            agentSessionId,
            daemonId: this.hostId,
            provider: input.provider,
            label: input.label,
          },
          at,
        );
      }
      const id = compose(this.hostId, newLocalId());
      this.db
        .prepare(
          "INSERT INTO operator_bindings(id,project_id,agent_session_id,workspace_id,role,status,created_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(id, input.projectId, agentSessionId, workspaceId, input.role ?? null, "active", at);
      this.appendEvent(
        EVENTS.operatorBound,
        id,
        {
          project_id: input.projectId,
          role: input.role ?? null,
          agent_session_id: agentSessionId,
          workspace_id: workspaceId,
          created: input.created === true,
        },
        at,
      );
      return this.getOperator(id);
    });
  }

  setOperatorStatus(id: string, status: OperatorStatus): OperatorBinding {
    return this.tx(() => {
      const at = this.now();
      const result = this.db
        .prepare("UPDATE operator_bindings SET status=? WHERE id=?")
        .run(status, id);
      if (Number(result.changes) === 0) throw notFound(`operator not found: ${id}`);
      this.appendEvent(EVENTS.operatorStatus, id, { status }, at);
      // Cascade (draft 3.5): a terminated operator loses its capabilities at once.
      if (status === "terminated") {
        this.revokeForSubject(id, REVOCATION_REASONS.operatorTerminated, at);
      }
      return this.getOperator(id);
    });
  }

  /** Every binding of one paseo agent session, oldest first. */
  listOperatorsForAgent(agentSessionId: string): OperatorBinding[] {
    const rows = this.db
      .prepare(
        `SELECT ${OPERATOR_COLS} FROM operator_bindings WHERE agent_session_id=? ORDER BY created_at, id`,
      )
      .all(agentSessionId) as OperatorRow[];
    return rows.map(toOperator);
  }

  /**
   * The binding a session-open hook injects for (D-B-2). A session bound more
   * than once resolves to its most recent active binding: capabilities are per
   * project, and one paseo session is one operator in the local fleet.
   */
  findActiveOperatorByAgent(agentSessionId: string): OperatorBinding | null {
    const row = this.db
      .prepare(
        `SELECT ${OPERATOR_COLS} FROM operator_bindings WHERE agent_session_id=? AND status='active' ORDER BY created_at DESC, id DESC LIMIT 1`,
      )
      .get(agentSessionId) as OperatorRow | undefined;
    return row ? toOperator(row) : null;
  }

  /**
   * End of life for a paseo session: every binding that is not already terminated
   * becomes terminated and its capabilities join the revocation list, in one
   * transaction. Returns the bindings that changed.
   */
  terminateForAgent(agentSessionId: string): OperatorBinding[] {
    return this.tx(() => {
      const at = this.now();
      const touched = this.listOperatorsForAgent(agentSessionId).filter(
        (binding) => binding.status !== "terminated",
      );
      for (const binding of touched) {
        this.db
          .prepare("UPDATE operator_bindings SET status='terminated' WHERE id=?")
          .run(binding.id);
        this.appendEvent(EVENTS.operatorStatus, binding.id, { status: "terminated" }, at);
        this.revokeForSubject(binding.id, REVOCATION_REASONS.operatorTerminated, at);
      }
      return touched.map((binding) => this.getOperator(binding.id));
    });
  }

  // --- capabilities --------------------------------------------------------

  private capabilityRow(id: string): CapabilityRow | undefined {
    return this.db
      .prepare(
        `SELECT ${CAPABILITY_COLS} FROM capabilities c LEFT JOIN revocations r ON r.serial=c.serial WHERE c.id=?`,
      )
      .get(id) as CapabilityRow | undefined;
  }

  private requireCapability(id: string): Capability {
    const row = this.capabilityRow(id);
    if (!row) throw notFound(`capability not found: ${id}`);
    return toCapability(row);
  }

  private memberAllocation(projectId: string, resourceId: string): JsonObject | null {
    const row = this.db
      .prepare("SELECT allocation FROM project_members WHERE project_id=? AND resource_id=?")
      .get(projectId, resourceId) as { allocation: string } | undefined;
    return row ? parseJson(row.allocation) : null;
  }

  /**
   * Local subjects must name an operator binding that exists, so a typo cannot
   * mint a token nobody can present. Anything not qualified by this host is taken
   * as a foreign principal: D-B-2 keeps the cross-machine subject shape open for G3.
   */
  private requireSubject(subject: string): void {
    const trimmed = subject.trim();
    if (trimmed === "") throw invalid("subject is required");
    if (!trimmed.startsWith(`${this.hostId}/`)) return;
    const row = this.db.prepare("SELECT 1 FROM operator_bindings WHERE id=?").get(trimmed);
    if (!row) throw notFound(`operator not found: ${trimmed}`);
  }

  /**
   * Issues a capability: draft 3.2/5 with the local choices recorded in D-B-2/4/6.
   * Guards, in order: the project and resource exist, the resource is a member of
   * the project, the scope stays inside that member's allocation, the subject is a
   * real local operator, and the serial is unused.
   */
  issueCapability(input: IssueCapabilityInput): { capability: Capability; token: string } {
    return this.tx(() => {
      this.requireProjectRow(input.projectId);
      const resource = this.requireResourceRow(input.resourceId);
      const scope = input.scope ?? {};
      const allocation = this.memberAllocation(input.projectId, input.resourceId);
      if (allocation === null) {
        throw invalid(`resource is not a member of the project: ${input.resourceId}`);
      }
      if (!isScopeWithinAllocation(scope, allocation)) {
        throw invalid("scope is not within the project member's allocation");
      }
      this.requireSubject(input.subject);
      const id = newCapabilityId();
      const serial = input.serial ?? id;
      if (this.db.prepare("SELECT 1 FROM capabilities WHERE serial=?").get(serial)) {
        throw invalid(`serial already issued: ${serial}`);
      }
      const at = this.now();
      const ttl =
        input.ttlSec === undefined
          ? resolveTtlSec(input.kind, parseJson(resource.attrs).ttlSec)
          : input.ttlSec;
      const claims: CapabilityClaims = {
        v: TOKEN_VERSION,
        id,
        serial,
        kid: this.issuer.kid,
        issuer: LOCAL_OWNER,
        subject: input.subject,
        project: input.projectId,
        resource: input.resourceId,
        kind: input.kind,
        scope,
        caveats: input.caveats ?? {},
        iat: at,
        exp: ttl === null ? null : at + ttl * 1000,
      };
      const token = encodeToken(claims, this.issuer);
      this.db
        .prepare(
          `INSERT INTO capabilities(id,serial,kid,issuer,subject,project_id,resource_id,kind,scope,caveats,issued_at,expires_at,token)
           VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`,
        )
        .run(
          claims.id,
          claims.serial,
          claims.kid,
          claims.issuer,
          claims.subject,
          claims.project,
          claims.resource,
          claims.kind,
          mustJson(claims.scope),
          mustJson(claims.caveats),
          claims.iat,
          claims.exp,
          token,
        );
      this.appendEvent(
        EVENTS.capabilityIssued,
        id,
        {
          serial,
          subject: claims.subject,
          project_id: input.projectId,
          resource_id: input.resourceId,
          kind: claims.kind,
          scope: claims.scope,
          expires_at: claims.exp,
        },
        at,
      );
      return { capability: this.requireCapability(id), token };
    });
  }

  getCapability(id: string): Capability {
    return this.requireCapability(id);
  }

  listCapabilities(filter: CapabilityFilter = {}): Capability[] {
    const where: string[] = [];
    const args: string[] = [];
    if (filter.subject) {
      where.push("c.subject=?");
      args.push(filter.subject);
    }
    if (filter.projectId) {
      where.push("c.project_id=?");
      args.push(filter.projectId);
    }
    if (filter.resourceId) {
      where.push("c.resource_id=?");
      args.push(filter.resourceId);
    }
    let sql = `SELECT ${CAPABILITY_COLS} FROM capabilities c LEFT JOIN revocations r ON r.serial=c.serial`;
    if (where.length > 0) sql += ` WHERE ${where.join(" AND ")}`;
    sql += " ORDER BY c.issued_at, c.id";
    const rows = this.db.prepare(sql).all(...args) as CapabilityRow[];
    return rows.map(toCapability);
  }

  /**
   * Explicit revocation: the owner kills one token before its TTL. Idempotent, so
   * a repeat returns the capability with its original revocation rather than
   * rewriting when and why it happened.
   */
  revokeCapability(id: string, reason: string = REVOCATION_REASONS.ownerRevoked): Capability {
    return this.tx(() => {
      const row = this.capabilityRow(id);
      if (!row) throw notFound(`capability not found: ${id}`);
      if (row.revoked_at === null) {
        const at = this.now();
        this.db
          .prepare("INSERT INTO revocations(serial,at,reason,source) VALUES(?,?,?,'local')")
          .run(row.serial, at, reason);
        this.appendEvent(
          EVENTS.capabilityRevoked,
          row.id,
          { serial: row.serial, resource_id: row.resource_id, subject: row.subject, reason },
          at,
        );
      }
      return this.requireCapability(id);
    });
  }

  /**
   * Tokens an operator may present right now: unrevoked and unexpired. The order
   * is stable, so the injected environment does not churn between sessions.
   */
  tokensForBinding(bindingId: string, at: number = this.now()): string[] {
    const rows = this.db
      .prepare(
        `SELECT ${CAPABILITY_COLS} FROM capabilities c LEFT JOIN revocations r ON r.serial=c.serial
         WHERE c.subject=? AND r.serial IS NULL AND (c.expires_at IS NULL OR c.expires_at > ?)
         ORDER BY c.issued_at, c.id`,
      )
      .all(bindingId, at) as CapabilityRow[];
    return rows.map((row) => row.token);
  }

  /** The local revocation list, the authority for verification on this host. */
  revokedSerials(): Set<string> {
    const rows = this.db.prepare("SELECT serial FROM revocations").all() as Array<{
      serial: string;
    }>;
    return new Set(rows.map((row) => row.serial));
  }

  /** Revokes every capability matching a predicate. Callers hold the transaction. */
  private revokeMatching(where: string, args: string[], reason: string, at: number): number {
    const rows = this.db
      .prepare(`SELECT id,serial,resource_id,subject FROM capabilities WHERE ${where}`)
      .all(...args) as Array<{ id: string; serial: string; resource_id: string; subject: string }>;
    const revoke = this.db.prepare(
      "INSERT OR IGNORE INTO revocations(serial,at,reason,source) VALUES(?,?,?,'local')",
    );
    let count = 0;
    for (const row of rows) {
      if (Number(revoke.run(row.serial, at, reason).changes) === 0) continue;
      this.appendEvent(
        EVENTS.capabilityRevoked,
        row.id,
        { serial: row.serial, resource_id: row.resource_id, subject: row.subject, reason },
        at,
      );
      count += 1;
    }
    return count;
  }

  private revokeForResource(resourceId: string, reason: string, at: number): number {
    return this.revokeMatching("resource_id=?", [resourceId], reason, at);
  }

  private revokeForSubject(subject: string, reason: string, at: number): number {
    return this.revokeMatching("subject=?", [subject], reason, at);
  }

  private revokeForMember(
    projectId: string,
    resourceId: string,
    reason: string,
    at: number,
  ): number {
    return this.revokeMatching(
      "project_id=? AND resource_id=?",
      [projectId, resourceId],
      reason,
      at,
    );
  }

  /**
   * Verifies a token against this registry's issuer key and revocation list, and
   * records a `capability_denied` event when it refuses. Refusals are audited and
   * successes are not: a successful check happens on every use of a resource.
   *
   * High-sensitivity resources (D-B-4) fail closed when revocation state cannot be
   * read. Locally the list is always in hand, so that branch only fires for a
   * token whose resource this host does not know, which today means a peer's.
   */
  verifyCapability(token: string, expectation: CapabilityExpectation = {}): CapabilityVerification {
    const decoded = decodeToken(token);
    const resource = decoded ? this.resourceRow(decoded.claims.resource) : undefined;
    const outcome = verifyToken(token, this.issuer, {
      now: this.now(),
      revoked: this.revokedSerials(),
      failClosed: resource ? isHighSensitivity(toResource(resource)) : true,
      presenter: expectation.presenter,
      resourceId: expectation.resourceId,
      kind: expectation.kind,
    });
    if (outcome.ok) {
      const claims = outcome.claims!;
      return {
        ok: true,
        reason: null,
        subject: claims.subject,
        resourceId: claims.resource,
        claims,
      };
    }
    this.tx(() =>
      this.appendEvent(
        EVENTS.capabilityDenied,
        decoded?.claims.id ?? "unknown",
        {
          reason: outcome.reason,
          resource_id: decoded?.claims.resource ?? null,
          subject: decoded?.claims.subject ?? null,
          presenter: expectation.presenter ?? null,
        },
        this.now(),
      ),
    );
    return {
      ok: false,
      reason: outcome.reason,
      subject: outcome.claims?.subject ?? null,
      resourceId: outcome.claims?.resource ?? null,
      claims: outcome.claims,
    };
  }

  // --- sessions ------------------------------------------------------------

  indexSession(input: {
    agentSessionId: string;
    daemonId?: string;
    provider?: string;
    label?: string;
  }): SessionRef {
    if (input.agentSessionId.trim() === "") throw invalid("agentSessionId is required");
    const at = this.now();
    return this.tx(() => this.indexSessionRow(input, at));
  }

  /**
   * Idempotent by `agent_session_id`: re-indexing (or binding) the same paseo
   * session twice keeps one row, so an operator and its session stay 1:1.
   */
  private indexSessionRow(
    input: { agentSessionId: string; daemonId?: string; provider?: string; label?: string },
    at: number,
  ): SessionRef {
    const existing = this.sessionRow(input.agentSessionId);
    if (existing) return existing;

    const id = compose(this.hostId, newLocalId());
    this.db
      .prepare(
        "INSERT INTO session_refs(id,agent_session_id,daemon_id,provider,label,created_at) VALUES(?,?,?,?,?,?)",
      )
      .run(
        id,
        input.agentSessionId,
        input.daemonId ?? "",
        input.provider ?? null,
        input.label ?? null,
        at,
      );
    this.appendEvent(EVENTS.sessionIndexed, id, { provider: input.provider ?? null }, at);
    return {
      id,
      agentSessionId: input.agentSessionId,
      daemonId: input.daemonId ?? "",
      provider: input.provider ?? null,
      label: input.label ?? null,
      createdAt: at,
    };
  }

  private sessionRow(agentSessionId: string): SessionRef | undefined {
    const row = this.db
      .prepare(
        "SELECT id,agent_session_id,daemon_id,provider,label,created_at FROM session_refs WHERE agent_session_id=?",
      )
      .get(agentSessionId) as SessionRow | undefined;
    return row ? toSessionRef(row) : undefined;
  }

  listSessions(): SessionRef[] {
    const rows = this.db
      .prepare(
        "SELECT id,agent_session_id,daemon_id,provider,label,created_at FROM session_refs ORDER BY created_at, id",
      )
      .all() as SessionRow[];
    return rows.map(toSessionRef);
  }

  // --- projection and audit ------------------------------------------------

  /** I6: class=private member resources are externally non-existent. */
  descriptor(projectId: string): Descriptor {
    const project = this.getProject(projectId);
    const descriptor: Descriptor = {
      project: {
        id: project.id,
        name: project.name,
        owner: project.owner,
        sequencer: project.sequencer,
        epoch: project.epoch,
      },
      members: [],
      state: { sequencer: project.sequencer, epoch: project.epoch, members: [] },
    };
    for (const member of this.listMembers(projectId)) {
      const row = this.requireResourceRow(member.resourceId);
      if (row.class !== "work") continue;
      descriptor.members.push({
        resource: {
          id: row.id,
          host: hostOf(row.id),
          kind: row.kind,
          locality: row.locality as Resource["locality"],
          name: row.name,
        },
        allocation: member.allocation,
      });
      descriptor.state.members.push({
        resourceId: row.id,
        locality: row.locality as Resource["locality"],
        chain: null,
        version: null,
        // I8: remote bypass members are not modelled.
        modeled: row.locality === "local",
      });
    }
    return descriptor;
  }

  broadcast(since: number): BroadcastEntry[] {
    const asOf = this.now();
    const entries: BroadcastEntry[] = [];
    for (const projectId of this.sharedProjectIds()) {
      entries.push({ type: "project", asOf, project: this.descriptor(projectId) });
    }
    for (const resource of this.listResources({ class: "work", kind: "ai-capability" })) {
      const scope = resource.attrs.scope;
      entries.push({
        type: "ai-capability",
        asOf,
        resource: {
          id: resource.id,
          host: hostOf(resource.id),
          kind: resource.kind,
          locality: resource.locality,
          name: resource.name,
        },
        scope:
          scope && typeof scope === "object" && !Array.isArray(scope) ? (scope as JsonObject) : {},
      });
    }
    for (const event of this.revocationEventsSince(since)) {
      const reason = event.payload.reason;
      entries.push({
        type: "revocation",
        asOf: event.ts,
        resourceId: event.subject,
        reason: typeof reason === "string" ? reason : "",
        eventSeq: event.seq,
      });
    }
    return entries;
  }

  listEvents(since: number, limit = 0): RegistryEvent[] {
    let sql =
      "SELECT seq,ts,type,COALESCE(subject,'') AS subject,payload FROM events WHERE seq>? ORDER BY seq";
    const args: Array<number> = [since];
    if (limit > 0) {
      sql += " LIMIT ?";
      args.push(limit);
    }
    const rows = this.db.prepare(sql).all(...args) as EventRow[];
    return rows.map((row) => ({
      seq: row.seq,
      ts: row.ts,
      type: row.type,
      subject: row.subject ?? "",
      payload: parseJson(row.payload),
    }));
  }

  private revocationEventsSince(since: number): RegistryEvent[] {
    const rows = this.db
      .prepare(
        "SELECT seq,ts,type,COALESCE(subject,'') AS subject,payload FROM events WHERE seq>? AND type=? ORDER BY seq",
      )
      .all(since, EVENTS.revocation) as EventRow[];
    return rows.map((row) => ({
      seq: row.seq,
      ts: row.ts,
      type: row.type,
      subject: row.subject ?? "",
      payload: parseJson(row.payload),
    }));
  }
}
