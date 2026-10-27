# Xiaohongshu adapter migration (0.9.0)

All Xiaohongshu observations, control discovery, input policy, transfer, conversion and publishing orchestration live in this package. Workflows use existing `browser.eval`, navigation, input and `browser.webmcp.exec` commands. They install no executable page runtime and require no Xiaohongshu transport in the application or extension core.

## Behavior migration

The earlier simplifications were implementation choices, not adapter limitations. The corresponding behavior has been migrated into workflows:

| Area | Package implementation |
| --- | --- |
| Navigation | Prefer the rendered exact-ID note/profile card, retain or merge access parameters, reject stale search results, and otherwise navigate in the bound tab. |
| Readers | Preserve field/media extraction and restore readiness waits for notes, search results, feeds and profiles. `read_page` remains an immediate read-only observation. |
| Filters and profile tabs | Reveal filters through site hover handlers, validate options before changing them, verify selections and observe refreshed results. Persist plain refresh evidence across calls. |
| Comments | Restore multi-round loading, scroll speeds, reply expansion/thresholds, target counts, progress, stopping reasons and diagnostics. Each loading call yields within a 12-second work budget. |
| Reply targeting | Accept `comment_id` or `user_id`, discover targets through loading/expansion, and retain search progress across calls (25 loading rounds, five expansion rounds, 90-second cumulative search budget). |
| Comment writes | Support target-note opening, wait for rendered evidence, and persist a submission journal before clicking send. Repeating the same `operation_id` or calling `action:"status"` observes the existing attempt without sending twice. Rendered evidence is not a server receipt or proof of authorship. |
| Likes | Restore target-note opening, bounded verification and a second click when a readable state remains incorrect. An unavailable post-click state stops further clicks. |
| Session | Restore scoped account-menu/portal fallbacks, delayed login panels, sign-out verification and challenge detection. Completing website verification remains manual, as before. |
| Input | Package helpers implement curved pointer movement, bounded randomized timing and paced text batches through generic browser input. Timing is bounded by workflow budgets; the private CDP bridge is removed. |
| Remote media | `transfer_remote_file` streams HTTP(S) sources into OPFS and resumes confirmed chunks through Range requests. Observed URL/ETag/Last-Modified changes and ignored/mismatched ranges stop the transfer. Source identity is stored with the OPFS metadata; servers without validators cannot establish byte-for-byte source stability. |
| Media preparation | `prepare_media` checks image/video signatures and converts other browser-decodable images up to 20 MiB / 40 million pixels into PNG. Publishing calls it automatically; converted IDs are reused. |
| Publishing | Restore operation/upload journals, recovery observations, batch topic/product configuration, first-topic-suggestion/plain-text fallback, product-search fallback, visibility, schedule and original declaration. Processing waits yield and can be continued. Final publication remains manual. |

These are implementation and fixture-test results. Live Xiaohongshu compatibility, large-file performance and account-specific controls still require regression testing; untested behavior is not classified as a capability gap.

## Confirmed generic capability boundary

The actual QuickJS adapter sandbox exposes browser commands, but no Bash, workspace filesystem or `fetch` global. A regression probe confirms these globals are absent and that `browser.exec("read-file", ...)` is rejected by the browser command parser. Therefore an adapter cannot directly turn an authorized workspace path into bytes with the existing API. This is the remaining confirmed gap compared with the old site-specific caller preprocessing.

The caller can still read the authorized file and invoke `begin_file_transfer` → `write_file_chunk` → `finish_file_transfer`; all page-side handling stays in the adapter. This preserves the complete upload task, with explicit caller composition instead of hidden argument rewriting. Remote browser fetches are also subject to the source's CORS/mixed-content rules; an actual failure is returned with caller fallback instructions. No particular source is classified as unsupported without testing it.

## File transfer

Use the same creator origin/tab throughout:

1. For remote media, call `transfer_remote_file({url, name?, mime?, size?})`. Resume a pending transfer using its `transfer_id` and the same URL. Supply metadata when headers do not establish it.
2. For local media, call `begin_file_transfer({name,mime,size})`, then send at most one returned `chunk_size` (1 MiB) at a time with `write_file_chunk({transfer_id,offset,base64})`. Advance only to the confirmed `next_offset`; only the final chunk may be smaller.
3. `finish_file_transfer({transfer_id})` validates the complete stored chunk set and returns `file_id`.
4. `publish_content` / `publish_video` with `{action:"upload",file_id}` validates/prepares the media and hands it to the file input. Use `wait` and `status` to observe website processing.

Exact duplicate chunks are idempotent; changed duplicates, skipped offsets and invalid lengths fail. Committed OPFS files survive refresh, expire after 24 hours and are serialized using Web Locks. Chunks are not accumulated in a `Uint8Array[]`. File assembly uses file-backed Blob parts and checks resulting file metadata. Quota is checked before begin and handoff.

Before handoff, metadata becomes `consuming`; afterward it becomes `consumed`. An interrupted handoff requires inspection and is never automatically repeated. Backing files remain until expiry because Chromium may read them asynchronously after input assignment. A supplied file is not evidence of successful website upload.

The schema permits 4 GiB. Near-limit memory, quota and site acceptance have not been tested; this is not a verified 4 GiB support claim.

## Publishing and recovery

`open` → `prepare` → transfer → `upload` → `wait` → `configure` → `resume` as needed → `status` → manual publication.

`open` returns the destination origin, exact tab ID and logical tool name as `data.continuation`. CreatorWeave refreshes the catalog after navigation and returns `continuation_tool` plus the destination's `page_tools`; subsequent calls must use the new origin's full tool name. Origin checks remain enforced. Discovery merges the SW adapter catalog so navigation tools do not depend on page proxy registration timing.

`reset` abandons the current operation journals and upload queue. It preserves existing page media, title/body text, settings and OPFS consumption tombstones; the result explicitly returns `page_cleared:false`, `media_preserved:true` and `text_preserved:true`. This does not discard a website draft; a consumed file ID is never silently handed off again. Inspect/remove rejected media in the site UI and transfer a new file if needed. Upload input acceptance is checked before handoff. `wait` reports visible errors, missing previews, and operations stalled beyond five minutes with a reset path. Editor configuration fails fast with `MEDIA_REQUIRED` while the upload page is empty.

`prepare` can store the draft fields, `operation_id`, and an ordered `file_ids` list. Upload checks the next expected file and observes previous previews before proceeding. Partial `configure` updates retain the prepared draft and already supplied media.

`configure` accepts `title`, `content`, optional `tags`, `products`, `visibility`, `schedule_at`, `is_original`, and `operation_id`. It stores steps and executes at most three per call. Continue with `{action:"resume",operation_id}`. Completed steps are not replayed. An interrupted step is reconciled from the visible draft when possible; otherwise the result requests inspection. `status` exposes the journal and upload observations. Completion of the queue means the steps ran, not that publication occurred.

Individual phases remain available: `topic` / `select_topic`, `visibility`, `schedule`, `original` / `confirm_original`, and `product` / `select_product` / `save_products`. Automatic topic selection preserves the old first-suggestion fallback; products retain the old first search-result fallback. Review selected identities in results and in the final draft.

## Verification

Package regression tests execute the real QuickJS runtime and browser command parser with browser/OPFS fixtures. They cover package contracts and snapshot limits, exact-tab composition, card navigation/tokens/staleness, delayed panels, single comment submission and recovery, author targeting, publishing queues, remote streaming, media signatures, transfer refresh/idempotency and the workspace-access boundary.

Isolated real Chromium with intercepted origins verifies remote streaming, signature checks, actual BMP decoding and PNG conversion, converted-ID reuse, file-input handoff and reading the resulting PNG bytes. Earlier Chromium checks also verified OPFS refresh recovery and duplicate consumption rejection. These fixtures perform no live-site interactions.

Run the relevant checks using the repository package scripts. When package-manager bootstrap is unavailable, the installed entrypoints are:

```sh
cd web
node node_modules/vitest/vitest.mjs run webmcp
node node_modules/typescript/bin/tsc --noEmit
cd ../browser-extension
node node_modules/wxt/bin/wxt.mjs prepare
node node_modules/typescript/bin/tsc --noEmit
node node_modules/wxt/bin/wxt.mjs build
```

## Edge compatibility investigation (2026-10-26)

Live page inspection and native UI actions confirmed these DOM differences. This was not an end-to-end invocation of the installed CW adapter; the revised workflow execution is verified separately by QuickJS/browser-command fixtures.

- Publishing tabs include off-canvas and `aria-hidden` duplicates with nonempty client rects. Control discovery now excludes these duplicates and near-transparent ancestors.
- Visibility opens when its content is clicked. The live menu uses `.d-options .custom-option`; the older option selectors match nothing. Both closed and already-open menus are covered, with a bounded render wait.
- Schedule state resides in the nested checkbox / `.d-switch-simulator`, not the outer `.d-switch`. Repeated configuration must not toggle an already enabled switch off.
- The original-declaration switch was disabled for the tested CC0 flower video. Workflows now report `ORIGINAL_UNAVAILABLE` without clicking disabled controls. Existing declarations are recognized from the nested checkbox. The enabled notice/confirmation branch remains unverified on the live site.
- After switching the profile to favorites, 30 old cards remained inside a `height:0; overflow:hidden` parent while the favorites panel contained seven different cards. Readers now reject descendants of clipped zero-size ancestors. The previous code scanned all matching cards rather than explicitly selecting the first feed container.

The comment-send timeout, exact comment-ID reply failure, and `read_comments(limit:100)` stall still require focused live reproduction; no public comments were submitted in this investigation. `search_notes` currently returns `navigated`, not a claim of ready search results. Likewise, `selection_verified` and `results_ready` deliberately represent different evidence. Tool availability is URL-scoped: profile tools and search filters are not registered on every route; changes on an unchanged URL require separate discovery diagnostics.
