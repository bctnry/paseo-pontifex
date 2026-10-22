import { z } from "zod";
import type { PersistStorage, StateStorage, StorageValue } from "zustand/middleware";

const VALIDATED_STATE = Symbol.for("paseo.validated-persist-state");

/** Mark state that already passed `stateSchema` so a merge does not parse it again. */
export function markValidatedPersistState<State>(state: State): State {
  if (typeof state === "object" && state !== null && !Object.isFrozen(state)) {
    Object.defineProperty(state, VALIDATED_STATE, {
      value: true,
      enumerable: false,
      configurable: false,
    });
  }
  return state;
}

export function isValidatedPersistState<State>(state: unknown): state is State {
  return (
    typeof state === "object" &&
    state !== null &&
    (state as Record<symbol, unknown>)[VALIDATED_STATE] === true
  );
}

export function createValidatedPersistStorage<State>(
  backingStorage: StateStorage,
  stateSchema: z.ZodType<State>,
  options: {
    // Opt in only when callers preserve state references until values change.
    skipUnchanged?: boolean;
    // State is schema-derived by the time it reaches the store. Re-validating on
    // every write costs a full Zod parse on hot paths; reads remain the safety
    // boundary. Enable this only for callers that write untrusted shapes.
    validateOnWrite?: boolean;
  } = {},
): PersistStorage<State> {
  const envelopeSchema = z.strictObject({
    state: stateSchema,
    version: z.number().int().nonnegative().optional(),
  });

  const accepted = new Map<string, StorageValue<State>>();
  const reading = new Set<string>();

  async function read(name: string): Promise<StorageValue<State> | null> {
    const raw = await backingStorage.getItem(name);
    if (raw === null) return null;

    let decoded: unknown;
    try {
      decoded = JSON.parse(raw);
    } catch {
      await backingStorage.removeItem(name);
      return null;
    }

    const result = envelopeSchema.safeParse(decoded);
    if (!result.success) {
      await backingStorage.removeItem(name);
      return null;
    }
    markValidatedPersistState(result.data.state);
    return result.data;
  }

  return {
    getItem: async (name) => {
      accepted.delete(name);
      reading.add(name);
      try {
        return await read(name);
      } finally {
        reading.delete(name);
      }
    },
    setItem: async (name, value) => {
      // A store that changes before hydration settles writes the defaults it started with.
      // Hydration then merges the stored state in memory without writing it back, so that
      // write would replace the stored state until the next change.
      if (reading.has(name)) return;
      const previous = accepted.get(name);
      if (
        options.skipUnchanged &&
        previous &&
        previous.state === value.state &&
        previous.version === value.version
      )
        return;
      let nextValue: StorageValue<State> = value;
      if (options.validateOnWrite) {
        const result = envelopeSchema.safeParse(value);
        if (!result.success) {
          accepted.delete(name);
          await backingStorage.removeItem(name);
          return;
        }
        nextValue = result.data;
      }
      if (options.skipUnchanged) accepted.set(name, value);
      try {
        await backingStorage.setItem(name, JSON.stringify(nextValue));
      } catch (error) {
        if (accepted.get(name) === value) accepted.delete(name);
        throw error;
      }
    },
    removeItem: (name) => {
      accepted.delete(name);
      return backingStorage.removeItem(name);
    },
  };
}
