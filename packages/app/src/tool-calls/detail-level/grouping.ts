import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import type { StreamItem, ToolCallItem } from "@/types/stream";

export interface ToolCallDescriptor {
  detail: ToolCallDetail;
  name: string;
  status: "executing" | "running" | "completed" | "failed" | "canceled";
  error: unknown;
  metadata?: Record<string, unknown>;
}

export interface ToolCallRun {
  id: string;
  calls: readonly ToolCallItem[];
  latest: ToolCallItem;
  isSealed: boolean;
}

export interface GroupedHistory<TGroup> {
  tail: StreamItem[];
  groupsByHostId: Map<string, TGroup>;
  pendingCalls: readonly ToolCallItem[];
}

export interface GroupedToolCalls<TGroup> {
  tail: StreamItem[];
  head: StreamItem[];
  groupsByHostId: ToolCallGroupLookup<TGroup>;
  historyGroupUpdatesByHostId: ToolCallGroupLookup<TGroup>;
}

export interface ToolCallGroupLookup<TGroup> {
  readonly size: number;
  get(id: string): TGroup | undefined;
  has(id: string): boolean;
  keys(): IterableIterator<string>;
}

const EMPTY_GROUPS = new Map<string, never>();

function createOverlayLookup<TGroup>(
  history: ToolCallGroupLookup<TGroup>,
  live: ToolCallGroupLookup<TGroup>,
): ToolCallGroupLookup<TGroup> {
  let extra = 0;
  for (const id of live.keys()) {
    if (!history.has(id)) extra += 1;
  }
  return {
    size: history.size + extra,
    get: (id) => live.get(id) ?? history.get(id),
    has: (id) => live.has(id) || history.has(id),
    *keys() {
      yield* history.keys();
      for (const id of live.keys()) {
        if (!history.has(id)) yield id;
      }
    },
  };
}

function sameRun(left: ToolCallRun, right: ToolCallRun): boolean {
  if (left.isSealed !== right.isSealed || left.latest !== right.latest) return false;
  if (left.calls.length !== right.calls.length) return false;
  for (let index = 0; index < left.calls.length; index += 1) {
    if (left.calls[index] !== right.calls[index]) return false;
  }
  return true;
}

export function describeToolCall(item: ToolCallItem): ToolCallDescriptor {
  if (item.payload.source === "agent") {
    const { data } = item.payload;
    return {
      detail: data.detail,
      name: data.name,
      status: data.status,
      error: data.error,
      metadata: data.metadata,
    };
  }

  const { data } = item.payload;
  return {
    detail: {
      type: "unknown",
      input: data.arguments ?? null,
      output: data.result ?? null,
    },
    name: data.toolName,
    status: data.status,
    error: data.error,
  };
}

export function isGroupableToolCall(item: StreamItem): item is ToolCallItem {
  if (item.kind !== "tool_call") {
    return false;
  }
  const descriptor = describeToolCall(item);
  return descriptor.detail.type !== "plan" && descriptor.name.trim().toLowerCase() !== "speak";
}

function createRun(calls: readonly ToolCallItem[], isSealed: boolean): ToolCallRun {
  const first = calls[0];
  const latest = calls.at(-1);
  if (!first || !latest) {
    throw new Error("Cannot group an empty tool call run");
  }
  return { id: first.id, calls, latest, isSealed };
}

function createHost(run: ToolCallRun): ToolCallItem {
  if (run.calls.length === 1) {
    return run.latest;
  }
  return { ...run.latest, id: run.id };
}

function isRunning(call: ToolCallItem): boolean {
  const status = describeToolCall(call).status;
  return status === "running" || status === "executing";
}

function appendRun<TGroup>(input: {
  calls: readonly ToolCallItem[];
  isSealed: boolean;
  output: StreamItem[];
  groups: Map<string, TGroup>;
  buildGroup: (run: ToolCallRun) => TGroup;
}): void {
  if (input.calls.length === 0) {
    return;
  }
  const run = createRun(input.calls, input.isSealed);
  const host = createHost(run);
  input.output.push(host);
  input.groups.set(host.id, input.buildGroup(run));
}

export function prepareGroupedHistory<TGroup>(input: {
  tail: StreamItem[];
  buildGroup: (run: ToolCallRun) => TGroup;
}): GroupedHistory<TGroup> {
  const output: StreamItem[] = [];
  const groups = new Map<string, TGroup>();
  let pending: ToolCallItem[] = [];

  for (const item of input.tail) {
    if (isGroupableToolCall(item)) {
      pending.push(item);
      continue;
    }
    appendRun({
      calls: pending,
      isSealed: true,
      output,
      groups,
      buildGroup: input.buildGroup,
    });
    pending = [];
    output.push(item);
  }

  appendRun({
    calls: pending,
    isSealed: true,
    output,
    groups,
    buildGroup: input.buildGroup,
  });

  return {
    tail: groups.size > 0 ? output : input.tail,
    groupsByHostId: groups,
    pendingCalls: pending,
  };
}

export function groupLiveToolCalls<TGroup extends { run: ToolCallRun }>(input: {
  history: GroupedHistory<TGroup>;
  head: StreamItem[];
  isTurnActive: boolean;
  buildGroup: (run: ToolCallRun) => TGroup;
}): GroupedToolCalls<TGroup> {
  const head: StreamItem[] = [];
  const liveGroups = new Map<string, TGroup>();
  let pending = [...input.history.pendingCalls];
  let hostPlacement: "history" | "head" | null = pending.length > 0 ? "history" : null;
  let pendingIncludesHead = false;

  const flush = (isSealed: boolean) => {
    if (pending.length === 0) {
      return;
    }
    const run = createRun(pending, isSealed);
    if (hostPlacement === "head") {
      head.push(createHost(run));
    }
    if (hostPlacement === "head" || pendingIncludesHead || !isSealed) {
      const existing = input.history.groupsByHostId.get(run.id);
      liveGroups.set(
        run.id,
        existing && sameRun(existing.run, run) ? existing : input.buildGroup(run),
      );
    }
    pending = [];
    hostPlacement = null;
    pendingIncludesHead = false;
  };

  for (const item of input.head) {
    if (isGroupableToolCall(item)) {
      if (pending.length === 0) {
        hostPlacement = "head";
      }
      pending.push(item);
      pendingIncludesHead = true;
      continue;
    }
    flush(true);
    head.push(item);
  }
  // Tool calls live in retained tail rather than the streaming head. The agent
  // lifecycle snapshot can still be idle while a newly received tool call is
  // already running, so its direct timeline status is the authoritative start
  // signal. The lifecycle state continues to keep completed calls live between
  // sequential tool updates.
  const trailingRunIsActive = input.isTurnActive || pending.some(isRunning);
  flush(!trailingRunIsActive);

  if (liveGroups.size === 0) {
    return {
      tail: input.history.tail,
      head: input.head,
      groupsByHostId: input.history.groupsByHostId,
      historyGroupUpdatesByHostId: EMPTY_GROUPS,
    };
  }
  if (input.history.groupsByHostId.size === 0) {
    return {
      tail: input.history.tail,
      head,
      groupsByHostId: liveGroups,
      historyGroupUpdatesByHostId: EMPTY_GROUPS,
    };
  }
  let historyGroupUpdatesByHostId: Map<string, TGroup> | null = null;
  for (const [id, group] of liveGroups) {
    if (!input.history.groupsByHostId.has(id)) continue;
    if (input.history.groupsByHostId.get(id) === group) continue;
    historyGroupUpdatesByHostId ??= new Map();
    historyGroupUpdatesByHostId.set(id, group);
  }
  return {
    tail: input.history.tail,
    head,
    groupsByHostId: createOverlayLookup(input.history.groupsByHostId, liveGroups),
    historyGroupUpdatesByHostId: historyGroupUpdatesByHostId ?? EMPTY_GROUPS,
  };
}
