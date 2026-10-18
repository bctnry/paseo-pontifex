// Domain model of the Lingus registry plugin.
//
// Ported from the "Track A" Go registry (internal/model). Two orthogonal axes
// run throughout:
//   - class: management authority. "private" = user-only; "work" = delegated to
//     machine components (agents). Agents may only act on work resources.
//   - locality: whether the data/state lives on this machine. "local" resources
//     are snapshot/rollback-able; "remote" resources are credentials-only.
//
// This module is imported by both the server and client bundles, so it must stay
// dependency-free beyond `zod`.
import { z } from "zod";

export const CLASSES = ["private", "work"] as const;
export const LOCALITIES = ["local", "remote"] as const;
export const RESOURCE_STATUSES = ["registered", "disabled", "revoked"] as const;
export const OPERATOR_STATUSES = ["active", "suspended", "terminated"] as const;

export const ClassSchema = z.enum(["private", "work"]);
export const LocalitySchema = z.enum(["local", "remote"]);
export const ResourceStatusSchema = z.enum(["registered", "disabled", "revoked"]);
export const OperatorStatusSchema = z.enum(["active", "suspended", "terminated"]);

export const CAPABILITY_KINDS = ["access", "approval"] as const;

export const CapabilityKindSchema = z.enum(["access", "approval"]);

export type ResourceClass = (typeof CLASSES)[number];
export type Locality = (typeof LOCALITIES)[number];
export type ResourceStatus = (typeof RESOURCE_STATUSES)[number];
export type OperatorStatus = (typeof OPERATOR_STATUSES)[number];
export type CapabilityKind = (typeof CAPABILITY_KINDS)[number];

/**
 * Why a verification refused a token. The order mirrors the offline check order
 * in `server/capability.ts`: format, version, clock, signature, revocation, then
 * whatever the caller expected to find on the token.
 */
export const VERIFY_FAILURES = [
  "malformed",
  "unsupported_version",
  "expired",
  "not_yet_valid",
  "bad_signature",
  "revoked",
  "revocation_unavailable",
  "subject_mismatch",
  "resource_mismatch",
  "kind_mismatch",
] as const;

export const VerifyFailureSchema = z.enum(VERIFY_FAILURES);
export type VerifyFailure = (typeof VERIFY_FAILURES)[number];

/** Built-in kind for the local registry resource itself. */
export const KIND_REGISTRY = "registry";

/**
 * The resource-kind taxonomy. The SQLite schema stores `kind` as free text, so
 * adding a kind is a code change here, not a migration (Track A parity).
 */
export const RESOURCE_KINDS = [
  "storage",
  "write-authority",
  "ai-capability",
  "service",
  "external",
  KIND_REGISTRY,
] as const;

export const ResourceKindSchema = z.string().min(1);

export const JsonObjectSchema = z.record(z.string(), z.unknown());
export type JsonObject = z.infer<typeof JsonObjectSchema>;

/** Audit/outbox event types written by the registry. */
export const EVENTS = {
  resourceRegistered: "resource_registered",
  resourceStatus: "resource_status",
  classChanged: "class_changed",
  revocation: "revocation",
  projectCreated: "project_created",
  projectRenamed: "project_renamed",
  memberAdded: "member_added",
  memberRemoved: "member_removed",
  workspaceBound: "workspace_bound",
  workspaceUnbound: "workspace_unbound",
  shareAdded: "share_added",
  shareRemoved: "share_removed",
  operatorBound: "operator_bound",
  operatorStatus: "operator_status",
  sessionIndexed: "session_indexed",
  capabilityIssued: "capability_issued",
  capabilityRevoked: "capability_revoked",
  capabilityDenied: "capability_denied",
} as const;

/** Reasons carried in revocation event payloads. */
export const REVOCATION_REASONS = {
  classPrivate: "class_private",
  statusRevoked: "status_revoked",
  ownerRevoked: "owner_revoked",
  operatorTerminated: "operator_terminated",
  memberRemoved: "member_removed",
} as const;

// --- entities --------------------------------------------------------------

export const ResourceSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  kind: ResourceKindSchema,
  locality: LocalitySchema,
  class: ClassSchema,
  status: ResourceStatusSchema,
  owner: z.string().min(1),
  attrs: JsonObjectSchema,
  provenance: JsonObjectSchema,
  builtin: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type Resource = z.infer<typeof ResourceSchema>;

/** Sensitivity values a resource may declare in `attrs.sensitivity`. */
export const SENSITIVITIES = ["low", "normal", "high"] as const;

/** Kinds that count as high-sensitivity unless the resource says otherwise. */
const HIGH_SENSITIVITY_KINDS = new Set<string>(["external"]);

/**
 * D-B-4: high sensitivity is declared explicitly in `resources.attrs.sensitivity`;
 * `kind` only supplies the default. High-sensitivity resources make a verifier
 * fail closed when it cannot reach revocation state (draft 3.7).
 */
export function isHighSensitivity(resource: { kind: string; attrs: JsonObject }): boolean {
  const declared = resource.attrs.sensitivity;
  if (declared === "high") return true;
  if (declared === "low" || declared === "normal") return false;
  return HIGH_SENSITIVITY_KINDS.has(resource.kind);
}

/** The architecture draft's "Project": a new registry entity, not paseo's. */
export const RegistryProjectSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  owner: z.string().min(1),
  /** paseo daemon serverId that sequences this project (epoch is fencing). */
  sequencer: z.string().min(1),
  epoch: z.number(),
  createdAt: z.number(),
  updatedAt: z.number(),
});
export type RegistryProject = z.infer<typeof RegistryProjectSchema>;

/** Project↔Resource relation plus its allocation attribute. */
export const ProjectMemberSchema = z.object({
  projectId: z.string().min(1),
  resourceId: z.string().min(1),
  allocation: JsonObjectSchema,
  addedAt: z.number(),
});
export type ProjectMember = z.infer<typeof ProjectMemberSchema>;

/**
 * Draft 3.2/5: a capability's scope must stay inside the project member's
 * allocation, which is what gives the stored allocation meaning. Objects narrow
 * key by key; every other value must match exactly.
 */
export function isScopeWithinAllocation(scope: JsonObject, allocation: JsonObject): boolean {
  return Object.entries(scope).every(([key, value]) => {
    const permitted = allocation[key];
    if (permitted === undefined) return false;
    if (isJsonObject(value) && isJsonObject(permitted)) {
      return isScopeWithinAllocation(value, permitted);
    }
    return jsonEquals(value, permitted);
  });
}

function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Deep equality for JSON values, independent of object key order. */
function jsonEquals(left: unknown, right: unknown): boolean {
  if (isJsonObject(left) && isJsonObject(right)) {
    const leftKeys = Object.keys(left).sort();
    const rightKeys = Object.keys(right).sort();
    if (leftKeys.length !== rightKeys.length) return false;
    return leftKeys.every(
      (key, index) => rightKeys[index] === key && jsonEquals(left[key], right[key]),
    );
  }
  if (Array.isArray(left) && Array.isArray(right)) {
    return (
      left.length === right.length && left.every((item, index) => jsonEquals(item, right[index]))
    );
  }
  return left === right;
}

/** Draft project ↔ paseo Workspace binding (1:N). */
export const ProjectWorkspaceSchema = z.object({
  projectId: z.string().min(1),
  workspaceId: z.string().min(1),
  daemonId: z.string(),
  role: z.string().nullable(),
  addedAt: z.number(),
});
export type ProjectWorkspace = z.infer<typeof ProjectWorkspaceSchema>;

export const ProjectShareSchema = z.object({
  projectId: z.string().min(1),
  peer: z.string().min(1),
  role: z.string(),
  grantedAt: z.number(),
});
export type ProjectShare = z.infer<typeof ProjectShareSchema>;

/** Operator → paseo Agent session binding. */
export const OperatorBindingSchema = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  agentSessionId: z.string().nullable(),
  workspaceId: z.string().nullable(),
  role: z.string().nullable(),
  status: OperatorStatusSchema,
  createdAt: z.number(),
});
export type OperatorBinding = z.infer<typeof OperatorBindingSchema>;

/**
 * The signed payload of a capability token. It travels inside the token, so a
 * verifier needs no database to read it; only revocation state is a lookup.
 */
export const CapabilityClaimsSchema = z.object({
  v: z.number(),
  id: z.string().min(1),
  serial: z.string().min(1),
  kid: z.string().min(1),
  issuer: z.string().min(1),
  subject: z.string().min(1),
  project: z.string().nullable(),
  resource: z.string().min(1),
  kind: CapabilityKindSchema,
  scope: JsonObjectSchema,
  caveats: JsonObjectSchema,
  iat: z.number(),
  exp: z.number().nullable(),
});
export type CapabilityClaims = z.infer<typeof CapabilityClaimsSchema>;

/**
 * A capability as the registry stores it. `revokedAt` comes from the revocation
 * list rather than from a column, so a token and its revocation have one source.
 */
export const CapabilitySchema = z.object({
  id: z.string().min(1),
  serial: z.string().min(1),
  kid: z.string().min(1),
  issuer: z.string().min(1),
  subject: z.string().min(1),
  projectId: z.string().nullable(),
  resourceId: z.string().min(1),
  kind: CapabilityKindSchema,
  scope: JsonObjectSchema,
  caveats: JsonObjectSchema,
  issuedAt: z.number(),
  expiresAt: z.number().nullable(),
  revokedAt: z.number().nullable(),
  revokedReason: z.string().nullable(),
});
export type Capability = z.infer<typeof CapabilitySchema>;

/** Outcome of `capability.verify`: the claims survive a refusal so callers can log them. */
export const CapabilityVerificationSchema = z.object({
  ok: z.boolean(),
  reason: VerifyFailureSchema.nullable(),
  subject: z.string().nullable(),
  resourceId: z.string().nullable(),
  claims: CapabilityClaimsSchema.nullable(),
});
export type CapabilityVerification = z.infer<typeof CapabilityVerificationSchema>;

/** Index of a paseo agent session; content stays in paseo's timeline. */
export const SessionRefSchema = z.object({
  id: z.string().min(1),
  agentSessionId: z.string().min(1),
  daemonId: z.string(),
  provider: z.string().nullable(),
  label: z.string().nullable(),
  createdAt: z.number(),
});
export type SessionRef = z.infer<typeof SessionRefSchema>;

/** A paseo provider that can host an operator session (`provider.list`). */
export const ProviderInfoSchema = z.object({
  id: z.string().min(1),
  available: z.boolean(),
  error: z.string().nullable(),
});
export type ProviderInfo = z.infer<typeof ProviderInfoSchema>;

/** A selectable model of a provider; the pair travels as `provider/model`. */
export const ProviderModelSchema = z.object({
  id: z.string().min(1),
  label: z.string(),
  isDefault: z.boolean(),
});
export type ProviderModel = z.infer<typeof ProviderModelSchema>;

export const StateMemberSchema = z.object({
  resourceId: z.string(),
  locality: LocalitySchema,
  chain: z.string().nullable(),
  version: z.string().nullable(),
  modeled: z.boolean(),
});
export type StateMember = z.infer<typeof StateMemberSchema>;

export const StateHandleSchema = z.object({
  sequencer: z.string(),
  epoch: z.number(),
  members: z.array(StateMemberSchema),
});
export type StateHandle = z.infer<typeof StateHandleSchema>;

export const DescriptorResourceSchema = z.object({
  id: z.string(),
  host: z.string(),
  kind: ResourceKindSchema,
  locality: LocalitySchema,
  name: z.string(),
});
export type DescriptorResource = z.infer<typeof DescriptorResourceSchema>;

export const DescriptorMemberSchema = z.object({
  resource: DescriptorResourceSchema,
  allocation: JsonObjectSchema,
});
export type DescriptorMember = z.infer<typeof DescriptorMemberSchema>;

/** Shareable projection of a project: only class=work members appear. */
export const DescriptorSchema = z.object({
  project: z.object({
    id: z.string(),
    name: z.string(),
    owner: z.string(),
    sequencer: z.string(),
    epoch: z.number(),
  }),
  members: z.array(DescriptorMemberSchema),
  state: StateHandleSchema,
  note: z.string().optional(),
});
export type Descriptor = z.infer<typeof DescriptorSchema>;

export const BroadcastEntrySchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("project"), asOf: z.number(), project: DescriptorSchema }),
  z.object({
    type: z.literal("ai-capability"),
    asOf: z.number(),
    resource: DescriptorResourceSchema,
    scope: JsonObjectSchema,
  }),
  z.object({
    type: z.literal("revocation"),
    asOf: z.number(),
    resourceId: z.string(),
    reason: z.string(),
    eventSeq: z.number(),
  }),
]);
export type BroadcastEntry = z.infer<typeof BroadcastEntrySchema>;

export const RegistryEventSchema = z.object({
  seq: z.number(),
  ts: z.number(),
  type: z.string(),
  subject: z.string(),
  payload: JsonObjectSchema,
});
export type RegistryEvent = z.infer<typeof RegistryEventSchema>;
