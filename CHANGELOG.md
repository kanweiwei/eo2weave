## [1.1.7] - 2026-09-18

### 🚀 Features

- *(web)* One-click export of full filtered conversation set in search_conversations card
- *(agent)* Enrich tool auth modal with structured context (args, file list, diff viewer)
- *(web)* Site footer with per-region operator and privacy entry
- *(web)* Sync-to-disk accepts optional snapshot summary
- *(extension)* WebMCP zero-tools guide with browser-state detection in popup
- *(extension)* Add pack:release script for store-ready zip with Codex OAuth kept
- *(web)* Default-trust external tools with unified settings card
- *(web)* User-facing conversation batch export with instant filtering
- Add word wrap keyboard shortcut (Alt+Z) (#26)
- *(web)* Virtual scrolling for conversation messages
- *(web)* Make the app installable - PWA install prompt + 192/512 icons
- *(extension)* Decouple store builds from Codex stripping via CW_STORE_BUILD
- *(web)* Export project model and usage costs
- *(web)* Wire usage export into ProjectHomeView for App Router layout
- *(web)* Offer store and zip install methods in extension guide
- *(native-host)* Allow Chrome Web Store extension ID in allowed_origins
- *(web)* Guide new users through model setup with select-model onboarding step
- *(web)* Dual-channel extension update banners and BrandButton variant hardening
- *(web)* Render docs center via App Router server components
- *(web)* Image generation single-track R1+R2 - remove /image command, add quick chip
- Exec offers in-flow native-host root authorization when none exists
- *(web)* Stale pinned-model detection with seen bookkeeping in stores
- *(web)* Flag delisted pinned models on provider cards with bulk cleanup
- *(web)* Show delisted badge in model quick switcher for stale pins
- *(web)* Skip exec approval prompts in YOLO mode
- *(web)* Use brand teal dot for Act mode in AgentModeSelect
- *(web)* Persist mount-folder onboarding skip across conversations
- *(edit)* Cascading fuzzy matching for old_text resolution
- *(web)* Inline iteration-limit stepper in the iteration hint bar
- *(settings)* Wire temperature into the main agent loop
- *(agent)* Add proactive image reading handoff
- *(i18n)* Localize proactive image reading
- *(web)* Auto-refresh OpenRouter model reference with manual override
- *(extension)* Query live Codex usage from /backend-api/codex/usage
- *(agent)* Inject per-root AGENTS.md beacon into system prompt
- *(welcome)* Persistent rich input with draft persistence and send gate

### 🐛 Bug Fixes

- *(web)* Include explicit directory entries in fflate-built zips
- *(extension)* Preserve zip paths and sanitize virtual chunks
- *(web)* Use support@eo2suite.com as privacy contact email
- *(i18n,web)* Name WebMCP in recipe opt-in prompt
- *(web)* Copy pyodide assets in dev so Python worker works on fresh checkout
- *(extension)* Resolve web_fetch relative links against the fetched page, not the app origin
- *(web)* Only show waiting indicator on the in-flight turn
- *(web)* Clear input optimistically on send and restore it when send is rejected
- *(web)* Keep conversation usage bar pinned above the scroll container
- *(web)* Settle auto-scroll to the real bottom after content grows
- *(web)* Stop intermittent EEXIST when copying pyodide into public
- *(web)* /docs/:lang 404 - language level missing from generateStaticParams
- *(web)* Keep streaming UI updating under continuous token streams
- *(web)* Reactive Virtuoso footer and dedup committed reasoning on long conversations
- *(extension)* Gate native_host_call by trusted sender origin
- Reference-count native-host scope revocation across projects
- *(skills)* Tolerate hand-written YAML in SKILL.md frontmatter
- *(web)* Stop recommending the browser extension on mobile devices
- *(layout)* Constrain model switcher width
- *(agent)* Intercept workspace-relative markdown links to open file preview
- *(file-viewer)* Render OPFS-only directories in file tree for native-host roots
- *(extension)* Detect DuckDuckGo bot-challenge and throttle to Baidu
- *(llm)* Never emit developer role for Chinese and dynamic providers
- Preserve original content in format diffs

### 🚜 Refactor

- *(web)* Remove FolderTipBubble folder-mount onboarding bubble
- *(skills)* Drop word-editor skill, move nol-editor to skill store
- *(agent)* Drop untrustedContentHint from call-side authorization

### 📚 Documentation

- Rebrand to EO2Weave and fix stale post-Next.js references
- *(extension)* Update package description to AI workspace positioning
- Replace creatorweave with eo2weave in READMEs

### ⚡ Performance

- *(web)* Count virtualization threshold in messages, resolve scroller in layout phase

### 🎨 Styling

- *(web)* Replace sidebar clear button text with broom icon

### 🧪 Testing

- *(web)* Use unprefixed i18n key in ToolAuthModal lazy-diff test
- Cover StreamingQueue batching (#20)
- Fix stale mocks and assertions after OPFS and multi-root evolution

### ⚙️ Miscellaneous Tasks

- Add root check script (#21)
- *(skill-store)* Rebrand CreatorWeave references to EO2Weave
- Consolidate changelog and generate from conventional commits
- Add automated release script
## [1.1.6] - 2026-09-01

### 🚀 Features

- *(opfs)* Delete git-ignored paths immediately instead of creating pending changes
- *(web)* Expand dropped folders into files via FileSystem handles
- *(web)* Unified tool authorization infrastructure (PR-1)
- *(web)* Per-call authorization for external tool calls (PR-2)
- *(web)* Sync-to-disk tool + remove exec silent flush (PR-3)
- *(web)* Conversation-scoped yolo mode (PR-4)
- *(web)* Show cost estimate in RMB on CN build with live FX rate
- *(web)* Keyless custom providers — Ollama support + user docs
- *(web)* List pending deletions in sync-to-disk approval + separate memory key
- *(extension,web)* Side-panel recipe opt-in prompt (jmail.world / JMessage)
- *(extension,web)* Douban Movie WebMCP recipe + side-panel recipe re-probe

### 🐛 Bug Fixes

- *(build)* Dereference symlinks when copying static assets
- *(web)* Route sidebar new chat through route owner
- Stop misclassifying Dockerfile/Jenkinsfile as binary on edit
- *(web)* Show YOLO option outside side-panel mode (PR-4 follow-up)
- *(web)* Review P1 fixes — auth-state cleanup + page-action remember (PR-4 follow-up 2)
- *(web,i18n)* Locale-aware authorization modal body + dragdrop spinner text
- *(i18n)* Act mode copy said full access — it is confirmed-per-operation now
- *(web)* AgentRichInput reset effect must not clear assets on editor creation

### 🚜 Refactor

- [**breaking**] Remove WASM plugin system and Rust build pipeline
- [**breaking**] Remove relay server, remote control and session sync
- *(web)* Close all remaining review follow-ups (auth redesign)

### 📚 Documentation

- *(web)* Tool authorization redesign design doc + test adaptation

### ⚙️ Miscellaneous Tasks

- Remove mobile-web app and all references
- Remove unused Vercel deployment leftovers
- Add overseas AKS deployment (weave.eo2suite.com)
## [1.1.5] - 2026-08-28

### 🚀 Features

- *(skills)* Add discoverable skill store
- *(agent)* Add skill discovery tools
- *(skills)* Add xlsx to wiki workspace skill
- *(skills)* Add audio transcription skill
- *(agent)* Render mermaid diagrams
- *(agent)* Manage queued message edits
- *(agent)* Add file tool timeouts
- *(skills)* Add scoped secret configuration
- *(sync)* Add snapshot retention controls
- *(skills)* Add change documentation skill
- *(agent)* Batch updates for providers, streaming, snapshots, tooling
- *(flow)* Add visual workflow canvas
- *(markdown)* Add rendered file preview
- *(agent)* Add generation guidance
- *(agent)* Rename python execution tool
- *(extension)* Improve installation guidance
- *(agent)* Improve mermaid diagram controls
- *(agent)* Run bash in a worker
- *(native-host)* Replace FS Access disk IO with Rust native host
- *(extension)* Prepare store build - strip Codex OAuth, new icons, privacy pages
- *(popup)* Rename to eo2weave, show discovered WebMCP tools
- *(extension)* Per-host WebMCP authorization with popup switches and invoke gate
- *(popup)* WebMCP group hierarchy with per-group authorization
- *(webmcp)* Extension becomes single source of truth for authorization
- *(webmcp)* Enforce authorization at discovery time — disabled tools do not exist
- *(webmcp)* Mcp-b style push discovery — static dual-world content scripts + tab registry
- *(webmcp)* Restore read-only host list on web settings page
- *(extension)* WebMCP recipes — user-enabled tool packs for non-native sites
- *(web)* Native-host liveness probe — gate UI and exec on a real ping
- *(extension)* Brand refresh — new eo2weave logo on icon + floating button
- *(extension)* Distinguish dev builds by name — EO2Weave Dev
- *(web)* Full backup import with credential & settings portability
- *(extension)* Runtime locale-based web-app URL selection
- *(web)* Rebrand to EO2Weave (怡氧知知)
- *(agent)* Get_page_tools side-panel fast path
- *(webmcp)* Jmail + jmessage web recipes
- *(folder-access)* Multi-root store + native-host executor + UI copy
- *(i18n)* Locale-aware gateway provider name
- *(i18n)* Locale-aware provider names + category ordering
- *(i18n)* LLMGatewayCard strings go through i18n
- *(i18n)* LLMGatewayCard fully localized
- *(native-host)* Windows support + single-file installer
- *(native-host)* Agent bridge (MCP) exposing WebMCP tools to external CLI agents
- *(popup)* Hide agent bridge card when native host is not installed
- *(export)* Add batch export for searched conversations
- *(web)* Scaffold Next.js App Router migration
- *(web)* Complete Next.js migration and smooth workspace loading
- *(privacy)* Add entry and clarify service coverage
- *(shared)* Extract @creatorweave/shared for web + extension reuse
- *(welcome)* Skip folder-mount step in side-panel mode
- Support ignored file styling and recursive directory deletion
- *(web)* Defer new-conversation creation until first message

### 🐛 Bug Fixes

- *(workspace)* Refresh roots after folder changes
- *(i18n)* Clarify auto-apply deletion policy
- *(agent)* Clarify vision capture state
- *(skills)* Pass configured secrets to sections
- *(sqlite)* Consolidate production migration at v14
- *(sqlite)* Repair compression columns in v15
- *(agent)* Stabilize mermaid rendering
- *(agent)* Center mermaid diagrams
- *(conversation)* Guard stale run completion
- *(sync)* Remove stale pending panel state
- Replace new Function() eval with direct import for locator synthesis; raise fallback maxTokens to 64K
- *(bash)* Preserve binary files in cross-backend cp/mv via binary RPC channel
- Replace new Function() eval with direct import for locator synthesis; raise fallback maxTokens to 64K
- *(exec)* Stop embedding command in auth-modal description
- *(bash)* Preserve binary files in cross-backend cp/mv via binary RPC channel
- *(tools)* Stop envelope headers polluting file content on read/write round-trip
- *(popup)* WebMCP panel observability + i18n placeholder handling
- *(popup)* Widen panel to 360px and restore host header row layout
- *(webmcp)* Refresh count reflects authorized tools only
- *(extension)* WebMCP pipeline hardening — dedup, ghost tabs, soft nav success, window scoping
- *(sync)* PendingSyncPanel reads roots from folder-access store
- *(settings)* Hide empty custom group; drop MiniMax (China) suffix
- *(settings)* Drop MiniMax (International) suffix too
- *(settings)* Tab sidebar too narrow for "浏览器扩展" label
- *(web)* ActivityHeatmap stats overflow + ExecPolicyPanel allow subcommand args
- *(side-panel-button)* Set box-sizing:border-box so 32x32 stays 32x32 on YouTube
- *(web)* Route search to native-host roots so disk-backed projects are searchable
- *(web)* Suppress folder tip bubble when a local folder is already mounted
- *(ls)* Route native-host root paths to disk scanner with OPFS overlay merge
- *(export)* Include images & attachments in conversation export
- *(file-tree)* Add refresh button per root in multi-root mode
- *(settings)* Scrollable tab sidebar on short viewports
- *(backup)* Close SQLite worker before OPFS export to stop NotReadableError; stream zip to avoid large-file OOM
- *(backup)* Spill zip to OPFS temp file, re-slice 1MiB push chunks, skip recompressing archives to eliminate Array buffer allocation failed
- *(backup)* Retry reading picked backup zip on transient NotReadableError before restore
- *(installer)* Chmod +x mac dist scripts
- *(bridge)* Quote binary path in mcp add commands (spaces broke codex spawn)
- *(backup)* Stream import via OPFS staging dir so multi-GB backups restore without OOM
- *(settings)* Round panel size values to integers (drag was persisting floats)
- *(backup)* Settle streaming import on entry-completion count, not write-tail drain (async worker decode race)
- *(workspace)* ListDir falls back to native-host disk via diskExec
- *(native-host)* Windows crash in exec_start + verbatim cwd bug
- *(codex)* Preserve long-running OAuth streams
- *(backup)* Restore large OPFS archives reliably
- *(onboarding)* Replace misleading step counts
- *(opfs)* Record directory pending deletes so empty dir trees sync to disk
- *(opfs)* Defer spill cleanup to fix backup download race
- *(agent)* Clear stale exec-auth popups across loop lifecycles
- *(llm)* Use system role for bigmodel.cn fallback models; refresh OpenRouter snapshot
- *(workspace)* Avoid false conflicts on OPFS-only drafts
- *(layout)* Avoid setState-during-render in preview-resize cleanup
- *(web)* Use 'vs' instead of 'light' for Monaco theme in SkillFileEditor
- *(web)* Keep SkillSection primary action pinned to the right edge
- *(workspace)* Gate WelcomeScreen flash on folder-hydration and project-store readiness
- *(sidebar)* Conversation order only changes on new message, not on click
- *(web)* Make tsconfig.json strict JSON for EdgeOne Makers deploy
- *(web)* Localize document title, PWA manifest and html lang by deploy region
- *(web)* Stop root-page redirect from racing side-panel launch routing
- *(extension)* Launch side panel with a real query string for App Router
- *(sqlite)* Guard fs_ops.delete_mode migration and never downgrade user_version
- *(web)* Derive extension latest version from browser-extension/package.json

### 💼 Other

- Rename extension display name to EO2Weave
- EO2Weave casing in extension README title
- Use 怡氧知知 as the zh_CN display name
- Move Supported Sites entry above the capability status line
- Split dev and prod extension output directories
- *(gateway)* Rename provider to Nutstore AI in English UI
- *(extension)* V1.2.0
- Remove legacy singular /workspace 308 redirect
- Fix workspace writeFile classifying overwrites as create

### 🚜 Refactor

- *(agent)* Remove legacy workflow system
- *(folder-access)* Replace dynamic imports with static
- *(agent)* Simplify question card options
- Remove scheduled task feature
- *(settings)* Simplify extension management
- *(webmcp)* Web app becomes read-only view of extension-managed authorization
- *(webmcp)* Strip web settings page down to connection status
- *(web)* Group settings dialog tabs into 5 labeled sections
- *(web)* Move DeepSeek to first position in Chinese provider group
- *(web)* Retire legacy client router, finish App Router migration
- *(extension)* Switch imports to @creatorweave/shared
- *(edit)* Make read-before-edit advisory and render failed edits clearly

### 📚 Documentation

- Add CreatorWeave design system
- *(readme)* Rewrite extension README — WebMCP integration guide, reorder features, mark Codex as community-version
- *(extension)* README rewrite — WebMCP integration guide, distribution-aware structure
- *(extension)* Rewrite README — WebMCP integration guide, distribution matrix, Codex de-emphasis
- README links to single canonical domain per language
- Condense STATUS.md
- Restructure docs center into zh/en bilingual layout
- Add backup & migration user guide (zh/en)
- Agent bridge (MCP) macOS build & test guide for contributors
- Use bash prefix for mac dist script
- Address reader as developer, not coworker
- Warn about quoting spaces in mcp add path
- *(status)* Record Next.js App Router migration as shipped

### ⚡ Performance

- *(agent)* Improve prompt cache reuse
- *(agent)* Remove duplicated tool prompt docs

### 🎨 Styling

- *(agent)* Refine conversation controls
- Refine semantic design tokens

### ⚙️ Miscellaneous Tasks

- Ignore native host installer build artifacts
- *(web)* Stop tracking generated public/ build artifacts
- Remove tmp/wr-modified.ts from index, ignore tmp/, add pre-commit guard
- Translate code comments from Chinese to English
- *(status)* Trim STATUS.md to shipped-vs-pending
- *(web)* Remove PWA install prompt component
- 移动 edgeone.json 到 web 目录（Makers 部署配置随 web 构建目录）
## [1.1.4] - 2026-08-03

### 🚀 Features

- Add image generation selector to mobile menu
- *(web)* Harden subagent runtime
- *(web)* Extend conversation search
- *(web)* Export assistant replies
- *(web)* Add agent completion notifications
- Select API mode for custom providers
- *(extension)* Add localized save status
- Enhance agent activity experience
- Enhance workspace navigation experience
- *(agent)* Add interactive HTML previews
- *(agent)* Add safe run-end auto-apply
- *(web-fetch)* Support secrets and raw API responses

### 🐛 Bug Fixes

- Align screenshot input accessory
- Remove direct OPFS sync prompt
- Preserve tool results before queue yield
- *(web)* Distinguish export action icon
- Bundle Monaco workers locally

### 🚜 Refactor

- Remove legacy agent mode switch
- Remove text-to-speech support
- Remove default model editing
- *(sync)* Simplify snapshot approval flow

### 📚 Documentation

- Document side panel notification limitation

### 🎨 Styling

- Refresh theme color tokens
- Normalize text colors
- Tone down section headings
- De-emphasize cache token usage
- Refine assistant turn footer

### ⚙️ Miscellaneous Tasks

- *(web)* Remove react scan diagnostics
- Pin pnpm version
## [1.1.2] - 2026-07-23

### 🚀 Features

- *(agent)* Move side-panel page context from system prompt to user message
- *(agent)* Improve model provider configuration
- *(secrets)* Add project-scoped secret manager
- Add side panel page actions and screenshots

### 🐛 Bug Fixes

- *(sqlite)* Backoff init + retry OPFS open on sync-handle contention
- *(topbar)* Keep mobile panel open while Radix popper is open
- *(agent)* Default createConversation titleMode to 'auto'
- *(input)* Pin hint overlay, allow chip wrap, simplify labels
- *(assets)* Delete files on first click
- *(extension)* Wait for API key storage initialization
- *(codex)* Use extension model metadata
- *(sqlite)* Coordinate OPFS access across tabs
- *(sqlite)* Serialize initialization and transactions
- *(search)* Keep explicit providers strict
- Isolate untrusted tool error content

### ⚙️ Miscellaneous Tasks

- *(settings)* Hide unused settings tabs
## [1.1.1] - 2026-07-14

### 🐛 Bug Fixes

- *(side-panel)* Offset floating button 8px from viewport edge

### 💼 Other

- *(extension)* V1.1.1

### 🚜 Refactor

- *(topbar)* Collapse mobile actions into "new chat" + more menu
## [1.1.0] - 2026-07-14

### 💼 Other

- *(extension)* V1.1.0
## [1.0.7] - 2026-07-14

### 🚀 Features

- Implement Phase 1 - Browser File System Analyzer
- *(mobile-web)* Add ConnectionContext and streaming thinking sync
- *(opfs)* Implement Phase 0 infrastructure
- *(opfs)* Implement Phase 1 core session management
- *(opfs)* Implement Phase 2 Store integration
- *(opfs)* Implement Phase 3 UI component integration
- *(opfs)* Implement Phase 4 Agent tool integration
- *(opfs)* Implement Phase 5 Testing and Documentation
- *(opfs)* Add storage management UI and session-conversation sync
- *(i18n)* Implement Phase 2 web project integration
- *(i18n)* Implement Phase 3 mobile-web integration
- *(i18n)* Implement Phase 4 web component migration
- *(i18n)* Implement Phase 5 mobile-web component migration
- *(i18n)* Add Japanese and Korean language support
- *(ui)* Migrate to shadcn/ui component library
- *(ui)* Add brand component library based on design specs
- *(config)* Add shared config package and migrate to teal color scheme
- *(ui)* Implement z-index layering system to fix stacking conflicts
- *(dev)* Integrate react-grab and update TopBar button styles
- *(i18n)* Add skills.empty key and update empty state UI
- *(remote)* Improve RemoteControlPanel and unify i18n
- *(storage)* Implement SQLite storage backend with OPFS support
- *(skills)* Implement on-demand skill loading with tool calling
- *(sqlite)* Add migration system with progress display and error UI
- *(mcp)* Add MCP service integration
- *(db)* Migrate to opfs-sahpool VFS for better reliability
- *(mcp)* Implement SEP-1306 Binary Mode Elicitation
- 优化文件遍历和发现性能，改进文件句柄恢复
- 添加 JavaScript 代码执行工具和快捷操作面板
- 添加数据可视化组件和拖拽文件上传功能
- Implement Phase 1 AI Workspace - Universal Natural Language Interaction
- Phase 2 - Enhanced Conversation, Code Intelligence, and File Comparison
- Phase 3 - Data Analysis, Visualization, and Batch Operations
- Phase 4 - Workspace Management, Polish, and Documentation
- Add multi-user scenario tools and Agent collaboration system
- Add data visualization tools for data analysts
- Add code analysis tools for developers
- Add i18n support for persona-based welcome screen
- Enhance command palette with comprehensive commands
- Enhance export functionality and fix agent loop tests
- Phase 5 core features - Session serialization, MCP providers, quality verification, PWA
- Phase 5 cleanup - 修复类型兼容性和测试断言
- Add complete PWA support with service worker management
- Add PWA install prompt integration
- Add cross-device session sync API
- Integrate SessionSyncDialog into Settings dialog
- Add multi-model selection UI with provider management
- Add Git integration module with isomorphic-git
- Add mobile layout components with responsive design
- Create GitPanel component with Log, Status, and Diff tabs
- 集成移动端响应式布局
- Implement gitAdd command for staging operations
- Implement gitCommit command
- Add staging UI and commit functionality to GitPanel
- Implement gitBranch command for branch management
- Implement gitCheckout command for branch switching and file restoration
- Implement gitMerge command for branch merging
- Implement gitFetch, gitPush, gitPull remote operations
- Add code review tool for static analysis
- Add test generation tool for Vitest test templates
- Add JSDoc/TSDoc parser for documentation extraction
- Add Markdown documentation generator tool
- Implement PDF report export functionality
- *(mobile)* Implement mobile file upload functionality
- Add Excel enhanced export functionality
- Add right-click context menu for file tree
- *(providers)* Add GLM-4.7 model option for Zhipu AI
- *(python)* Implement mountNativeFS for mounting local directories
- *(python)* Implement lazy loading filesystem for mountNativeFS
- *(agent)* Add copy buttons for tool call parameters and results
- *(copy-icon)* Integrate i18n for copy button labels
- *(sync)* Implement Phase 4 native filesystem sync features
- *(sync)* Refactor sync preview UI with UI components library
- *(sync)* Enhance sync preview with grouping, view modes, and auto-refresh
- *(project)* Remove default seed and adopt brand UI for project home
- *(project)* [**breaking**] Improve ProjectHome UI with dialog and z-index fixes
- *(web)* Add project/workspace scoped URL routing
- *(settings)* Support custom OpenAI-compatible providers
- Localize command palette and MCP settings; complete palette handlers
- *(llm)* Migrate to pi-ai with native routing and fallback
- *(agent)* Switch AgentLoop core to pi-agent-core
- *(web)* Add webcontainer project runtime and preview workflow
- *(webcontainer)* Redesign panel flow and directory picker
- *(workspace)* Enhance WorkspaceSettingsDialog with design polish
- *(conversation)* Support deleting loops with explicit title mode
- *(agent)* Add resilient context compression summaries with UI visibility
- *(deploy)* Add Vercel deployment configuration
- *(agent)* Persist and redesign context usage display
- *(agent)* Add soft-delete tool with pending workflow
- *(ui)* Add persistent storage status indicator to folder selector
- *(opfs)* Persist pending overlay in sqlite with checkpoint metadata
- *(agent)* Add checkpoint tools and fix opfs-only sync workflow
- *(conversation)* Add regenerate user message functionality
- Unify snapshot approval dialog and AI summary generation
- Add one-click review from change panels
- *(sync)* Add inline diff comments and copy review notes
- *(sync)* Add project snapshot panel and review panel entry updates
- *(opfs)* Add snapshot/review schema updates and switch sequencing tests
- *(preview)* Add file preview panel with element inspector
- *(preview)* Migrate file preview to Monaco Editor with Drawer layout
- *(agent)* Add multi-agent infrastructure with OPFS storage
- *(sidebar)* Support OPFS-only mode for file tree
- *(sync)* Allow approval without directory handle and track sync status
- *(sync)* Add UI for syncing unsynced snapshots when directory becomes available
- *(ui)* Update workspace wording and project home interactions
- *(i18n)* Complete Japanese and Korean translations
- *(agent)* Add agents VFS + robust regenerate/reject semantics
- Add agent mentions routing and management UI
- *(i18n)* Add agent translations and internationalize AgentRichInput
- Update glm flash model to glm-5.1-flash
- *(sync)* Redesign diff viewer with compact header and docked comment composer
- Add model thinking/reasoning mode with quick toggle
- *(web)* Add configurable agent loop max iterations slider
- *(search)* Add context snippets and worker metadata support
- *(agent)* Add Plan/Act mode system
- *(agent)* Complete Plan/Act mode system integration
- *(agent)* Enforce single-file edit safety with read snapshots
- *(topbar)* Add project quick switcher with Cmd+P shortcut
- *(git)* Enhance git tool with real diff computation and log filtering
- *(agent)* Implement Plan/Act mode switching with workspace isolation
- *(agent)* Delegate conflict handling to agent
- *(sync)* Check conflicts before approval, delegate to agent
- *(sync)* Check conflicts on approve button click in PendingSyncPanel
- *(sync)* Remove force_sync tool, improve conflict UX with diff view
- *(home)* Move docs entry to top hero actions
- *(sync)* Update pending file list and diff viewer
- *(project-home)* Add activity heatmap and fix i18n/typecheck issues
- *(sync)* Show conflict C badge in change panels
- *(sync)* Git operations for conflict tracking and overlay management
- *(agent)* P0+P1 anti-dead-loop protection for file tools
- *(agent)* P2 large file protection and edit hint
- *(sync)* Wire manual conflict resolution dialog into sync flow
- Add clear cache button to ProjectHome sidebar
- *(opfs)* Add baseline rollback and native rebind migration
- *(web)* Support OPFS-only runtime UX and capability checks
- *(web)* Add GitHub project entry to docs hub and project home
- *(web)* Improve mobile workspace layout and toolbar UX
- *(i18n)* Default locale from navigator.language
- *(agent)* Add GLM-5.1 model and set as default for GLM providers
- *(settings)* Support unlimited max iterations and add zh-CN pending sync copy
- *(preview)* Add docx file preview support using docx-preview
- *(skills)* Sync skill resources to OPFS for Pyodide access
- *(agent)* Add sync tool and skill OPFS sync for Pyodide
- *(git_restore)* Support empty paths and full OPFS discard
- *(git-diff)* Add working-mode text diff, render flags, and baseline reading
- *(agent)* Add subagent runtime tools and delegation prompt
- *(agent)* Add sqlite-backed subagent persistence and batch spawn
- *(agent)* Add subagent runtime stability hardening and CAS status transitions
- *(settings)* Add experimental features tab with batch_spawn toggle
- Add workspace rename and remove sync diff truncation
- Workspace archive, local pyodide, unload guard, sidebar fixes
- *(read)* Add read policy and source-aware workspace reads
- *(sync)* Add lazy hunk-based diff viewer with full editor toggle
- *(agent)* Add ask_user_question tool with interactive UI
- *(llm)* Add AbortSignal support to non-streaming chat
- *(agent)* Add undo/redo support to rich input editor
- *(export)* Add conversation export dialog with JSON/Markdown/HTML support
- *(agent)* Add #file mention in rich input and line comments in sync preview
- *(sync)* Enforce Conventional Commits format in snapshot summary prompt
- *(sidebar)* Add workspace pin/unpin with persistence
- *(opfs)* Expand text file detection with more languages and basename matching
- *(i18n)* Add workspaceStorage and skillDetail translation keys
- *(agent)* Add ⭐ recommendation marking guidance for ask_user_question options
- *(question-card)* Add custom free-text input to all choice types and improve answered state
- *(agent)* Add search_conversations tool for cross-workspace chat search
- *(assets)* Add file upload/attachment system with OPFS storage
- *(web)* Persist and restore input drafts across workspace switches
- *(agent)* Collect asset metadata when writing to vfs://assets/
- Add browser extension and web bridge tool
- *(web)* Smart auto-scroll that respects user scroll position
- *(settings)* Dynamic model list fetching from provider APIs
- *(web)* Add scroll-to-bottom floating button
- *(web)* Replace workspace hover buttons with context menu
- *(web)* Add HTML preview with source/preview toggle
- *(agent)* Add execution contract to system prompt
- *(web)* I18n toast messages and improve conversation error handling
- *(agent)* Offload long subagent output to asset file
- *(web)* Add workspace delete confirmation dialog
- *(web)* Multi-root project support (P0-P4)
- *(web)* Unify multi-root behavior and fix handle persistence
- *(agent)* Inject multi-root project path rules into system prompt
- *(agent)* Use workspace-scoped asset collection and add markdown preview
- *(ui)* Add per-workspace model switching and apply workspace preferences
- *(sync)* Stream AI summary generation with thinking disabled
- *(settings)* Refactor model/provider settings with dynamic model fetching
- *(ui)* Add command palette shortcut hints
- *(provider)* Add Responses API mode for custom providers
- *(provider)* Support fetching model list from custom provider API
- *(sync)* Send diff comments directly to AI instead of clipboard copy
- *(diff)* Multi-line selection and image zoom
- *(lightbox)* Improve image zoom with natural size detection and i18n
- *(workspace)* Wire go-to-file dialog and i18n locales
- *(settings)* Add pinned models system for provider model selection
- *(ui)* Add message navigation dots and bump base font size
- *(extension)* Add browser extension install guide and integration
- *(i18n)* Internationalize agent mode switch and remove unused review i18n
- *(extension)* Replace verify step with refresh page step
- *(conversation)* Persist streaming drafts on page unload to prevent content loss
- *(agent)* Show prompt/completion token breakdown instead of total in turn footer
- *(agent)* Add cache read token tracking and fix isProcessing to isLast
- *(workspace)* Persist per-project active workspace for restore on switch
- *(agent)* Provide OPFS workspace dir to subagent for transcript storage
- *(conversation)* Add branch-from-turn action to fork conversation history
- *(git)* Enhance git status/diff renderers and file preview
- *(ui)* Add input hints for file/agent mention and fix ListDirRenderer paths
- *(agent)* Add subagent health detection and auto-refresh agents list
- *(provider)* Add volcengine-coding provider
- *(python)* Auto-install openpyxl and python-docx via micropip when imported
- *(git)* Scope git_log and git_show to project-level across workspaces
- *(python)* Add Pyodide warmup on workspace load and fix pandas import crash
- *(ui)* Add Office file preview (xlsx, xls, pptx, ppt, doc) via eo2suite
- *(ui)* Add collapsible root headers in multi-root file tree sidebar
- *(ui)* Add SnapshotDetailDrawer for viewing snapshot file diffs
- *(assets)* Add asset inventory system with popover UI and i18n support
- *(ui)* Add text selection auto-copy and conversation action context
- *(extension)* Add popup page with API docs and PNG icons
- *(extension)* Add injection status indicator to popup
- *(ui)* Add lazy-load more button to file write preview
- *(ui)* Add git-diff-style inline line comments to file write preview
- *(ui)* Add fullscreen mode for file write preview with comments
- *(input)* Add forwardRef, Escape key handling and processing state to AgentRichInput
- *(conversation)* Add message queue system for sending while processing
- *(assets)* Add OCR text recognition and Vision API support for images
- *(agent)* Context-aware routing, improved sync diff viewer, and robust message persistence
- *(agent)* Improve streaming tool call rendering with partial JSON parsing
- *(extension)* Add Codex OAuth integration via browser extension
- *(agent)* Add /compact slash command for manual context compression
- *(skills)* Add builtin skills system with OPFS materialization and /mnt_skills mount
- *(webmcp)* Integrate browser WebMCP tool discovery/invocation and suppress duplicate registration warnings
- *(webmcp)* Add global toggle and improve Chrome WebMCP onboarding
- *(agent)* Add DeepSeek V4 model context window support
- *(tts)* Integrate Edge TTS via browser extension with offscreen document
- *(pwa)* Show user prompt before applying service worker updates
- *(tools)* Add pluggable format registry with NOL/ZIP handlers and overflow-to-assets
- *(skills)* Add nol-editor skill and support tab indentation in NOL handler
- *(nol)* Polish preview UI with indent guides, lightbox, and root header
- *(tools)* Add directory deletion support with recursive delete
- *(skills)* Refactor skill system to read builtin skills from OPFS
- *(ui)* Add file delete confirmation, download button, copy path, and batch reject
- *(python)* Mount builtin skills directory for Python execution
- *(search)* Support OPFS-only directories in search index
- *(i18n)* Add file delete and sync translations for all locales
- *(formats)* Add PDF format handler with canvas preview
- *(formats)* Add docx format handler and unify via format registry
- *(formats)* Add nbmx and ngm format handlers, block write/edit for read-only formats
- *(formats)* Add xlsx format handler with Univer sheet preview
- *(formats)* Improve docx handler with truncation strategy and overlay preview
- *(formats)* Add CSV format handler with table preview
- Add OCR tool for on-demand image text recognition
- *(webmcp)* Support streaming plugin downloads to disk and rewrite asset paths
- *(i18n)* Add download file translations for all locales
- *(tools)* Validate rootName prefix in multi-root workspace paths
- *(agent)* Add iteration limit reached UI with continue button
- *(image-gen)* Add /image command and migrate pi-ai to @earendil-works v0.78
- *(sync,pdf)* Add copy file content action and virtualize PDF viewer
- *(pdf)* Add text selection layer and improve page navigation
- *(skills)* Add cw:skill-creator builtin skill package
- *(agent)* Add bash shell tool with just-bash sandbox
- *(ui)* Add BashRenderer for bash tool terminal-style display
- *(agent)* Add bash usage guidance and document known limitations
- *(agent)* Add contextual hints in format handlers
- *(extension)* Add version checking and outdated banner
- *(webmcp)* Switch to on-demand tool loading mode
- *(word-editor)* Add XML validation gate and fix BOM corruption
- *(agent)* Add image generation tool with OPFS rendering
- Add LaTeX math rendering in MarkdownContent
- Make model field optional when creating custom provider
- Add file-level search result aggregation with title matching
- *(search)* Compact search results for LLM with on-demand detail loading
- *(search)* Load overflow search results from OPFS asset
- *(ui)* Add collapsible context summary card with framer-motion
- *(settings)* Add clear button for API Key input field
- *(project)* Make project name clickable to open project
- *(tts)* Add auto-play and queue indicator for TTS
- *(input)* Auto-convert large pasted text to file attachment
- *(mcp)* Show extension-required warning in MCP and WebMCP settings
- *(llm)* Inject provider-specific thinking/reasoning params
- *(tools)* Add ExternalToolRenderers for unified tool bridge
- *(image)* Add image format handler with enhanced preview
- *(assets)* Add clear all button with confirmation
- *(opfs)* Recognize mini program file extensions as text
- *(tools)* Add AI semantic search for external tools
- *(tools-panel)* I18n support for tools panel
- Add 坚果云 AI gateway provider & fix reasoning propagation
- *(sidebar)* Animate collapse/expand with framer-motion
- *(agent)* Add Probe→Plan→Execute→Reflect planning strategy
- *(agent)* Add disableThinking option for lightweight subagents
- *(tools)* Persist overflow metadata as companion .meta.json
- *(renderers)* Minimalist redesign of web_search / web_fetch
- *(providers)* Expose per-token pricing from /models endpoint
- *(agent)* Cumulative conversation usage bar with cost estimate
- *(agent)* Stream subagent steps into per-agentId draft state
- *(providers)* Add OpenRouter as builtin OpenAI-compatible provider
- *(skills)* Centralize slash command sync + project-aware skill scanning
- *(model-switcher)* Add cross-provider search + optimize key loading
- *(formats)* Add HTML preview handler and redesign QuestionCard
- *(search)* Auto-upgrade regex-like queries instead of erroring
- *(skills)* Rename cw: prefix to cw- and add OPFS-backed user skills
- *(skills)* Add VSCode-style SkillFileEditor with Monaco and rename support
- *(skills)* Add user skill drag-drop import and refactor drop zones
- *(skills)* Support .zip import and multi-skill bundle detection in UserSkillDropZone
- *(keyboard)* Add i18n for keyboard shortcuts and refine shortcuts help
- *(providers)* Enable LLM Gateway card for 坚果云 AI
- *(diagnostics)* Root ErrorBoundary + self-serve diagnostic report
- *(file-preview)* Edit mode + robust NotFoundError fallback
- *(backup)* Full OPFS zip export from ProjectHome sidebar
- *(schedule)* Add scheduled task system with cron expressions
- *(skills)* Live-read project skills from native FS
- *(schedules)* Gate schedule feature behind experimental toggle
- *(agent)* Add delegate_to tool for persona handoff
- *(skills)* Export as ZIP and import ZIP bundles
- *(providers)* Source pricing & context window from OpenRouter snapshot
- *(browser-extension)* Multi-provider search + SPA-aware web_fetch
- *(gateway)* Surface rate-limit / quota status on the LLM Gateway card
- *(agent-input)* Two-step Escape to clear editor content
- *(llm)* Assert Latin-1 safety on request headers
- *(file-preview)* Split mode, text-selection comments, manual refresh
- *(activity)* Dual docs/chats metrics with day-detail panel
- *(conversation)* AI-generated topic titles via current model
- *(agent-input)* Terminal-style ↑/↓ input history navigation
- *(model-switcher)* Collapsible provider groups with auto-expand current
- *(llm)* MiniMax thinking via reasoning_split + brand token in nav
- *(model-switcher)* Add "Manage LLM Providers" entry to popover
- *(markdown)* Add copy button to code blocks
- *(skills)* Show last-edited time on skill cards
- *(side-panel)* Workspace assistant with upstream page context

### 🐛 Bug Fixes

- *(ui)* Change language switcher from hover to click-based interaction
- *(ui)* Increase language switcher dropdown width to prevent text wrapping
- *(folder-selector)* Improve UX for folder selection
- *(chat)* Prevent streaming content overflow
- *(ui)* Improve dropdown dismiss, add SQLite recovery, fix API key loading
- *(sqlite)* Prevent data loss after long inactivity, fix API key state sync
- *(settings)* Prevent browser password save prompt on API key input
- *(a11y)* Add missing BrandDialogTitle for screen readers
- *(settings)* Prevent browser password save prompt on API key input
- *(remote)* Show only remote device count, remove role badge
- Add missing data-tour attributes to enable Onboarding Tour
- Resolve TypeScript errors and test fixes
- *(agent)* Remove text-right from user message bubble for proper Chinese text alignment
- *(python.tool)* Support both string and object formats for files parameter
- *(python.tool)* Update docs with micropip usage for external packages
- *(python)* Fix mountNativeFS reuse and mount point cleanup
- *(copy-icon)* Add visual feedback (checkmark icon) after successful copy
- *(python)* Skip syncfs during unmount for faster cleanup
- *(sync)* Properly integrate SyncPreviewPanel in WorkspaceLayout
- *(onboarding)* Save completion status and add i18n support
- *(storage)* Detect actual SQLite mode after initialization
- *(sqlite)* Prevent data loss on page refresh
- *(sqlite)* Recover from corrupted empty schema on startup
- *(sqlite)* Auto-recreate database on schema mismatch
- Improve SQLite migration and onboarding tour
- *(ui)* Improve dark mode readability and unify dialog/theme styling
- *(web)* Restore file preview panel and use extension-based text detection
- *(agent)* Make list_files path handling LLM-friendly
- Stabilize tool-call/result sequencing in UI state
- Stabilize pending sync preview and disable disk sync tool
- *(mcp)* Stop settings panel render loop and reduce status churn
- *(sync-preview)* Unify pending sync, permission recovery, and diff UX
- *(web)* Stabilize new conversation switch and remove fallback toast
- *(chat)* Stabilize streaming timeline and tool-call rendering
- *(agent-ui)* Remove duplicate pending loading bubbles
- *(webcontainer)* Stabilize panel flow and compatibility handling
- Prevent modal z-index override by scoping plugin z-index vars
- *(agent-loop)* Align pi event callbacks and ordering
- *(agent-loop)* Restore streaming start on update-first events
- *(pwa)* Suppress update notification with silent auto-update
- *(opfs)* Fallback to entry scan for quoted file names
- *(agent-ui)* Render draft bubble on subsequent streaming runs
- *(sync)* Align preview sync with files snapshot and pending cleanup
- *(sync)* Stop auto preview popup and show pending count badge
- *(agent)* Stabilize waiting/loading indicator across loop phases
- *(agent-ui)* Show waiting indicator when no active streaming
- *(agent-ui)* Prevent message bubble overflow clipping
- *(workspace)* Keep pending badge in sync after refresh
- *(conversation)* Keep partial stream and completed tool pairs on cancel
- *(read_directory)* Fallback to folder-access handle when context handle is missing
- *(search)* Classify path errors and tolerate transient file disappearance
- Resolve race condition in switchWorkspace and clean up io.tool
- Block approval when disk changes conflict with draft
- *(chat)* Support regenerate while running and preserve tool call args
- *(preview)* Refresh OPFS store when clearing changes
- *(preview)* Refresh OPFS store when adding changes from agent
- *(dialog)* Modal isolation, responsive width, and footer improvements
- *(layout)* ResizablePanels drag resize and conversation scroll fixes
- *(storage)* Make app reset clear local data without reload
- *(web)* Stabilize provider integration, workspace routing, and sqlite runtime
- *(web)* Request usage tokens for minimax streaming
- *(web)* Prevent workspace switch rollback from stale route sync
- Improve follow-up suggestion to be user-perspective
- Broaden follow-up suggestion to include requests/commands
- *(web)* Remove nested button in agent dropdown rows
- *(web)* Update agents store project id sourcing
- *(workflow)* Commit follow-up workflow updates
- *(store)* Remove premature draft commit in onMessageStart causing duplicate rendering
- Improve token usage display and toolbar layout
- *(pwa)* Correct service worker cache invalidation on deploy
- *(pwa)* Correct manifest loading on SPA sub-routes
- *(web)* Use absolute vite base path for nested workspace routes
- *(workflow-editor)* Render condition nodes without crashing
- *(agent)* Use available glm flash model for follow-up generation
- *(search)* Support OPFS-only mode and file path search
- *(settings)* Avoid repeatedly forcing custom model mode
- *(agent)* Align read/edit snapshot semantics
- *(agent)* Preserve messages when canceling and improve context compression
- *(opfs)* Prevent HMR triggers during file sync
- *(docs)* Unify sidebar behavior and pin back-home action
- *(sync)* Remove auto AI summary on sync approval
- *(project-home)* Prioritize recent activity for continue work
- *(write)* Classify existing disk files as modify in pending changes
- *(sync)* Allow no-op edit and materialize unresolved conflict markers
- *(read)* Harden binary/base64 handling and max_size validation
- *(opfs)* Prefer disk for non-pending reads and evict stale cache
- *(agent)* Improve context compression summary quality
- *(sqlite)* Remove silent fallback to memory mode causing multi-tab desync
- *(project)* Add cross-tab sync via BroadcastChannel
- *(sqlite)* Stabilize multi-tab project consistency
- *(agent)* Stream and normalize think-tag reasoning
- *(storage)* Harden app reset against legacy rehydrate and tab locks
- *(minimax)* Clamp temperature for OpenAI-compatible requests
- *(ui)* Clarify WelcomeScreenV2 input enabled vs disabled states
- *(reset)* Preserve api keys when clearing local app data
- *(web)* Align file-edit normalization with claude-code
- Isolate agent mode per workspace
- Unblock quality gates and wire sync/prefetch follow-ups
- *(agent-tools)* Clarify vfs agent id errors in tool results
- *(agent)* Support unicode @mention routing for agent ids
- *(web)* Add edgeone middleware fallback for spa routes
- *(web)* Add cloud-function spa fallback for edgeone upload
- *(web)* Workspace data not loading on mobile refresh
- *(web)* Resolve lint errors and i18n test regressions
- *(web)* Remove external Google Fonts imports
- Skip service worker registration in dev by default
- Prioritize mobile continue-work and harden activity heatmap labels
- *(i18n)* Correct sync panel translation key prefixes
- *(agent)* Add retry hint with suggested max_size for large file reads
- *(i18n)* Memoize useT to prevent unnecessary re-renders
- *(agent)* Stabilize context compression across turns
- *(loop)* Stabilize compression timeline rendering and stop diagnostics
- *(ui)* Normalize compression timeline ordering and avatar display
- *(ui)* Keep pending indicator on active assistant turn
- *(ui)* Restore bot avatar for streaming draft state
- *(read)* Enforce char limit on sliced output and keep max_size as file-size guard
- *(i18n)* Add unlimited-iterations labels and dedupe zh-CN pending sync keys
- *(sync)* Align pending file list i18n keys with settings namespace
- *(ui)* Improve user message bubble width alignment
- *(agent)* Honor unlimited maxIterations setting
- *(agent)* Use model context window in usage display instead of effective budget
- *(skills)* Rescan and persist full skill resources
- *(python)* Mount OPFS files/ to /mnt so Python output syncs to OPFS
- *(preview)* Fallback to OPFS when file not yet synced to disk
- *(opfs)* Read files from OPFS even when not in filesIndex
- *(python)* Improve tool description and package error hints
- *(ls)* List from OPFS files/ instead of native filesystem
- *(pyodide)* Always remount /mnt and serialize fs mount ops
- *(agent)* Ls glob fallback to native FS and support dot-directory matching
- *(agent)* Glob mode merges both native FS and OPFS sources
- *(web)* Resolve conversation view typecheck errors
- *(web)* Resolve conversation view typecheck errors
- *(subagent)* Stabilize runtime status transitions and transcript persistence
- *(ls)* Match exact unicode filename patterns in glob mode
- *(sync)* Avoid misleading no_files when paths already exist in OPFS
- *(skills)* Sync updated SKILL.md from disk on workspace open
- *(agent)* Improve subagent tool call display and test robustness
- *(sync)* Use native FS mtime as baseline for Python-detected changes
- *(sync)* Skip no-op mtime changes when content is identical
- *(sync)* Use binary comparison to avoid encoding round-trip issues
- *(sync)* Filter out OS metadata files during OPFS scans
- *(skills)* Use JSON envelope and remove category headings from prompt
- *(skills)* Prioritize skill usage over ad-hoc approaches in prompts
- *(skills)* Break infinite scan loop caused by skillsStore.skills in useEffect deps
- *(pyodide)* Proxy missing .whl packages from CDN in dev mode
- *(sidebar)* Show full workspace name on hover when truncated
- *(sync)* Prevent monaco DiffEditor model disposal error
- *(agent)* Enforce /mnt/ prefix for Python file paths in OPFS
- *(skills)* Handle binary skill resources correctly
- *(workspace)* Clear stale pending preview state on context switch
- *(sync)* Stop remove action from opening diff preview
- *(search)* Resolve nested single-file paths in worker
- *(workspace)* Treat detected add as modify when native file exists
- *(hooks)* Fix useUnloadGuard pending check and agent running detection
- *(conversation)* Drop completed draft steps during restart
- *(edit)* Honor read snapshot source when re-reading workspace file
- *(edit)* Resolve native handle fallback for workspace edits
- *(conversation)* Keep completed streaming steps visible until message end
- *(sync)* Detect conflict resolution edits and update baseline mtime
- *(sync)* Rebuild files index after syncing files to OPFS
- *(agent)* Hide stale compression steps from previous loop iterations
- *(sync)* Require selection for approve button and support aborting AI summary
- *(project)* Delete OPFS directory when removing a project
- *(workspace)* Remove file change detection toast notification
- *(sync)* Correct missing closing quote in file size CSS class
- *(app)* Prevent infinite re-render loop in route sync effect
- *(project)* Return cleanup function from setupProjectSync
- *(file-tree)* Clear stale OPFS data when workspace is switched or removed
- *(agent)* Improve search_conversations snippet readability
- *(i18n)* Add missing en-US keys for pin/unpin workspace
- *(file-tree)* Auto-reload tree when pendingChanges or cachedPaths change
- *(sqlite)* Repair message migration and legacy history backfill
- *(web)* Resolve TypeScript typecheck errors
- *(web)* Add proper i18n keys for QuestionCard component
- *(store)* Debounce message persist to prevent SQLite transaction conflicts
- *(sqlite)* Serialize message persistence transactions
- *(pyodide)* Fetch wheels from CDN via SW fallback
- *(skills)* Sync .skills to explicit workspace during conversation switch
- *(python)* Recover worker queue and recreate on runtime errors
- *(python)* Avoid re-entrant FS lock deadlock on repeated runs
- *(sync)* Support trailing ** glob when syncing files
- *(web)* Multi-root change detection and file mention improvements
- *(tools)* Resolve multi-root paths in search tool
- *(tools)* Resolve multi-root paths in sync tool
- *(tools)* Search all roots when no path specified
- *(fileTree)* Include root prefix when copying paths in multi-root mode
- *(sidebar)* Move rename to inline hover button group
- *(git)* Use multi-root aware file reader for diff operations
- *(file-reader)* Resolve root prefix in multi-root fallback paths
- *(i18n)* Simplify workspace delete confirmation message
- *(search)* Resolve root-name-only path correctly in multi-root mode
- Resolve two TypeScript errors
- *(tools)* Propagate projectId from ToolContext for multi-root path resolution
- *(compression)* Persist compression baseline and fix context_summary role mapping
- *(project)* Sync active project after refresh
- Correct skill resource routing and root-aware python paths
- Block /mnt paths in non-python tools
- Auto-refresh models after saving API key
- Auto-rewrite /mnt paths for non-python tools
- Isolate inline editor attachments and align attach button
- *(settings)* Remove auto-switch on adding custom provider
- *(conversation)* Persist and retain context usage after run completion
- *(sidebar)* Correct archive/unarchive context menu toggle
- *(nav)* Restore MessageNavBar with scrollIntoView-based navigation
- *(subagent)* Write notification events directly to spawn step
- *(workspace)* Use last-accessed order instead of pinned order for active selection
- *(agent)* Dedup streaming steps against committed content and allow re-send unchanged edits
- *(agent)* Hide stale compression steps and sort runtime steps by timestamp
- *(settings)* Sync global hasApiKey state after saving or deleting API key
- *(sync)* Add system prompt to commit message generation for cleaner output
- *(agent)* Preserve LLM emission order in timeline rendering
- *(ui)* Truncate conversation title in storage dropdown header
- *(i18n)* Update thinking-off label to show state instead of loading text
- *(conversation)* Rename branch to fork and update i18n
- *(vfs)* Catch errors in AgentBackend.exists() instead of throwing
- *(input)* Intercept Enter key when agent mention suggestion is showing
- *(search)* Handle V2 envelope errors in search renderer
- *(ui)* Show all registered tools in ToolsPanel drawer, not just 6 hardcoded ones
- *(ui)* Adapt WebRenderers to tool envelope V2 format
- *(workspace)* Resolve native file paths correctly in multi-root setups for snapshots
- *(vite)* Change Cross-Origin-Embedder-Policy from require-corp to credentialless
- *(workspace)* Resolve projectId from workspace DB record instead of global activeProject
- *(search)* Strip root prefix from overlay keys for multi-root consistency
- *(file-preview)* Use local monaco-editor bundle instead of CDN
- *(vfs-resolver)* Preserve fragment (#) in path segments
- *(agent)* Propagate LLM provider errors instead of silent completion
- *(ui)* Improve file write preview text wrapping and layout
- *(ui)* Improve file edit diff preview text wrapping
- *(routing)* Add hash prefix to preview window.open URLs
- *(ui)* Simplify search summary header and truncate long queries
- *(conversation)* Avoid Immer read-only error when attaching collected assets
- *(conversation)* Reconcile message snapshots and persist on error
- *(agent)* Improve context trimming calibration and token usage accuracy
- *(conversation)* Allow queued message consumption after AbortError cancellation
- *(workspace)* Include root folder in # file mention suggestions
- *(agent)* Relax context compression minimum group threshold and simplify calibration
- *(conversation)* Prevent stale callbacks and duplicate messages after cancel
- *(conversation)* Evict committed draft entries to prevent duplicate messages
- *(agent)* Document Pyodide network limitations and pyodide.http alternatives
- *(ui)* Close project switcher dropdown after switching project
- *(agent)* Use user role for context_summary messages
- *(agent)* Add multi-root path resolution in search tool
- *(i18n)* Fix codex error i18n key paths and add ja-JP translations
- *(extension)* Improve codex-oauth provider registration flow
- Cache-bust extension download URL with build ID
- *(extension)* Add type=module to popup script tag
- *(extension)* Show remaining percentage in usage bar instead of used
- *(ui)* Improve scroll behavior and nav bar dot sampling
- Resolve ~90 TypeScript errors across 30 files
- *(agent)* Add multi-root path hints for git_diff
- Optimize useSQLiteMode polling to stop once mode is resolved
- *(workspace)* Require rootName prefix in multi-root path resolution
- *(webmcp)* Use provider-safe tool names for LLM function calling
- *(ext)* Ignore internal TTS offscreen messages in background listener
- *(webmcp)* Improve tab discovery reliability in service worker context
- *(pwa)* Prevent duplicate service worker update toasts after reload
- *(ui)* Navigate to branched conversation after forking
- *(workspace)* Handle ghost delete records without baseline gracefully
- *(agent)* Abort in-flight LLM stream on iteration limit
- *(opfs)* Handle ghost deletes and cleanup empty directories after sync
- *(sqlite)* Graceful fallback for compression columns before migration v8
- *(skills)* Remove appVersion short-circuit and improve TableNode API
- *(webmcp)* Make plugin download methods optional for backwards compatibility
- *(export)* Remove tool content truncation in conversation export
- *(python)* Show both input/output line counts in tool summary
- *(folder)* Ensure ProjectRoot record exists after setting directory handle
- *(pwa)* Auto-activate waiting service worker instead of showing redundant toast
- *(gotofile)* Show no-access hint when file index is empty
- *(python)* Add mutex to serialize concurrent Python execution
- *(bash)* Improve tool description to be neutral and accurate
- *(build)* Prevent rollup from statically analyzing just-bash
- *(subagent)* Keep completed tasks in store for status/query access
- *(agent)* Enforce rootName prefix in all tool paths
- *(build)* Shim node:zlib to unblock rollup bundling of just-bash
- *(agent)* Auto-detect encoding in AssetsBackend read
- *(settings)* Handle optional model param in createCustomProvider
- *(search)* Keep all hits for single-file search, compact only multi-file
- Prepend root prefix to search hit paths
- *(provider)* Add onPayload hook for Codex API compatibility
- *(provider)* Also strip temperature for Codex API
- *(settings)* Persist autoPlayTTS setting to storage
- *(model-fetcher)* Prefer OpenRouter top_provider.context_length
- Batch spawn toggle reactivity and OPFS mount auto-recovery
- *(usage)* Show accumulated token usage across turn messages
- *(tts)* Properly stop and clean up audio playback
- *(file-tree)* Handle directory load errors gracefully
- *(search)* Hint AI to prefer English keywords for code search
- *(tools-panel)* Correct search input text color
- Improve binary file detection and Python worker timeout handling
- *(ls)* Handle non-existent directory with clear error message
- Remove regenerate confirmation toast, regenerate immediately
- *(i18n)* Update rate limit message to mention quota exhaustion
- *(skills)* Mark imported skills with 'user' source
- *(skills)* Preserve skill on re-save when slug unchanged
- *(agent)* Preserve subagent tool calls on cancel
- *(types)* Resolve all remaining TypeScript typecheck errors
- *(question)* Recover orphaned ask_user_question on page refresh
- *(workspace)* Strip rootName prefix when reading native file in multi-root
- *(workspace)* Preserve original timestamps on idempotent ensure
- *(file-tree)* Allow browsing files in new projects without active workspace
- *(llm-gateway)* TokenHub-compatible disable-thinking + restore session on reload
- *(storage)* Expose SQLite init failures instead of silent fallback
- *(workspace)* Make WorkspaceManager the single source of truth for SQLite rows
- *(webmcp)* Distinguish same-domain WebMCP tools by tool group and fix tab routing
- *(storage)* Add export-before-reset and simplify db failure UI
- *(llm-gateway)* Harden token refresh against 401 and localStorage loss
- *(workspace)* Stabilize sidebar order across refreshes
- *(workspace)* Preserve hasDirectoryHandle across initialize()
- *(ls)* Fall back to OPFS when dir only exists in workspace cache
- *(workspace)* Re-derive hasDirectoryHandle in initialize catch path
- *(app)* Re-run syncFromRoute when project loading completes
- *(project)* Keep isLoading true until workspaces loaded
- *(workspace)* Use multi-root handle lookup in switchWorkspace
- *(folder-access)* Self-heal SQLite project_roots drift
- *(webmcp)* Support document.modelContext and unify WebMCP page detection logic
- *(opfs)* Strip rootName prefix when directoryHandle override is provided
- *(agent-input)* I18n the drop-files-here overlay text
- *(bash)* Preserve UTF-8/CJK through just-bash 3.0.2 byte pipeline
- *(workspace-layout)* Drop stray showPreviewPanel call in preview-request effect
- *(message-nav)* Improve rail clarity + register missing color shades
- *(typecheck)* Clear 10 pre-existing type errors
- *(extension)* Sync side-panel toggle + scrub PII from comments

### 💼 Other

- Preserve expanded directories when refreshing file tree
- Convert migration progress messages to English
- Add explicit /mnt path rewrite guidance for non-python tools
- *(ui)* Show code in Python tool detail during execution and no-output states

### 🚜 Refactor

- *(agent)* Improve ReasoningSection interaction consistency
- *(components)* Remove unused legacy components
- *(remote-badge)* Redesign with status area | actions layout
- *(ui)* Export only brand components, hide internal shadcn/ui
- *(skills)* Migrate SkillsManager to brand components
- *(session)* Use brand components in SessionBadgeWithStorage
- *(ui)* Use brand components in RemoteControlPanel and LanguageSwitcher
- *(ui)* Migrate FileTreePanel and Sidebar to brand design system
- *(ui)* Make Sidebar and FileTreePanel more compact
- Unify session/conversation terminology to workspace
- *(db)* Rename session to workspace in database layer
- *(db)* Remove migration code and add SQL logging
- Refactor Pyodide integration with dynamic import and auto package detection
- *(python)* [**breaking**] Remove wrapper from executeWithTimeout
- *(python)* Remove outputFiles bridging feature
- Unify folder permission management with folder-access.store
- *(ui)* Unify toolbar tooltips and icon button styles
- *(agent-tools)* Align recommendation names with registry
- *(agent-tools)* Converge search + enforce snake_case params
- *(agent-tools)* Remove deprecated grep/advanced_search implementations
- Make plugin API naming brand-agnostic
- Decouple internal identifiers from product branding
- *(agent)* Unify core tools and update policy/hooks integration
- *(wasm)* Rename module from browser_fs_analyzer to file_stats
- *(agent)* Rename file_edit tool to edit and fix vitest env
- *(agent)* Remove thread mode and stabilize conversation flow
- *(search)* Require explicit mode and reject regex-like literal queries
- *(io)* Remove deprecated offset/limit params in favor of start_line/line_count
- Unify conversation deletion flow across UI
- *(agent)* Replace checkpoint terms with snapshot review workflow
- Remove undo functionality from workspace system
- Unify sidebar module design and allow approval without directory
- *(layout)* Move file preview to top with vertical split
- *(layout)* Restore file preview to Drawer mode
- *(welcome)* Remove unused persona selection UI
- *(agent)* Remove AgentBus stub
- *(agent)* Align tools with workspace terminology
- *(opfs)* Replace legacy session module with workspace runtime
- *(storage)* Rebuild sqlite migration/reset plumbing
- *(store)* Migrate runtime state from session to workspace context
- *(agent)* Simplify AgentRichInput UI
- *(store)* Extract commitDraftToMessages to deduplicate tool call commit logic
- *(agent)* Unify workspaceId routing across all tools
- *(pwa)* Remove update banner component
- *(settings)* Update model settings panel layout
- *(tools)* Unify directory handle resolution with OPFS fallback
- *(llm)* Dedupe normalizeBaseUrl helper
- *(conversation)* Centralize draftAssistant state transitions
- *(home)* Keep single docs hub entry
- *(activity)* Redesign heatmap with theme-aware colors and proper tooltip
- *(agent)* Replace read_directory with ls
- *(agent)* Unify io tool envelopes and error codes
- *(sidebar)* Unify resource panel header height
- *(agent)* Split agent loop into focused modules
- *(agent)* Extract convert bridge and pi loop event processors
- *(agent)* Extract pi core loop runner
- *(agent)* Remove active-project dependency for prompt injection
- *(agent)* Remove execute tool and keep python-only execution
- *(store)* Enforce project-scoped native handle flow
- *(pwa)* Migrate to injectManifest sw.ts and harden update flow
- *(web)* Switch to hash routing and remove eo fallback
- *(agent)* Reorder system prompt for prompt caching
- *(agent)* Split ConversationView into focused modules
- *(skills)* Remove enum constraint from read_skill tool parameter
- *(session)* Unify conversation terminology and drop legacy aliases
- *(file-edit)* Replace structuredPatch with compact diff output
- *(sync)* Mark only diff regions with conflict markers
- *(sidebar)* Move new workspace button into active tab
- *(skills)* Remove test-generation builtin skill
- *(skills)* Keep project skills runtime-scoped per project
- *(sidebar)* Redesign active/archived tabs with sliding indicator
- *(sidebar)* Use absolute hover overlay for workspace action buttons
- *(skills)* Replace custom YAML parser with js-yaml
- *(agent)* Reframe subagent delegation as context isolation strategy
- *(agent)* Replace manual @mention logic with tiptap Mention extension
- *(agent)* Improve ask_user_question docs with clearer usage guidance
- *(mcp)* Wrap all MCP tool results in ToolEnvelopeV2
- *(workspace)* Replace setInterval busy-wait with promise-based switch notification
- *(file-tree)* Remove verbose console.log and dedup workspace refresh
- *(skills)* Redesign SkillCard with switch toggle and improve SkillEditor UX
- *(storage)* Rename conversationStorage i18n keys to workspaceStorage
- *(storage)* Extract ConversationDropdown to module-level and use real pending counts
- *(sync)* Compact PendingSyncPanel footer with inline review button
- *(agent)* Remove project fingerprint module
- *(prompts)* Optimize system prompt quality and token efficiency
- *(i18n)* Split locale files by namespace
- *(settings)* Move language, theme, MCP and docs into SettingsDialog
- *(workspace-settings)* Improve dialog layout and tab icons
- *(tools)* Simplify read tool and fix ls/search glob dot matching
- *(subagent)* Remove unused timeout_ms parameter from spawn/resume
- *(sidebar)* Use runtime store for conversation running status
- *(agent)* Unify timeline rendering with buildTimeline() and clean up stale steps
- *(welcome)* Use AgentRichInput for consistent UX and fix StrictMode race
- *(ui)* Move RemoteBadge and WebContainer into Settings tabs
- *(settings)* Remove hardcoded default model, require explicit user config
- *(settings)* Remove unnecessary persist migration
- *(tools)* Add pluggable tool renderer registry and structured ls output
- *(python)* Convert execute tool to structured envelope output
- *(agent)* Replace manual agent creation with guide hint
- *(agent)* Memoize ToolCallDisplay and clean up debug logging
- *(search)* Queue concurrent search requests instead of rejecting
- *(search)* Replace isProcessing flag with generation counter
- *(agent)* Extract tool prompt docs into per-tool files and inject dynamically
- *(agent)* Rename snapshot to checkpoint and make tools conditional on native dir handle
- *(subagent)* Remove pre-emptive output offloading to asset files
- *(tools)* Remove getActiveConversation global fallback, use context.workspaceId
- *(store)* Rename activeProjectId to resolvedProjectId in runAgent
- *(routing)* Unify URL-driven workspace switching, remove bidirectional sync loop
- *(routing)* Migrate to react-router with centralized route config
- *(agent)* Remove context-memory module and simplify intelligence coordinator
- *(diff)* Replace LCS algorithm with Myers diff via `diff` library
- *(agent)* Remove batch write support from write tool
- *(agent)* Disable run_workflow tool to save ~700 tokens/turn
- *(agent)* Improve context compression with upstream timestamps and smarter triggers
- *(agent)* Remove trimming logic from compression pipeline
- *(extension)* Extract popup JS to separate main.ts
- *(agent)* Reject binary files in read tool instead of base64 encoding
- *(agent)* Remove scenario detection and time from prompt for cache stability
- *(ui)* Remove TimelineRow divider wrapper from assistant bubble
- *(agent)* Remove dynamic prompt sections for cache stability
- *(ui)* Unify slash commands via slash-command-registry
- *(skills)* Remove hardcoded builtin-skills.ts
- Split io.tool.ts into separate read and write modules
- *(providers)* Unify context window resolution with getModelContextWindow()
- *(templates)* Switch agent templates from Chinese to English
- *(agent)* Improve file-edit tool and tool execution truncation
- *(file-edit)* Support multi-edit format and extract sub-components
- *(edit)* Remove mandatory read-before-edit requirement
- *(skills)* Simplify editor, add project skill upload, unify components
- Merge image model and aspect ratio into single dropdown
- *(workspace)* Rename lastActiveAt to lastAccessedAt and sort sidebar by access time
- *(command-palette)* Remove preset role commands
- *(sidebar)* Hide plugins tab and update i18n translations
- *(mcp)* Switch to on-demand tool bridge and enhance settings
- *(tools)* Unify MCP and WebMCP into external tool bridge
- *(tools)* Rename use_subagent to semantic in search_tools
- *(webmcp)* Remove old webmcp_get_tool_schema and webmcp_call
- Remove analyze_data tool
- *(tools)* Redesign search_tools API with intent-based semantic search
- *(tools)* Update search_tools renderer for new intent-based API
- *(tools)* Refine search_tools renderer UI with neutral palette
- *(tools)* Adaptive three-level routing for search_tools
- *(web-fetch)* Unified Markdown output via Readability + Turndown
- *(store)* Move streamingQueues out of immer state via registry
- *(store)* Dedupe findSpawnStep helper, drop dead updatedAt write
- *(skills)* Redesign delete dialog with standard BrandDialog layout
- *(skills)* Remove skill auto-matching, simplify injection and add CreateSkillDialog
- *(sync)* Unify sync dialogs into SharedSyncDialogs with Zustand store
- *(ui)* Extract shared Lightbox component for click-to-enlarge images
- *(mcp)* Remove obsolete on-demand bridge
- *(storage)* Drop active singleton tables for URL-driven routing
- *(webmcp)* Split the WebMCP deduplication model by tool group and tab instance
- *(conversation)* Drop the Cmd+K shortcut hint near input
- *(ask-user-question)* Extract utils, harden schema, drop string options
- *(welcome+setup)* Collapse theme tokens, wire setup card, fix races
- *(python)* Drop legacy file-injection path and dead code
- *(extension)* Drop workspace-assistant mock provider

### 📚 Documentation

- Update project documentation and OPFS guide
- *(i18n)* Update README with comprehensive documentation
- Add BFOSA design specifications
- Update README for SQLite OPFS storage migration
- Add storage architecture documentation
- Create design specification document
- Update project documentation
- Reorganize documentation structure
- Refresh architecture overview and fix developer guides
- Update product references and plugin style examples
- Add DraftFS context note for future discussion
- Update dev server URL to localhost:5173
- Finalize open-source readiness details
- Set English as default README and add Chinese README
- Add LLM Wiki roadmap and unify README language layout
- *(readme)* Add subagent item to roadmap
- Add bilingual docs content and demo links
- Add CreatorWeave motivation sections
- Rewrite CONTRIBUTING.md with detailed contributor guide
- Add attachment directory design and roadmap entry
- Refine subagent API naming, timeout, and resume rules
- *(spec)* Design single workspace conversation markdown export
- *(spec)* Enrich conversation markdown export design
- *(agent)* Clarify Python /mnt reads from OPFS, suggest sync tool on missing files
- Add project skills documentation (zh + en)
- Clarify python output path policy for workspace vs assets
- Remove completed Attachment Directory from roadmap
- Update CHANGELOG for v0.3.0
- *(python)* Add CJK font and emoji limitation notes
- *(bash-tool)* Document UTF-8 mojibake pitfall and cp/echo workarounds

### ⚡ Performance

- *(sync)* Move file scanning and change detection to Web Worker
- *(conversation)* Reduce streaming re-renders in conversation view
- *(python)* Load matplotlib only when code imports it
- *(agent)* Memoize streaming markdown rendering components
- *(sync)* Add batch discardPendingPaths to replace one-by-one loop
- *(opfs)* Add ghost change dedup in writeFile with optimized content comparison
- *(agent)* Virtualize conversation turns and fix step disappearing bug
- *(agent)* Add memo comparison for AssistantStep and fix error extraction in FileReadRenderer
- *(traversal)* Skip node_modules, .git and other common excluded directories
- *(build)* Disable production sourcemaps and split large vendor chunks
- *(webmcp)* Parallelize tab tool discovery scan
- *(workspace)* Pure OPFS mode + skip redundant ensure loop in loadFromDB

### 🎨 Styling

- *(web)* Adjust input left padding for better alignment
- *(nav)* Animate nav rail line width on hover

### 🧪 Testing

- Add unit tests for AgentLoop and Zustand stores
- Fix 5 failing test suites (80 tests total)
- Fix AgentLoop test timeout issues
- Fix AgentLoop test mocks and resolve timeout issues
- *(sync)* Cover pending reject flows in OPFS-only mode
- Align specs with current behavior and worker runtime
- Fix flaky and outdated unit test assertions
- *(skills)* Complete skill-manager mock to cover all store calls

### ⚙️ Miscellaneous Tasks

- Add *.tsbuildinfo to gitignore
- Add storybook-static to gitignore
- Add .worktrees to .gitignore
- Remove temporary and build artifacts
- Unify workspace import conventions and stabilize type checks
- *(web)* Clean up lint/typecheck and remove broad any suppressions
- Comprehensive UI refinements and design system updates
- [**breaking**] Rename product to CreatorWeave and drop BFSA compatibility
- Neutralize runtime product labels to AI Workspace
- Prepare repository for open source release
- Remove GitHub Actions CI workflow
- *(observability)* Emit structured compression events including skip/fallback
- Disable local ralph-loop state files
- Remove bfosa.pen
- *(web)* Remove unused browser git module and UI
- *(ui)* Update sidebar behavior
- Remove unused intelligent-cache.ts
- Remove debug console.log from agents store and conversation view
- Commit pending workspace changes
- *(agent)* Remove unused readFile in search overlay
- Update onboarding tour and agent mode switch UI
- Commit remaining workspace changes
- *(docs)* Unify docs source to root and stop tracking web/public/docs
- Add edgeone deployment config
- Simplify edgeone deployment config
- Commit all pending changes
- *(i18n)* Remove unused translation keys
- *(i18n)* Add missing zh-CN translation for skill tags help
- *(i18n)* Add missing zh-CN translation for skill tags label
- *(i18n)* Add ask_user_question translations for all locales
- Change default conversation name to English
- *(web)* Commit pending SnapshotList changes
- Add structured issue templates
- Commit pending agent UI changes
- Commit all local pending changes
- Update pnpm-lock.yaml
- Remove unused markdown-it and turndown dependencies
- Bump version
- Update pnpm-lock.yaml for async-mutex
- *(build)* Remove just-bash from optimizeDeps.exclude
- *(extension)* Remove deprecated gpt-5.3-codex model
- *(browser-extension)* Bump version to 1.0.4
- *(skills)* Drop debug logs and assert imported skill source
- *(browser-extension)* Bump extension version to 1.0.5
- *(app)* Add syncFromRoute diagnostic logs
- *(agent)* Clarify platform identity in default template

### ◀️ Revert

- Remove virtual list rendering, keep other improvements
