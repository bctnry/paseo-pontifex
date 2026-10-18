// Fully-qualified ids: "<hostId>/<localId>". Cross-machine references always use
// the qualified form; the host part is the paseo daemon serverId here.
import { randomBytes } from "node:crypto";

const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

function encodeTime(now: number, length: number): string {
  let out = "";
  let value = now;
  for (let i = length - 1; i >= 0; i -= 1) {
    const mod = value % 32;
    out = CROCKFORD[mod] + out;
    value = (value - mod) / 32;
  }
  return out;
}

function encodeRandom(length: number): string {
  const bytes = randomBytes(length);
  let out = "";
  for (let i = 0; i < length; i += 1) out += CROCKFORD[bytes[i]! % 32];
  return out;
}

/** A time-sortable ULID (48-bit milliseconds + 80 bits of randomness). */
export function newLocalId(): string {
  return encodeTime(Date.now(), 10) + encodeRandom(16);
}

/** Builds a fully-qualified id "<host>/<local>". */
export function compose(host: string, local: string): string {
  return `${host}/${local}`;
}

/**
 * A capability id. The token serial defaults to it, so it is 128 random bits
 * rather than the time-sortable local id: a revocation list is keyed by serial
 * and needs uniqueness, not ordering.
 */
export function newCapabilityId(): string {
  return `cap_${randomBytes(16).toString("hex")}`;
}

/** The host part of a qualified id, or "" when the id is unqualified. */
export function hostOf(id: string): string {
  const index = id.lastIndexOf("/");
  return index < 0 ? "" : id.slice(0, index);
}

/** The local part of a qualified id. */
export function localOf(id: string): string {
  const index = id.lastIndexOf("/");
  return index < 0 ? id : id.slice(index + 1);
}
