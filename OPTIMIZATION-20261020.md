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

### Explorer retention work

Done in this pass.

- The desktop Explorer dock mounts on first reveal and then stays mounted when
  hidden or when focus mode takes over. The resize handle is only mounted while
  the dock is visible, and the retained panel receives `active` so its pane
  children stop running as active surfaces.
- `FileExplorerPane` skips its mount initialization when the session store
  already has the root directory, instead of requesting `.` and every persisted
  expanded directory again.
- The web overlay scrollbar keeps scroll metrics in a ref and commits React state
  at most once per animation frame. Disabled scrollbars no longer update state.

The hidden dock still stays in memory for the life of the workspace. That is the
intended tradeoff for preserving scroll, expansion, and selection state.

### Startup path work

Done in this pass.

- `loadFromStorage` no longer awaits `projectIconCache.restore()`. The host
  registry becomes ready first; the icon cache hydrates in the background.
- Icon restore is idempotent, does not replace a fresher query result, skips a
  legacy blob above twice the budget, and evicts by a 2 MB string budget as well
  as the entry cap.
- `AppearanceProvider` renders a themed logo while settings load instead of
  returning `null`; the boot theme is already seeded before React renders.
- First plugin-catalog installation waits for an idle callback, so bundle
  evaluation no longer runs in the first interactive turn.
- Probe cycles start the active or preferred connection first, then start
  fallbacks after the lead settles or 250 ms, whichever comes first.

The icon cache still persists as one blob per flush. Per-entry writes remain a
later improvement; the byte budget now caps what restore has to parse.

### Composer typing work

Done in this pass.

- The web composer caches the textarea's computed font and padding on its hidden
  mirror. The cache is invalidated by width changes, fullscreen presentation,
  root theme/class mutations, and font-load completion instead of calling
  `getComputedStyle` on every key.
- Measurements are coalesced to one per animation frame. A burst of keystrokes
  measures only the latest text.
- Empty text short-circuits to the minimum height instead of measuring.
- Rendered-line counting is only wired up for compact, non-fullscreen web
  composers. Desktop typing no longer pays for a line calculation it never uses.

The mirror still reads `scrollHeight` on each measured frame; that read is the
remaining forced layout, now capped at once per frame.

### Workspace shell pointer work

Done in this pass.

- Close-button hover is local to `TabChip`; the screen-level
  `hoveredCloseTabKey` state and its prop plumbing through the split tree and
  Explorer dock are gone. Hovering ✕ re-renders one chip.
- Drag previews keep the latest resolved values in refs for drop handling and
  commit shell state at most once per animation frame. Equal tab/pane previews
  do not produce a new commit.
- The tab-label track compares label arrays by value instead of
  `JSON.stringify`.
- `useVisibleAgentIds` memoizes its pane × tab derivation.

The per-tab offscreen measurement `Text` nodes remain; they now re-render only
when the tab set or labels change, not while the pointer moves or hovers.

### Desktop local transport frames

Done in this pass.

- The desktop transport branches on `isBinary` alone. `ws` text frames, which
  arrive as `Buffer` with `isBinary === false`, take `data.toString()` instead
  of base64 encoding.
- Binary frames cross Electron IPC as `Uint8Array` in both directions. The
  renderer sends the typed array through `invoke` and receives the same shape
  from the event bridge; base64 encoding/decoding and its per-byte loops are
  gone.
- Tests cover both a text `Buffer` frame and a binary frame, plus text/binary
  sends through the renderer transport.

### Live tool groups and history rows

Done in this pass.

- `groupLiveToolCalls` overlays live groups on the prepared history map instead of
  copying it. Unchanged live groups reuse the prepared group object, and only
  groups whose run identity actually changed enter `historyGroupUpdatesByHostId`.
- `useRevisedHistoryRows` returns the input array when no revision applies. Compact
  mode keeps one cached row variant; regular mode no longer clones every row.
- The web viewport reads content width from a ResizeObserver-backed state instead of
  `getBoundingClientRect()` during render. Its layout effect now depends on the two
  history arrays, not the whole `segments` object, so live-head-only ticks skip
  virtual-row measurement and reading-position reconciliation.
- Measured row heights are pruned when their history identity leaves both segments.

### Directory sync, git status, reconnect, and push routing

Done in this pass.

- Agent directory hydration starts alongside the network request. The refresh waits
  for the cache only at commit time, so the cache baseline is still merged before the
  snapshot replaces the replica.
- `refreshAll` no longer calls `replaceDirectoryBaseline` after both refresh paths
  have already persisted their snapshots and deltas.
- Checkout commit caches are invalidated only when branch, base/upstream ref, or
  ahead/behind counts change; dirty-state-only pushes keep the cached commit list.
- Checkout-diff and workspace-terminal pushes use route-to-query-key indexes built
  during subscription reconciliation instead of scanning the whole query cache per
  event.
- Reconnect repair skips sub-second flaps. A longer offline period still invalidates
  checkout git and server-data caches, because pushes emitted while disconnected are
  gone.

### Agent directory fanout

Done in this pass.

- `setAgents` updates the workspace activity index incrementally. Only workspaces
  touched by a changed or removed agent are recomputed, and unchanged entries keep
  their identity.
- The favicon reads a single running/attention selector from the session store. It
  no longer builds and sorts the aggregated agent list just to choose an icon.
- Directory demand for the favicon selector is still acquired for each host.

### Desktop runtime follow-ups

Done in this pass.

- Daemon log tails read bounded chunks backwards, decode UTF-8 once after
  concatenation, and stop after enough newlines. The status and log queries are
  split; logs are fetched once per mount window instead of on every status remount.
- Window resize events are coalesced in the main process and carry fullscreen and
  maximized booleans. The renderer applies them directly and avoids two IPC reads
  per resize.
- File-picker and drag-drop attachments read source bytes directly and cross IPC as
  typed arrays. The managed copy + base64 decode round trip is gone from the upload
  path.
- Daemon status probes share an in-flight promise. Server-id polling backs off to a
  five-second ceiling while the daemon has not reported an id.
- Local transport events are sent only to the owning `webContents`; other windows no
  longer receive and discard them.
- Editor target discovery probes all targets in parallel.
- Closed browser tabs notify the automation registry, which drops their snapshot ref
  maps instead of retaining them until the host window closes.
- Browser automation console buffers trim in place instead of allocating a new array
  per message.

### Small app follow-ups

Done in this pass.

- Browser store persistence coalesces rapid URL/title/loading patches to one write per
  250 ms.
- Agent panel placement comparisons use deep equality instead of `JSON.stringify`.
- Streaming assistant messages skip height-cache writes until the final layout.
- Reveal boundary clamping handles ASCII, surrogate pairs, combining marks, ZWJ
  sequences, flags, and Hangul jamo without segmenting the whole target on every
  frame.
- Chat find receives tail and head arrays separately instead of concatenating the
  timeline per delta.
- History-page reconciliation indexes projected rows once per merge.
- Sidebar list results are memoized, and each workspace row subscribes only to its
  own host label catalog.
- Changes-tree lists use the file explorer's initial render, batch, and window sizes.
- Explorer and resize-handle colors moved out of `useUnistyles()` into themed icon
  wrappers and `StyleSheet.create`.
- Over-cap assistant messages reuse the first computed cap while text only appends.
- Heartbeats from wheel/touch activity are driven by a trailing timer.
- Legacy replica DB cleanup records a metadata flag and skips after the first boot.

## P2 — remaining

These are deliberately left for a later pass; the common paths above are already
covered.

- **P2.4 Daemon status probe.** In-flight sharing and server-id backoff are in place.
  Reading pid/lock fields without the CLI needs a daemon version source other than
  the status websocket.
- **P2.8 Login-shell environment.** The synchronous login-shell probe still runs
  before the first window. Moving it to an async spawn needs a shared readiness
  promise on the daemon launch path.
- **P2.18 Explorer selection rows.** Rows still receive `selectedEntryPath` through
  `renderTreeRow`. React Compiler mitigation is unmeasured; change only with a
  profile that shows the rerenders.
- **P2.23 Plugin timeline clone.** Running tool calls still deep-clone their detail
  payload before each transform. A copy-on-write DTO needs plugin API changes.

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

## Remaining order

1. Measure the completed paths before choosing another target: stream bench,
   terminal latency over socket/SSH, and daemon log/status probes.
2. Login-shell environment readiness (P2.8) if startup profiles still show the
   synchronous shell probe on the critical path.
3. Plugin timeline clone (P2.23) when a tool-heavy plugin setup shows detail cloning
   in a profile.
4. Explorer selection rerenders (P2.18) only if profiling still shows them after the
   React Compiler pass.
5. Daemon status direct lock reads (P2.4) once daemon version is available outside the
   status websocket.
