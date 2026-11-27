# EO2Weave promo video — Codex prompt (video-shotcraft pipeline)

Copy everything below the line into Codex. It is self-contained.
Codex should have the video-shotcraft repo cloned locally at a known path
(e.g. `git clone https://github.com/Vincentwei1021/video-shotcraft`) and
node/npm/ffmpeg available.

---

## Mission

Produce a **~75-second product promo video for EO2Weave** using the
video-shotcraft pipeline (mode: **自主自由创作** — read
`references/pipeline.md` and follow the 8-stage workflow; do not use the
Ink Press template replacement flow).

Output: `out/eo2weave-promo-1080p.mp4` (1920×1080, 30fps, H.264).

## Product facts (all claims must match these — do not invent)

EO2Weave is an open-source (MIT) **browser-native AI workspace**:

- **Local-first**: files, conversations, settings live in the browser
  (OPFS + SQLite WASM). No backend, no tracking. BYOK — AI requests go
  directly from the browser to the provider the user configures.
- **Agent edits local files** through the File System Access API, with
  per-run inline diffs and one-click rollback. Every change is snapshot-safe.
- **WebMCP**: any website can expose agent-callable tools via the standard
  `navigator.modelContext` / `document.modelContext` API (a W3C Web ML CG
  draft, Chrome 149 origin trial). The companion browser extension discovers
  site tools automatically and the agent drives real logged-in sites.
- **Team runs** (new in v1.2.0): the user states one goal, a small team of
  agents (Explorer / Worker / Reviewer roles) works a shared task board
  (manifest + brief + ledger on a per-run board), and the main agent
  delivers one consolidated answer. Runs are recoverable across reloads.
- Runs in the browser: Pyodide Python, QuickJS runtime, Rust+WASM file ops.
- Repo: github.com/nutstore/eo2weave · Web app: weave.eo2suite.com

## Audience & placement

GitHub visitors, Reddit r/mcp + r/LocalLLaMA, Hacker News. These viewers
are allergic to marketing fluff and care about: local-first privacy,
open source, and the technical novelty of WebMCP. Tone: developer-credible,
show-don't-tell, no hype adjectives.

## Hard constraints

- Dark theme (matches product): bg `#0a0a0f`, blue accent `#3b82f6`,
  green `#22c55e`, red `#ef4444`, amber `#f59e0b`. Font: Inter/system sans.
- On-screen language: **English** (GitHub/HN/international audience).
  Max ~8 words per caption card.
- No fabricated features (no voice mode, no mobile app, no pricing, no
  fake benchmarks). The WebMCP origin-trial fact and the MIT license are
  real and may be stated.
- No real user data, no real third-party logos beyond what a browser
  mockup needs.
- Do not use the Nutstore / 怡氧 branding — open-source product only.

## Suggested story board (you may improve the shot mapping, but keep these beats and rough durations)

| # | Time | Beat | Suggested shot-card vocabulary (video-shotcraft references/shots/) |
|---|------|------|------|
| 1 | 0–8s | Hook: "Your AI writes code." / "But your files live in your browser." two-line contrast | `typography` (letterspace-materialize / text-as-mask) |
| 2 | 8–20s | Reveal: browser frame + editor left, EO2Weave sidebar right; agent "adds dark mode"; 3 file cards stamp ✓ modified | `ui-entrance/list-reveal` + `interaction/type-and-filter` typing rhythm |
| 3 | 20–35s | **Money shot**: inline diff lines animate in (green/red stagger), then Revert pulses and the diff plays backwards. Caption "Every agent change — reviewed, reversible." | `data/before-after-slider-scrub` (revert-as-reverse-scrub) + `effects/impact-feedback` |
| 4 | 35–50s | WebMCP: e-commerce grid mockup; floating panel lists site tools `search_products` / `add_to_cart` / `checkout` with green "registered" dots; agent calls `search_products {query:"mechanical keyboard"}` → results animate. Caption "Agents drive real logged-in sites — via an open web standard." | `interaction/type-and-filter` (call with typed args) + `effects/glow-flyline-moves` |
| 5 | 50–65s | Team runs: 3 agent rows (Explorer/Worker/Reviewer), task cards flow Todo→Running→Done staggered, one card flips "blocked" then resolves. Caption "One goal. A team of agents." | `ui-entrance/value-stagger-gradient` + `data/timeline-travel` |
| 6 | 65–75s | Privacy + CTA: 🔒 Files stay on your machine · 🔑 BYOK · 🌐 Open source MIT → logo "EO2Weave" + `github.com/nutstore/eo2weave` + `weave.eo2suite.com`, hold 3s | `opening/letterspace-materialize` + `outro` conventions, R1: wordmark holds ≥1s |

## Workflow requirements (from video-shotcraft pipeline.md — follow them)

1. **Stage 0**: write the product brief + requirement-to-execution decisions
   into a design spec file first.
2. **Stage 1**: produce a pure HTML/CSS styleframe page with 2–3 key frames
   at 1920×1080, screenshot-verify via Playwright/Puppeteer BEFORE writing
   Remotion code. Derive motion tokens from the brand axes (developer-tool =
   precise, restrained; avoid bouncy springs for text, prefer crisp bezier).
3. **Stage 2–3**: map beats to shot cards (table above is the starting point —
   swap cards if you find better fits in `references/shots/`), produce the
   分镜表 in the design spec (`| # | 时间 | 镜头 | 关键动效 |`), then proceed.
4. **Stage 5**: per-shot QA with `npx remotion still` at key frames into
   `out/qa/`, eyeball for overlap/occlusion, patch, re-still. Animated
   diff lines must be readable at 1080p (min body font 28px).
5. **Stage 6**: no BGM in the programmatic render (added at upload time);
   still respect silent-beat spacing at scene changes.
6. **Stage 7**: run the aesthetic-rules.md checklist and output the self-check
   report (编号 ✓/✗ + 位置) into the design spec.

## Verification (must all pass)

```bash
npx tsc --noEmit                          # in the Remotion project
npx remotion render src/index.ts EO2WeavePromo out/eo2weave-promo-1080p.mp4 --codec=h264
# Then confirm: duration 75s ±3s, all 6 beats present, captions ≤8 words,
# no layout overflow, diff lines legible.
```

## Deliverables

1. Remotion project source (working dir)
2. `out/eo2weave-promo-1080p.mp4`
3. `out/qa/` stills for each scene
4. The design spec file (brief, decisions, 分镜表, aesthetic self-check report)

## Do NOT

- Do not invent features (no voice mode, no mobile app, no pricing, no
  benchmark numbers).
- Do not use Nutstore / 怡氧 branding.
- Do not add audio/BGM to the render.
- Do not stop at stage 3 and ask for confirmation — the pipeline grants you
  autonomy through stages 0–7; make decisions and document them.
