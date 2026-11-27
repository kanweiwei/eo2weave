# Codex / Remotion prompt — produce the EO2Weave promo demo video

Copy everything below the line into Codex. It is self-contained.

---

You are producing a **60–90 second promo demo video** for EO2Weave, an open-source
browser-native AI workspace (local-first: files stay on the user's machine; agents
drive real logged-in websites via WebMCP; multi-agent team runs; inline file diffs
with one-click rollback).

You have no screen recording of the real product. **You will build the video
programmatically** — using Remotion (React + TypeScript rendered to MP4) so every
frame is deterministic and revisable. Do NOT use ffmpeg slideshows of static
images; build animated scenes with real UI mockups.

## Deliverable

1. A Remotion project in `promo-video/` at the repo root (gitignored build output).
2. Final render: `promo-video/out/eo2weave-demo-1080p.mp4` — 1920×1080, 30fps,
   60–90 seconds, H.264.
3. A 15-second vertical cut `eo2weave-demo-short.mp4` (1080×1920) for Shorts/Reels.
4. A README in `promo-video/` documenting how to re-render.

## Constraints

- **Language**: English on-screen text (it's for GitHub/Reddit/HN/international
  audience). Keep total on-screen text minimal — max ~8 words per card.
- **No fabricated product UI that lies**: mockups must be *plausible
  representations* of the real components described below (sidebar agent chat,
  file diff with green/red lines, multi-agent task board). Stylized is fine,
  fictional features are not.
- **No audio in the programmatic render.** BGM gets added at upload time from the
  YouTube audio library. Leave the last 1.5s of every scene change as breathing
  room for narration pacing.
- **Dark theme** (matches the product): background #0a0a0f, accent primary
  #3b82f6 (blue), success green #22c55e, danger red #ef4444, amber #f59e0b.
- Font: Inter or system sans. Bold for titles.

## Script (6 scenes, total ~75s at 30fps = 2250 frames)

### Scene 1 — Hook (0–8s, 240 frames)
Black screen → text fades in, one line at a time:
"Your AI writes code and edits files." (pause) "But it lives in a terminal,
and your files are in your browser?" → hard cut.

### Scene 2 — Product reveal (8–20s, 360 frames)
Animated mockup of the app: a browser window frame, left side a code editor
with a small React file, right side the EO2Weave sidebar panel. An agent
"typing" indicator appears, then a chat message: "Add dark mode to the
settings panel". Show 3 file cards appear one by one: `settings.tsx`,
`theme.ts`, `theme.test.ts` — each stamped ✓ modified.

### Scene 3 — Inline diff + rollback (20–35s, 450 frames) **the money shot**
Zoom into a diff view: green added lines and red removed lines animating in
line-by-line (stagger 6 frames). Then a "Revert run" button pulses, click
ripple, and the diff plays backwards (lines slide out). Overlay caption:
"Every agent change — reviewed, reversible."

### Scene 4 — WebMCP (35–50s, 450 frames)
Second mockup: a website (generic e-commerce grid) inside the browser, with a
small floating panel listing 3 tools the site registered:
`search_products`, `add_to_cart`, `checkout` — each with a green "registered
via WebMCP" dot. The sidebar agent calls `search_products` with a typed
argument `{ query: "mechanical keyboard" }` → result cards animate in.
Caption: "Agents drive real logged-in sites — via an open web standard."

### Scene 5 — Team runs (50–65s, 450 frames)
A task board mockup: 3 agent rows (Explorer, Worker, Reviewer) with task
cards moving left→right across columns (Todo → Running → Done), staggered.
One card flips to "blocked" briefly then resolves. Caption: "One goal.
A team of agents. One consolidated answer."

### Scene 6 — Privacy + CTA (65–75s, 300 frames)
Clean card on dark bg, three icon+line rows appearing staggered:
🔒 "Files stay on your machine" · 🔑 "Bring your own API key" · 🌐 "Open source, MIT"
Then logo text "EO2Weave" + `github.com/nutstore/eo2weave` +
`weave.eo2suite.com`. Hold 3s.

## Implementation notes

- Scaffold with `npx create-video@latest` (Remotion) or hand-roll the minimum:
  `remotion`, `@remotion/cli`, react, typescript.
- Components: `<Scene>`, `<CodeEditor>`, `<DiffLine>`, `<ChatBubble>`,
  `<ToolPanel>`, `<TaskBoard>`, `<Caption>` — build them as reusable React
  components with `useCurrentFrame()`-driven animation (spring() for entrances).
- Everything typed; no `any`. Lint clean.
- If a scene renders too dense at 1080p, reduce on-screen elements rather than
  shrinking font sizes (min body 28px).

## Verification (must all pass)

```bash
npx tsc --noEmit                 # in promo-video/
npx remotion render src/index.ts Demo out/eo2weave-demo-1080p.mp4 --codec=h264
# open the mp4 and confirm: 75s ±3s, all 6 scenes present, no layout overflow
```

Report: scene durations, final file size, and frame counts.

## Do NOT

- Do not invent product features that don't exist (no fake "voice mode", no
  mobile app, no pricing).
- Do not use the Nutstore / 怡氧 branding — this video is for the open-source
  repo (EO2Weave only).
- Do not render at higher than 1080p or add audio tracks.
