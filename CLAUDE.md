# CLAUDE.md

## Shell
- The working directory is already `c:\Users\enthu\Projects\Nopload`. Do not prefix commands with `cd c:\Users\enthu\Projects\Nopload &&`. Just run commands directly.

## Git Commits
- Never add Co-Authored-By lines to commit messages.
- Always check file contents (git diff or read) BEFORE running git add + git commit. Verify only the intended change is included. Never batch multiple changes into one commit.
- Always run `git add` and `git commit` as separate commands. Never chain them with `&&`.
- After the initial setup commit, commit one file at a time — favor more small, granular commits over fewer large ones. Only group multiple files in a single commit when they are inseparable parts of one atomic change.

## Git Branching
- Never commit directly to `main` unless the user explicitly asks to.
- At the start of work, check the current branch. Continue on that branch, or create a new one if on `main`.
- Branch naming: `fix/short-desc`, `feat/short-desc`, `chore/short-desc`.

## Planning
- When planning, always output the plan to a markdown file in the `plans/` folder (not inline in chat).
- Always ask questions to remove ambiguity before starting implementation.
- When implementation is asked to be planned, always plan commits (as many as possible), acceptance criteria, and tests (if applicable).

## Cross-Questioning
- Before starting ANY task — building, editing, or changing anything, no matter how small — ask clarifying questions first so we both confirm we're on the same page.
- Use the question tool (AskUserQuestion). For each decision, present concrete options, each with a recommendation (mark the best option `(Recommended)`) and the pros/cons or trade-offs of each.
- Wait for the answers before proceeding. This is the same protocol as regular clarifying questions.

## Research
- Save research notes and findings as markdown files in the `research/` folder.
- Use the built-in WebFetch/WebSearch tools to access the internet freely for research.

## Database Migrations
- Every mutating migration (schema or data) must follow this gate: (1) run a **dry-run** that shows the exact SQL/DDL and data impact, (2) we **both review** it, (3) it executes **only on your explicit approval**.
- Never mutate the database outside a migration — no ad-hoc `sqlite3` writes, no manual row edits. The migration is the single source of truth for any schema/data change.
- Migrations must be reversible where possible (provide a down/rollback path).
- The allowlist hook forces migration-apply commands to prompt. Do not try to bypass it.

## Chrome DevTools MCP
- The browser is a **real, visible Brave instance signed into my Google account**, not a throwaway automation profile. It is launched by the shared wrapper at `C:/Users/enthu/AgentBrowsers/bin/agent-browser.mjs`; the MCP only attaches to it. Read `prompts/chrome-devtools-mcp.md` before first use.
- Close unused tabs. Keep a maximum of 6 tabs open at once. If more, close some before opening new ones. The browser persists across sessions, so tabs you leave open are still there next time.
- Treat that browser as my own logged-in session. It can reach my mail, drive and calendar. Do not change account settings, make purchases, or send anything from my account unless I explicitly ask.
- Never reconfigure the MCP to launch its own browser (`-e`, `--isolated`, `--headless`, plain `npx chrome-devtools-mcp`). That restores the `--enable-automation` fingerprint and Google stops accepting the login.
- Extension and PWA tools do not exist in this setup — they need a pipe connection. Do not try to call them.
- If a site blocks you (Cloudflare interstitial, CAPTCHA, 403/429): stop, and tell me the host and what you saw. Do not try to defeat it — no solver services, no retry loops, no fingerprint or UA spoofing. Look for the feed, `sitemap.xml`, JSON-LD, or a public API instead, and if there is none, say so and let me decide.

## MCP Changes — do not restart Claude Code
- **Never tell me to restart Claude Code to pick up an MCP change.** Reconnect it instead.
- The `/mcp reconnect` slash command does **not** work in the VS Code extension — it replies *"Reconnect, enable, and disable aren't available in this session."* Do not suggest it there.
- **You can reconnect an MCP yourself.** Write the server name (or `all`) to the trigger file, then read the result:
  ```bash
  echo chrome-devtools > ~/.claude/mcp-reload-trigger
  sleep 2 && cat ~/.claude/mcp-reload-result
  ```
  This is wired in by a local patch to the extension (`C:/Users/enthu/AgentBrowsers/bin/patch-vscode-mcp-reload.mjs`), which routes into the extension's own reconnect path. After editing any MCP's code, do this rather than asking me to do anything.
- Two manual routes if the trigger file does not respond: the `/` menu → type the server name → **Reconnect** (built in, needs no patch); or the Command Palette → **Claude Code: Reconnect MCP**.
- The patch is wiped by every extension update and re-applied automatically on the next session start, but only goes live after a **window reload** (`Developer: Reload Window`). If the trigger file stops working, that is the likely reason.
- **The editor here is Windsurf, not VS Code.** Its extensions live in `~/.windsurf/extensions`, and it usually carries a *different, newer* Claude Code build than any stale copy in `~/.vscode/extensions`. The patcher scans every editor root (VS Code, Windsurf, Cursor, Insiders) for exactly this reason - patching the wrong root fails silently.
- For `chrome-devtools`, the browser runs outside the session's process tree, so it survives reconnects *and* full restarts — the Google login and open tabs persist either way.
- A brand-new server added to `.mcp.json` still needs its one-time approval, which may require a fresh session.

## Nopload rules
- **100% client-side.** No server processing, analytics, telemetry, or fonts, scripts or models from a CDN. **No third-party requests of any kind**: every asset (wasm, models, fonts, icons) is self-hosted. A CSP header (`connect-src 'self'`) enforces it. The site shows a visible proof of this.
- Background removal uses **MODNet (Apache-2.0)**. **RMBG-1.4 is non-commercial: never ship, download or reference it in code.**
- Verify every model and library licence **from its source** (upstream LICENSE, model card, npm `license` plus repo LICENSE) and record it in `THIRD_PARTY_NOTICES.md` with URL and pinned version. If it is not permissive (MIT, BSD, Apache-2.0, ISC, Zlib, MPL-2.0 for dev-only tools), stop and report. Pre-approved, disclosed exception: the HEIC decoder (libheif / libde265, LGPL-3.0), shipped unmodified as a separately loaded chunk.
- **No LICENSE file.** README carries "© Arpan Mandal. All Rights Reserved."; a `COPYRIGHT` file exists; third-party notices stay.
- **History must stay linear: no merge commits.** Combine parallel branches by rebase / fast-forward only (the history spreader refuses merges).
- `plans/` is gitignored (local only), and so is `tools/info-server/content/`.
- Git identity is per repo: `Arpan Mandal <enthusiasticoder@gmail.com>`. Branch `feat/nopload-mvp`; nothing on `main`.
- **Push only after the history spread is applied.** The repo is created PRIVATE. Making it public, creating `main`/a PR and deploying to Cloudflare need the user's explicit approval.
- Never touch clinicalintel, LMS, employer repos or `C:/Users/enthu/Projects/ImageTools`.

## Project info server (how answers and artifacts are shown to Arpan)

A local read-only server at **http://localhost:8797** shows what we're working on now and every artifact: a bird's-eye view first, details in stacked modals, and hover definitions for every term.

- **Code:** `tools/info-server/` (committed).
- **Content:** each person's own, gitignored, in `tools/info-server/content/`.
- **Read first:** `tools/info-server/INFO-SERVER.md`, before making any infographic or report.
- **Port:** `8797` is this workspace's entry in the machine-wide registry `C:/Users/enthu/Projects/Setup Prompts/info-server/ports.json` (`bun tools/info-server/port.ts lookup`). Never hardcode a port or reuse another project's.
- **Start:** `bun tools/info-server/server.ts` from the repo root, in the background (it reads its port from the registry).
- **Keep current:** update `content/now.json` (the home page) whenever the focus changes.
- **Publish:**
  1. Write a builder in `content/builders/<id>.ts` and run it.
  2. Register it in `content/artifacts.json`.
  3. Add its terms to `content/glossary.json`.
  4. Run `bun tools/info-server/check.ts`.
  5. Run `bun tools/info-server/visual-check.ts` (the separate VISUAL check; its result page is `/view/info-check`). Never run two at once.
  6. Look at the screenshots yourself (layout AND content: numbers add up, references exist), then share ONLY the link `http://localhost:8797/view/<id>`: never a raw file path.
- Every knowledge share beyond a few lines becomes a kit page here. Rules: visuals over text; every chart has a legend; ≤ 5 answer lines; every modal starts with a visual; every jargon term is in the glossary.

## Additional Instructions
- The `prompts/` folder contains detailed tool-specific instructions and workflows. Read the relevant prompt file before using that tool for the first time in a session.
- First session in a new workspace: accept the trust dialog. Until then Claude Code prints `Ignoring N permissions.allow entries from .claude/settings.json: this workspace has not been trusted` and the allowlist does nothing. Accept it interactively once, or set `projects["<abs/path>"].hasTrustDialogAccepted: true` in `~/.claude.json`.
- A PreToolUse allowlist hook (`.claude/hooks/check-allowlist.py`) auto-approves allowlisted commands and hard-blocks pushes to `origin main` and all force-pushes. Destructive git ops (`reset --hard`, `clean -f*`, discarding `checkout`/`restore`, `branch -D`) and mutating DB migrations always prompt.
- Run the `introspect` skill (`/introspect`) at the end of every session to log mistakes, root causes, and lessons.
- Current prompts:
  - `prompts/chrome-devtools-mcp.md` — Chrome DevTools MCP: browser debugging, performance, memory profiling, Lighthouse audits.
  - `prompts/setup-workspace.md` — Workspace setup: this prompt itself, moved here after initial setup.
  - `tools/info-server/INFO-SERVER.md` — Project info server: UX rules, content schemas and the kit page contract. Read before making any infographic or report.
