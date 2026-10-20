# Web/Desktop performance backlog — 2026-10-20

Scope: `packages/app` web/Electron paths and `packages/desktop`. Native iOS/Android
work is deliberately excluded.

This is a working backlog, not a benchmark report. Line references are from the
current working tree and should be re-checked before editing. Impact labels are
estimates until the measurement named in each section is run.

Priority: **P0** = user-visible stalls on a common path, **P1** = significant
waste worth scheduling, **P2** = opportunistic cleanup.

## Completed

### Initial bundle: Mermaid runtime

Done in this pass.

- Mermaid's runtime HTML is now a dynamic import
  (`packages/app/src/components/markdown/fence/mermaid/iframe-runtime.web.tsx`).
  Requests queue until the iframe reports `bridgeReady`.
- The Mermaid runtime is a separate 3.58 MB chunk, fetched when a diagram mounts.

A parallel async locale loader was prototyped on this branch, but the upstream
sync brought `fc775b6 Load translations when their language is selected`. That
implementation uses a synchronous `BackendModule` plus
`partialBundledLanguages`: only the selected locale module is evaluated, while
all locale modules remain in the main bundle for offline use. It preserves the
provider contract (translations are ready before children render), so the async
loader and its test setup were dropped during the merge.

Measured with `npx expo export --platform web`:

|                       |       Before |           After merge |
| --------------------- | -----------: | --------------------: |
| Main JS               | 23,486,330 B |          19,924,120 B |
| Main JS gzip          |  5,190,143 B |           4,227,737 B |
| Mermaid runtime chunk |      in main | 3,579,024 B on demand |

An intermediate branch build reached 18,571,913 B raw / 3,965,270 B gzip with
async locale chunks. The merged result is larger because upstream keeps the
locale modules bundled, but the Mermaid saving remains: about 3.56 MB raw /
0.96 MB gzip off the startup path.

Verification: app and server typechecks, repo lint, repo format, relevant unit
tests, and the web export passed. Browser tests were not run because Playwright
Chromium is not installed in this checkout.

### Web streaming Markdown head/tail

Done in this pass.

- `MarkdownRenderer` now applies the mdast head/tail split on web as well
  (`packages/app/src/components/markdown/renderer.tsx`). Closed blocks render in
  a memoized head; only the unfinished tail re-parses per reveal frame.
- Completion reunites the parts, so native selection still sees one text view.
- Regression test: `packages/app/src/components/markdown/renderer.streaming.test.tsx`
  asserts the head does not re-render while the tail grows and that completion
  produces one renderer.
- Boundary discovery still runs once per completed line, not per frame. A single
  long block still carries its full parse cost.

### Replica cache budget and read path

Done in this pass.

- Row stores keep per-host row counts and UTF-8 payload byte totals beside the
  rows (`row-store.web.ts`, `row-store-sqlite.ts`). The cache hydrates from
  `readHostSummaries()` instead of `readAll()`, so the first write no longer
  loads every cached payload. Schema version 2 initializes the summaries.
- Cached reads persist only when an accepted change touches the requested rows.
  An unrelated stream or host write no longer forces a write before a cache hit;
  in-flight writes are tracked so a read still waits for a change it needs.
- Directory baseline replacement deletes the host's directory kinds in the
  store transaction (`replaceKinds`) instead of reading them into JS first.
- `serializeTimeline()` slices to the 50-item window before mapping.
- `TimelineReplicaOwner.timelineUpdated()` skips unchanged items/head/range
  commits, and the reducer only calls `onCommitted` when the tail, head, or
  cursor actually changed.
- Byte accounting uses `TextEncoder` with a code-unit fallback.

Verification: replica row-store contract tests cover summaries across apply,
overwrite, delete, rename, and clear; the replica, timeline, directory-sync, and
host-runtime suites pass.

### Persistence hot paths

Done in this pass.

- Persisted stores validate on read and serialize the in-memory state on write.
  Write validation is now opt-in (`validateOnWrite`); the state is schema-derived
  by the time it reaches the store, so hot paths no longer run a full Zod parse.
- Validated state carries a non-enumerable marker, and the workspace-layout
  `merge` consumes it instead of parsing the same blob again during hydration.
- The workspace-layout projection normalizes and strips each layout once per
  layout identity; a tab switch in one workspace reuses every other workspace's
  projection. Unchanged persisted slices still skip the write entirely.
- Draft and layout writes keep their existing throttling/skip behavior but no
  longer pay write-path validation.

Verification: validated-storage, workspace-layout, draft, panel, sidebar, review,
and browser-store suites pass.

### Bundle follow-ups: CodeMirror, xterm, route chunks

Done in this pass.

- CodeMirror moved to `file-pane/editor/view.web.impl.tsx`; `view.web.tsx` is a
  `React.lazy` wrapper with a small Suspense fallback. The editor chunk is 124 KB.
- The terminal emulator now imports `TerminalEmulatorRuntime` dynamically. The
  pane already keeps its stream subscription gated on `onRendererReadyChange`, so
  no output is written while the chunk loads. The xterm chunk is 899 KB.
- `extra.router.asyncRoutes` is enabled for web/Electron. Route screens load as
  their own chunks; native keeps synchronous route modules.

Measured with `npx expo export --platform web`:

|                      |       Before |        After |
| -------------------- | -----------: | -----------: |
| Initial JS raw       | 19,924,120 B | 18,375,264 B |
| Initial JS gzip      |  4,227,737 B |  3,801,223 B |
| On-demand xterm      |      in main |    899,167 B |
| On-demand CodeMirror |      in main |    124,440 B |

The static export was loaded in a browser: `/welcome` rendered, Settings and its
sections loaded their route chunks, and neither xterm nor CodeMirror was
requested until their surface opened.

## P0 — highest impact

### P0.1 Desktop socket/pipe/SSH frames are base64-encoded as if binary

**Evidence**

- `packages/desktop/src/daemon/local-transport.ts:414` checks
  `isBinary || data instanceof Buffer`. `ws` delivers text frames as a `Buffer`
  with `isBinary === false`, so every text message on socket/pipe/SSH transports
  takes the binary path.
- `packages/app/src/desktop/daemon/desktop-daemon-transport.ts:15-31` builds
  base64 with a per-byte character loop and decodes it per byte.
- `packages/app/src/desktop/daemon/desktop-daemon-transport.ts:175-183` encodes
  outbound binary frames the same way.

**Cost**

Every daemon message on those transports pays base64 encode + ~33% larger IPC
payload + decode. Terminal output is the hot path. The default `directTcp`
transport uses the renderer WebSocket and is unaffected.

**Fix**

- Branch on `isBinary` only; use `data.toString()` for text frames.
- Pass `Uint8Array`/`ArrayBuffer` through IPC structured clone instead of
  base64.
- If base64 must stay, use `Uint8Array.prototype.toBase64` or chunked
  `btoa` rather than a per-byte string loop.

**Impact/effort:** high for affected transports / low. **Measure:** terminal echo
latency over socket and SSH; IPC payload sizes.

## P1 — significant waste

### P1.1 Composer height measurement forces layout on every keystroke

`packages/app/src/composer/input/height.web.ts:58-82` calls
`getComputedStyle`, copies ~20 styles into a hidden mirror, sets its value, then
reads `scrollHeight`. `packages/app/src/composer/input/input.tsx:1806-1814`
calls it on every input change.

Fix: cache computed font/padding values (refresh on ResizeObserver/theme
change), measure the real textarea if possible, or coalesce measurement to one
per animation frame. **Measure:** `profile-composer-typing.mjs`.

### P1.2 Explorer toggle unmounts the dock and refetches listings

- `packages/app/src/components/split-container.tsx:695` conditionally renders
  the Explorer dock, so hiding it unmounts `FileExplorerPane`.
- `packages/app/src/components/file-explorer-pane.tsx:1560-1600` re-requests `.`
  plus every persisted expanded directory on mount, even when the session store
  already has the data.
- `packages/app/src/components/ui/overlay-scrollbar/use-overlay-flat-list-scrollbar.web.tsx:22`
  sets React state on every scroll event; the explorer forwards
  `scrollEventThrottle={16}` (`file-explorer-pane.tsx:1332-1334`).

Fix: keep the dock mounted and hide it like other retained panels, or skip
initialization when `directories` already has entries; move the scrollbar thumb
to a ref + rAF. **Measure:** `scripts/profile-explorer-toggle.mjs`.

### P1.3 Workspace shell renders too much per pointer/hover event

- `packages/app/src/components/split-container.tsx:495-550` sets a new drop
  preview on every `onDragMove`/`onDragOver`; `:641-642` wires it.
- `packages/app/src/screens/workspace/workspace-screen.tsx:1787` stores
  `hoveredCloseTabKey` at screen level; entering/leaving the ✕ re-renders the
  whole shell.
- `packages/app/src/screens/workspace/workspace-desktop-tabs-row.tsx:1346-1360`
  renders one hidden measurement `Text` per tab; `:1121-1132` builds a JSON
  signature on changes.
- `packages/app/src/screens/workspace/visible-agent-ids.ts:32-48` re-derives
  panes × tabs every render.

Fix: compare the resolved preview before `setState`, coalesce to one update per
frame, keep close-hover local to `TabChip`, use one reusable offscreen label
measurement, and `useMemo` the visible agent ids. React Compiler is enabled, but
these state-identity changes still cross its memo boundaries.

### P1.4 Live tool groups and history rows still do O(history) work per delta

- `packages/app/src/tool-calls/detail-level/grouping.ts:213-226` copies the
  whole historical group map and creates a fresh update map while a live group
  exists.
- `packages/app/src/agent-stream/history-row-revision.ts:28-50` maps over all
  virtualized rows, producing new array identities.
- `packages/app/src/agent-stream/strategy-web.tsx:762-774` reruns measurement and
  reading-position reconciliation whenever `segments` changes, including
  live-head-only ticks; `:443` reads `getBoundingClientRect()` during render.
- `packages/app/src/agent-stream/strategy-web.tsx:562-574` and `:956-996`
  measure all mounted virtual rows and `flushSync` from ResizeObservers.

Fix: return a composite live→history lookup instead of copying, publish
revisions only for groups that changed, return the previous row array when no
revision applied, key measurement on history identity, skip virtual-row
measurement for live-head growth, and cache content width from a resize effect.
**Measure:** `agent-stream/stream-tick.bench.ts` with a tool-heavy turn.

### P1.5 Directory sync, git status, and reconnect amplify RPCs and writes

- `packages/app/src/runtime/directory-sync/index.ts:486-493` loads and
  validates the cached directory before issuing the network fetch.
- `:646-657` calls `replaceDirectoryBaseline` after both refreshes, re-queuing
  every row that `commitSnapshot` already persisted.
- `packages/app/src/git/checkout-status-cache.ts:78-80` invalidates the commit
  list on every `checkout_status_update`.
- `packages/app/src/runtime/host-runtime.ts:2383-2393` runs the full reconnect
  invalidation set on every offline→online transition.
- `packages/app/src/data/push-router.ts:435,464` scans the entire TanStack query
  cache for every diff/terminal push.

Fix: start the network fetch concurrently with cache hydration; drop the
redundant baseline; invalidate commits only when HEAD/branch/ahead-behind
changed; debounce reconnect repair by offline duration; keep route→query-key
mappings instead of scanning. **Measure:** RPC counts during boot/reconnect and
while saving files.

### P1.6 Startup waits on non-critical storage and parsing

- `packages/app/src/runtime/host-runtime.ts:1637` awaits
  `projectIconCache.restore()` before `hostRegistryStatus = "ready"`.
- `packages/app/src/projects/icon-cache.ts:82-119` reads one JSON blob of base64
  icons and caps by entry count, not bytes; `:178-189` rewrites the whole blob on
  every flush.
- `packages/app/src/appearance/provider.tsx:186` returns `null` until settings
  load, so even the splash cannot render.
- `packages/app/src/plugins/evaluate.ts:465` `eval`s plugin bundles
  synchronously during the first catalog sync.
- `packages/app/src/runtime/host-runtime.ts:692-717` probes every saved
  connection of every host before the first screen is interactive.

Fix: don't await icon restore before marking the registry ready; render the
splash with the boot theme; add a byte budget and per-entry icon keys; evaluate
plugins in an idle callback; probe the preferred connection first and defer
fallbacks. **Measure:** time to splash resolution and time to first interactive
workspace.

### P1.7 Agent directory fanout rebuilds global indexes per event

- `packages/app/src/stores/session-store.ts:1501` rebuilds
  `workspaceAgentActivity` by scanning all agents on every `setAgents`.
- `packages/app/src/hooks/use-aggregated-agents.ts:106-111` deep-compares every
  agent and re-sorts the full list on every agents-map change; the hook is
  mounted at the root through the favicon status path.
- `packages/app/src/utils/workspace-agent-activity.ts:16-63` scans all agents.

Fix: update the activity index incrementally from the changed agent; scope the
favicon/attention selector to running/attention agents instead of building the
full sorted list. **Measure:** event-loop delay and render counts with 200+
agents.

## P2 — desktop and smaller items

### Desktop runtime

- **P2.1 Daemon log tail blocks the main process.**
  `packages/desktop/src/diagnostics/tail-file.ts:9` reads the whole file with
  `readFileSync`; `packages/desktop/src/daemon/daemon-manager.ts:372` calls it
  for `desktop_daemon_logs`, and
  `packages/app/src/desktop/hooks/use-daemon-status.ts:25-34` fetches status and
  logs together on every mount with `refetchOnMount: "always"`. Fix: bounded
  read from the end; split status/log queries. **Low effort, high value on
  multi-MB logs.**
- **P2.2 Window resize IPC storm.** `packages/desktop/src/window/window-manager.ts:225`
  sends an event per resize/fullscreen transition;
  `packages/app/src/utils/desktop-window.tsx:172-188` responds with two `invoke`
  calls and an unconditional state commit. Coalesce in main, include the
  booleans, bail when unchanged.
- **P2.3 Attachment copy/read/base64 round trip.**
  `packages/app/src/attachments/selected-file.ts:20-27` copies a file to managed
  storage, reads it back as base64, and decodes it for upload;
  `packages/app/src/composer/actions.ts:125-152` reads up to 50 MB per file.
  Read source bytes directly and pass typed arrays over IPC.
- **P2.4 Daemon status spawns a CLI process per probe.**
  `packages/desktop/src/daemon/daemon-manager.ts:229` falls back to
  `runExternalCliJsonCommand(["daemon","status",...])` when an instance file
  exists; `packages/app/src/hooks/use-is-local-daemon.ts:27` can poll every
  second when the daemon never reports a server id. Memoize the probe, share the
  in-flight promise, read pid/lock fields directly, and bound server-id polling.
- **P2.5 Multi-window transport broadcast.**
  `packages/desktop/src/daemon/local-transport.ts:85-89` sends every transport
  event to every window; each renderer discards other sessions. Record the
  owning `webContents.id` and send only to it.
- **P2.6 Browser store persistence on every URL/title/loading patch.**
  `packages/app/src/desktop/browser/store/index.ts:46-86` serializes all browser
  records through `sanitizeBrowsersForPersist` on each update. Debounce or
  persist only tab create/close/navigation settle.
- **P2.7 Console log array copy per message.**
  `packages/desktop/src/features/browser-automation/ipc.ts:210-215` allocates a
  new 200-element array for every console message. Trim in place only when over
  the cap.
- **P2.8 Login-shell environment blocks first window.**
  `packages/desktop/src/login-shell-env.ts:288-298` runs `spawnSync` of the
  login shell before `app.whenReady()`/window creation
  (`desktop-startup.ts:8-14`, `main.ts:1018-1022`). Make it async and await it
  only on the child-process launch path.
- **P2.9 Editor target discovery is sequential.**
  `packages/desktop/src/features/editor-targets/registry.ts:57-68` awaits each
  target's `isInstalled`/`describe`; `runtime.ts:59-91` probes PATH with sync
  `existsSync` and reads each icon. Parallelize and load icons lazily.
- **P2.10 Browser automation state for closed tabs.**
  `packages/desktop/src/features/browser-automation/snapshot-engine.ts:70-112`
  retains ref maps until `clearBrowser`; tab close never calls it. Add a
  `paseo:browser:forget` IPC on close or evict on guest `destroyed`.

### Small, cheap wins

- **P2.11 `JSON.stringify` equality in the session-store notification path.**
  `packages/app/src/panels/agent-panel.tsx:611,778` compares
  `projectPlacement` with `JSON.stringify` twice per store notification. Use
  `shallow` or explicit fields.
- **P2.12 Height cache hashes the revealed message during streaming.**
  `packages/app/src/components/message.tsx:970-972` calls
  `setAssistantMessageHeight` on every `onLayout`;
  `packages/app/src/utils/assistant-message-height-estimate.ts:22-66` FNV-hashes
  the whole text. Skip cache writes while `phase === "streaming"` and record the
  final height.
- **P2.13 Grapheme clamp scans the full target every reveal frame.**
  `packages/app/src/agent-stream/text-reveal.ts:95` runs
  `graphemeSegmenter.segment(text).containing(index)` while the reveal trails.
  Check code units around the boundary first; only fall back to the segmenter
  when the cut can split a cluster.
- **P2.14 `findItems` copies the whole timeline per delta.**
  `packages/app/src/agent-stream/view.tsx:1077-1080` concatenates tail + head on
  every head change; `chat-find/index.web.tsx:97-99` then updates history. Keep
  the arrays separate or cache a two-array view.
- **P2.15 History-page merge is O(page × tail).**
  `packages/app/src/timeline/session-stream-reducers.ts:229-253` uses
  `findIndex` per hydrated item. Build an identity/message-id index once per
  merge.
- **P2.16 Sidebar context value changes identity every provider render.**
  `packages/app/src/hooks/use-sidebar-workspaces-list.ts:195-201` returns a
  fresh object; `packages/app/src/components/sidebar/sidebar-model.tsx:178-204`
  puts it in the context value. Memoize the returned object or drop `list` from
  the value deps.
- **P2.17 Each sidebar row subscribes to the whole label catalog.**
  `packages/app/src/components/sidebar/sidebar-workspace-row-content.tsx:127`
  uses `useWorkspaceLabelDefinitions`, which selects `state.hosts` (all hosts)
  in `packages/app/src/workspace-labels/index.ts:107-115`. Select only the row's
  host snapshot, or pass the resolved definitions down.
- **P2.18 Explorer rows re-render on selection.**
  `packages/app/src/components/file-explorer-pane.tsx:946-1025` puts
  `selectedEntryPath` in `renderTreeRow`; rows are plain components. React
  Compiler may mitigate this; if profiling shows it, pass selection through item
  data/`extraData` and memoize the row.
- **P2.19 Changes tree uses default windowing.**
  `packages/app/src/git/changed-files-tree.tsx:139-148` has no
  `initialNumToRender`/`windowSize`; `DiffFolderRow` is not memoized. Match the
  file explorer's FlatList settings.
- **P2.20 Banned `useUnistyles()` calls in warm subtrees.**
  `packages/app/src/components/file-explorer-pane.tsx:1155` and
  `packages/app/src/components/resize-handle.tsx:49` subscribe to every
  Unistyles runtime change. Move colors to leaf components or
  `StyleSheet.create`.
- **P2.21 Over-cap assistant messages re-segment on every store tick.**
  `packages/app/src/components/assistant-message-render-limit.web.ts:19-27`
  segments the whole message to find the cut. The boundary is fixed per message
  identity; compute it once.
- **P2.22 `measuredRowHeights` is never pruned.**
  `packages/app/src/agent-stream/strategy-web.tsx:360,740` retains geometry for
  every row ever mounted, including replaced timeline epochs. Bound it or clear
  it on epoch change.
- **P2.23 Plugin timeline transforms deep-clone changed items.**
  `packages/app/src/plugins/timeline/projection.ts:97-101` calls
  `cloneAndFreeze(source)`; a running tool call with large `detail` is re-cloned
  each tick. Clone only on mutation, or copy-on-write.
- **P2.24 Heartbeat fires from `wheel`/`touchstart` events.**
  `packages/app/src/hooks/use-client-activity.ts:77-82` and
  `client-activity-tracker.ts:67-73` check the throttle on every wheel event.
  Keep `recordUserActivity`, but drive immediate heartbeats from a trailing
  timer.
- **P2.25 Plugin bundles are `eval`'d synchronously at first catalog load.**
  `packages/app/src/plugins/evaluate.ts:465-469` and
  `plugins/registry.ts:106-110` run during the startup burst. Defer to an idle
  callback or evaluate lazily when a plugin surface is rendered.
- **P2.26 Legacy replica DB delete runs every cold start.**
  `packages/app/src/runtime/replica-cache/index.ts:1550-1557` waits for
  `deleteDatabase("paseo-replica-cache")` on every boot. Record a migration flag
  in the new DB's `meta` store and skip after the first run.

## Already optimized — preserve these

Do not "fix" the following without reading the linked docs; they are deliberate:

- Terminal coalescing, worker-side output batching, snapshot backpressure, and
  the barrier-write queue (`docs/terminal-performance.md`).
- Agent stream coalescing, paced reveal, first-sight-complete rendering, layout
  item identity caching, history virtualization, and the reducer's one-commit-
  per-frame batching (`docs/agent-stream-performance.md`).
- Retained panels, hidden-chat freezing, mounted-tab caps, and Reanimated
  resize previews.
- Sidebar group caps and the workspace-structure selector.
- AOT inbound WebSocket validation and the protocol's pure wire schemas.
- React Compiler is enabled and handles many local memoization cases; focus on
  work that crosses React boundaries (DOM reads, parsing, storage, IPC).

## Measurement recipes

- Bundle: `cd packages/app && npx expo export --platform web`, then inspect
  `dist/_expo/static/js/web/`.
- Typing: `npm run profile:composer-typing --workspace=@getpaseo/app`.
- Explorer toggle: `npm run profile:explorer-toggle --workspace=@getpaseo/app`.
- Workspace switching/tabs: `profile-workspace-switching.mjs`,
  `profile-workspace-tabs.mjs`.
- Stream smoothness: `PASEO_AGENT_STREAM_PERF_E2E=1` browser spec; pure JS cost
  with `npx vitest bench --project unit src/agent-stream/stream-tick.bench.ts`.
- Terminal: `npx tsx scripts/benchmark-terminal-latency.ts`; browser specs under
  `PASEO_TERMINAL_PERF_E2E=1`.
- Production daemon: `daemon.log` `ws_runtime_metrics` (`eventLoopDelay`,
  buffered amounts, git limiter stats).

## Suggested order

1. Desktop transport and log tail (P0.1, P2.1).
2. Composer height and Explorer retention (P1.1, P1.2).
3. Shell interaction and history revision work (P1.3, P1.4).
4. Directory/git/reconnect amplification (P1.5).
5. Startup gates and agent-directory fanout (P1.6, P1.7).
6. Remaining P2 items as touch-time cleanup.
