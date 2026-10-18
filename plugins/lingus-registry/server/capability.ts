// Capability tokens: a self-contained, offline-verifiable grant of access to one
// resource (architecture draft, Track B).
//
// A token is `base64url(json) + "." + base64url(signature)`, where the signature
// is Ed25519 over the base64url payload itself (JWS style, so verification never
// re-serializes the claims and cannot disagree with what was signed).
//
// Everything here is a pure function of its arguments except
// `loadOrCreateIssuerKeys`, the documented boundary that touches the key file.
import {
  createHash,
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  sign as signBytes,
  verify as verifyBytes,
  type KeyObject,
} from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  CapabilityClaimsSchema,
  type CapabilityClaims,
  type CapabilityKind,
  type VerifyFailure,
} from "../shared/model.js";

export const TOKEN_VERSION = 1;

/** Default validity per capability kind, in seconds (D-B-6). */
export const DEFAULT_TTL_SEC: Record<CapabilityKind, number> = {
  access: 24 * 60 * 60,
  approval: 60 * 60,
};

const KEY_FILE = "issuer-key.pem";

export interface IssuerKeys {
  kid: string;
  privateKey: KeyObject;
  publicKey: KeyObject;
}

/** Deterministic key id: 16 base64url characters of the SPKI digest. */
export function keyId(publicKey: KeyObject): string {
  const spki = publicKey.export({ type: "spki", format: "der" });
  return createHash("sha256").update(spki).digest("base64url").slice(0, 16);
}

/** Mints a fresh Ed25519 issuer key pair as a PKCS#8 PEM. */
export function generateIssuerPem(): { privateKeyPem: string } {
  const { privateKey } = generateKeyPairSync("ed25519");
  return { privateKeyPem: privateKey.export({ type: "pkcs8", format: "pem" }).toString() };
}

/** Loads a key pair from its PKCS#8 PEM and derives its kid. */
export function loadIssuerKeys(privateKeyPem: string): IssuerKeys {
  const privateKey = createPrivateKey(privateKeyPem);
  const publicKey = createPublicKey(privateKey);
  return { kid: keyId(publicKey), privateKey, publicKey };
}

/**
 * Boundary function: the only I/O in this module. Reads
 * `<directory>/issuer-key.pem` or creates it with mode 0600 on first use. An
 * existing key that cannot be loaded is an error rather than a reason to mint a
 * new one, which would orphan every token already issued.
 */
export function loadOrCreateIssuerKeys(directory: string): IssuerKeys {
  const file = path.join(directory, KEY_FILE);
  if (existsSync(file)) return loadIssuerKeys(readFileSync(file, "utf8"));
  const { privateKeyPem } = generateIssuerPem();
  mkdirSync(directory, { recursive: true });
  writeFileSync(file, privateKeyPem, { mode: 0o600 });
  return loadIssuerKeys(privateKeyPem);
}

/** Lexicographic comparator for canonical key ordering. */
function compareKeys(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

/**
 * Deterministic JSON: object keys sorted, no whitespace, `undefined` treated as
 * absent. Signing goes through this, and the scope check in the registry uses it
 * as a deep equality so both sides agree on what "the same value" means.
 */
export function canonicalize(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([left], [right]) => compareKeys(left, right));
  const body = entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
  return `{${body.join(",")}}`;
}

/** Signs claims into a token. The registry stores this string verbatim. */
export function encodeToken(claims: CapabilityClaims, keys: IssuerKeys): string {
  const payload = Buffer.from(canonicalize(claims), "utf8").toString("base64url");
  const signature = signBytes(null, Buffer.from(payload, "utf8"), keys.privateKey).toString(
    "base64url",
  );
  return `${payload}.${signature}`;
}

export interface DecodedToken {
  payload: string;
  signature: string;
  claims: CapabilityClaims;
}

/** Splits and parses a token. The signature is returned but not checked here. */
export function decodeToken(token: string): DecodedToken | null {
  const segments = token.split(".");
  if (segments.length !== 2) return null;
  const [payload, signature] = segments;
  if (!payload || !signature) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const parsed = CapabilityClaimsSchema.safeParse(raw);
  if (!parsed.success) return null;
  return { payload, signature, claims: parsed.data };
}

export interface VerifyOptions {
  now: number;
  /**
   * Serials known to be revoked, or null when no revocation list is reachable.
   * The draft's hybrid model reads revocation state for local resources and
   * keeps TTL as a backstop only (3.7).
   */
  revoked: ReadonlySet<string> | null;
  /** High-sensitivity resources deny when the revocation list is unreachable (D-B-4). */
  failClosed?: boolean;
  /** Expected presenter; when given it must equal the token subject (3.3). */
  presenter?: string;
  /** Expected resource id. */
  resourceId?: string;
  /** Expected capability kind. */
  kind?: string;
}

export interface VerifyOutcome {
  ok: boolean;
  reason: VerifyFailure | null;
  claims: CapabilityClaims | null;
}

const denied = (reason: VerifyFailure, claims: CapabilityClaims | null = null): VerifyOutcome => ({
  ok: false,
  reason,
  claims,
});

/**
 * Offline verification in the draft's order: format, version, clock, signature,
 * revocation state, then what the caller expected to find on the token. It needs
 * no database: the caller supplies the revoked-serial set.
 */
export function verifyToken(
  token: string,
  keys: IssuerKeys,
  options: VerifyOptions,
): VerifyOutcome {
  const decoded = decodeToken(token);
  if (!decoded) return denied("malformed");
  const { claims } = decoded;
  if (claims.v !== TOKEN_VERSION) return denied("unsupported_version", claims);
  if (claims.exp !== null && claims.exp <= options.now) return denied("expired", claims);
  if (claims.iat > options.now) return denied("not_yet_valid", claims);
  if (claims.kid !== keys.kid) return denied("bad_signature", claims);
  const signed = Buffer.from(decoded.payload, "utf8");
  const signature = Buffer.from(decoded.signature, "base64url");
  if (!verifyBytes(null, signed, keys.publicKey, signature)) {
    return denied("bad_signature", claims);
  }
  if (options.revoked === null) {
    if (options.failClosed) return denied("revocation_unavailable", claims);
  } else if (options.revoked.has(claims.serial)) {
    return denied("revoked", claims);
  }
  if (options.presenter !== undefined && options.presenter !== claims.subject) {
    return denied("subject_mismatch", claims);
  }
  if (options.resourceId !== undefined && options.resourceId !== claims.resource) {
    return denied("resource_mismatch", claims);
  }
  if (options.kind !== undefined && options.kind !== claims.kind) {
    return denied("kind_mismatch", claims);
  }
  return { ok: true, reason: null, claims };
}

/**
 * Seconds of validity for a new capability: an explicit `resources.attrs.ttlSec`
 * wins, otherwise the per-kind default (D-B-6).
 */
export function resolveTtlSec(kind: CapabilityKind, attrsTtlSec: unknown): number {
  if (typeof attrsTtlSec === "number" && Number.isFinite(attrsTtlSec) && attrsTtlSec > 0) {
    return Math.floor(attrsTtlSec);
  }
  return DEFAULT_TTL_SEC[kind];
}
