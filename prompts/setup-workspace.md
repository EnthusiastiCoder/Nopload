Update claude.md for the shell section with the current working directory

# CLAUDE.md

## Shell
- The working directory is already `{{CWD}}`. Do not prefix commands with `cd {{CWD}} &&`. Just run commands directly.

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

## Additional Instructions
- The `prompts/` folder contains detailed tool-specific instructions and workflows. Read the relevant prompt file before using that tool for the first time in a session.
- First session in a new workspace: accept the trust dialog. Until then Claude Code prints `Ignoring N permissions.allow entries from .claude/settings.json: this workspace has not been trusted` and the allowlist does nothing. Accept it interactively once, or set `projects["<abs/path>"].hasTrustDialogAccepted: true` in `~/.claude.json`.
- A PreToolUse allowlist hook (`.claude/hooks/check-allowlist.py`) auto-approves allowlisted commands and hard-blocks pushes to `origin main` and all force-pushes. Destructive git ops (`reset --hard`, `clean -f*`, discarding `checkout`/`restore`, `branch -D`) and mutating DB migrations always prompt.
- Run the `introspect` skill (`/introspect`) at the end of every session to log mistakes, root causes, and lessons.
- Current prompts:
  - `prompts/chrome-devtools-mcp.md` — Chrome DevTools MCP: browser debugging, performance, memory profiling, Lighthouse audits.
  - `prompts/ui-critique-mcp.md` — UI Critique MCP: Gemini-powered screenshot analysis for structured UI/UX feedback.
  - `prompts/setup-workspace.md` — Workspace setup: this prompt itself, moved here after initial setup.
  - `tools/info-server/INFO-SERVER.md` — Project info server: UX rules, content schemas and the kit page contract. Read before making any infographic or report.


Also here's the settings.json to be placed inside a .claude folder.
The `permissions.allow` list is a growing union — expand it over time. It uses broad
per-tool family wildcards (e.g. `git:*`, `python:*`, `npm:*`) because safety is
enforced by the hook's deny/guard logic, not by keeping the list narrow.
{
  "permissions": {
    "allow": [
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(find:*)",
      "Bash(grep:*)",
      "Bash(rg:*)",
      "Bash(cd:*)",
      "Bash(pwd:*)",
      "Bash(echo:*)",
      "Bash(wc:*)",
      "Bash(head:*)",
      "Bash(tail:*)",
      "Bash(stat:*)",
      "Bash(diff:*)",
      "Bash(tree:*)",
      "Bash(which:*)",
      "Bash(where:*)",
      "Bash(tasklist)",
      "Bash(mkdir:*)",
      "Bash(mv:*)",
      "Bash(cp:*)",
      "Bash(touch:*)",
      "Bash(rmdir:*)",
      "Bash(git:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(pnpm:*)",
      "Bash(yarn:*)",
      "Bash(python:*)",
      "Bash(python3:*)",
      "Bash(pip:*)",
      "Bash(pip3:*)",
      "Bash(pytest:*)",
      "Bash(ruff:*)",
      "Bash(uvicorn:*)",
      "Bash(alembic:*)",
      "Bash(cargo:*)",
      "Bash(rustc:*)",
      "Bash(rustup:*)",
      "Bash(ollama:*)",
      "Bash(gh pr:*)",
      "Bash(gh issue:*)",
      "Bash(gh auth status:*)",
      "Bash(curl:*)",
      "Bash(adb:*)",
      "WebSearch",
      "WebFetch(*)",
      "Skill(*)",
      "mcp__chrome-devtools__*",
      "mcp__ui-critique__*"
    ],
    "deny": []
  },
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash|PowerShell|mcp__.*|Skill|Read|Glob|Grep|WebSearch|WebFetch",
        "hooks": [
          {
            "type": "command",
            "command": "python {{CWD_POSIX}}/.claude/hooks/check-allowlist.py"
          }
        ]
      }
    ]
  }
}

The `matcher` covers `Bash`, `PowerShell`, every MCP tool (`mcp__.*`), `Skill`, and the read-only tools `Read`/`Glob`/`Grep`/`WebSearch`/`WebFetch`, so the hook can grant `allow` decisions for all of them. (The VS Code extension does not honor native `permissions.allow` rules, which is why the hook has to emit the decisions itself. Any tool the matcher doesn't list — e.g. `Edit`/`Write` — falls through to native handling, and the hook also defers on any matched tool it has no rule for, so nothing is unintentionally auto-allowed.)

Notes for the `hooks.command`:
- `{{CWD_POSIX}}` is the current working directory in forward-slash form (e.g. `c:\Users\enthu\Projects\MONDAY` becomes `/c/Users/enthu/Projects/MONDAY`), since hook commands run under a POSIX-style shell.
- Use the interpreter that actually exists on the machine. Prefer a concrete install (e.g. `python` → `C:\PythonXX`, so `/c/PythonXX/python.exe`) over the `python3` Store execution-alias in `WindowsApps`, which a user can disable. Verify it runs (`which python`, `where python`) before committing to it.

Notes on `permissions.deny` and the hook's guards:
- `git` is allowlisted broadly as `Bash(git:*)`, but the hook hard-blocks two push cases regardless of flag order, `-c`/global-option injection, or inline env prefixes: (a) direct pushes to `origin main` (`PUSH_TO_MAIN` guard), and (b) force pushes to ANY branch — `--force`, `-f`, `--force-with-lease`, `--force-if-includes` (`PUSH_FORCE` guard). These are enforced in the hook, not via `deny` entries, because a settings pattern can't express them robustly.
- Destructive LOCAL git ops are never auto-allowed even though `git:*` matches them — they fall through to a prompt: `reset --hard`, `clean` with a force flag (`-f`/`-fd`/`-fdx`/…), a `checkout`/`restore` that discards the working tree, and `branch -D`. (`git:*` still auto-allows normal `status`/`add`/`commit`/`checkout <branch>`/`push <feature>`.)
- Mutating DB migrations are never auto-allowed — they prompt: `alembic upgrade|downgrade`, `... migrate apply`. Dry-run/plan variants (`--sql`, `--dry-run`, `... migrate plan`) stay auto-allowed. This enforces the dry-run → review → approve gate.
- The `deny` array is still honored for any additional simple prefix rules you add (same `Bash(...)` syntax as `allow`, and it takes precedence over `allow`).


Also here's the .mcp.json to be placed at the project root.
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["C:/Users/enthu/AgentBrowsers/bin/agent-browser.mjs"]
    },
    "ui-critique": {
      "command": "python",
      "args": ["c:/Users/enthu/Projects/UI CRITIQUE/server.py"]
    }
  }
}

The UI Critique MCP toolset is shared across projects and lives at `c:/Users/enthu/Projects/UI CRITIQUE/` (server.py + requirements.txt + .env with the Gemini API keys). The `.mcp.json` above points at it directly — no per-project copy needed. Its deps are already installed; if a fresh machine, run `pip install -r "c:/Users/enthu/Projects/UI CRITIQUE/requirements.txt"`.

The `chrome-devtools` entry points at the shared **agent-browser** wrapper at `C:/Users/enthu/AgentBrowsers/bin/agent-browser.mjs` — also no per-project copy. Do not replace it with a direct `npx chrome-devtools-mcp` invocation. The MCP launching its own browser is what puts `--enable-automation` on the command line, sets `navigator.webdriver = true`, and makes Google refuse sign-in. The wrapper instead launches an ordinary Brave with a real persistent profile and attaches the MCP to it over `--browserUrl`.

Each project gets its own profile, its own port (9300–9399), and its own window, all cloned on first use from the master profile at `C:/Users/enthu/AgentBrowsers/master` — so every project's browser is signed into the same Google account while keeping a separate cookie jar. This is automatic; nothing per-project is needed.

One-time on a fresh machine: `node C:/Users/enthu/AgentBrowsers/bin/agent-browser.mjs master`, sign into Google in the window that opens, then close it. `... status` lists projects and ports; `... refresh --all` re-clones existing project profiles after a fresh master login. Full details in `prompts/chrome-devtools-mcp.md`.


Also set up the **project info server** (a local read-only web server that shows what we are working on and every artifact as kit pages). Its code, docs and the machine-wide port registry are shared at `C:/Users/enthu/Projects/Setup Prompts/info-server/` (read its `README.md` first). Every workspace gets its own port from the registry so the info servers of different projects never collide. Requires Bun.
1. **Install (copy) the code:** copy `C:/Users/enthu/Projects/Setup Prompts/info-server/code/tools/info-server/` to `<workspace>/tools/info-server/` (includes its `.gitignore`, which ignores `content/`).
2. **Register the workspace's port:** from the workspace root run `bun tools/info-server/port.ts register`. It adds `<absolute workspace path> → <port>` to `C:/Users/enthu/Projects/Setup Prompts/info-server/ports.json`, giving the next free port from 8792 upward (8791 is Weave's), refuses a workspace that is already registered, and skips ports already listening. If the user named a port, use `bun tools/info-server/port.ts register --port <N>`. Confirm with `bun tools/info-server/port.ts lookup`; `list` shows every project. Never hardcode a port or edit `ports.json` by hand: `server.ts` and `visual-check.ts` read the port from the registry and refuse to start for an unregistered workspace.
3. **Starter content:** copy `C:/Users/enthu/Projects/Setup Prompts/info-server/starter-content/*` to `<workspace>/tools/info-server/content/`, create `content/artifacts/`, run `bun tools/info-server/content/builders/how-it-works.ts`, then `bun tools/info-server/check.ts` (expect `ok: 4 terms, 1 artifacts`).
4. **Smoke test:** start `bun tools/info-server/server.ts` in the background, `curl localhost:<PORT>/api/health` must return `"port":<PORT>`, then stop it (kill its whole process tree: `taskkill /F /T`).
5. **CLAUDE.md snippet:** insert the block below into CLAUDE.md as a new section before `## Additional Instructions`, with `<PORT>` replaced by the registered port, and add `tools/info-server/INFO-SERVER.md` to the "Current prompts" list.
6. **Ignore content:** add `tools/info-server/content/` to `.gitignore`. Commit only the code in `tools/info-server/`, never `content/`.

```markdown
## Project info server (how answers and artifacts are shown to Arpan)

A local read-only server at **http://localhost:<PORT>** shows what we're working on now and every artifact: a bird's-eye view first, details in stacked modals, and hover definitions for every term.

- **Code:** `tools/info-server/` (committed).
- **Content:** each person's own, gitignored, in `tools/info-server/content/`.
- **Read first:** `tools/info-server/INFO-SERVER.md`, before making any infographic or report.
- **Port:** `<PORT>` is this workspace's entry in the machine-wide registry `C:/Users/enthu/Projects/Setup Prompts/info-server/ports.json` (`bun tools/info-server/port.ts lookup`). Never hardcode a port or reuse another project's.
- **Start:** `bun tools/info-server/server.ts` from the repo root, in the background (it reads its port from the registry).
- **Keep current:** update `content/now.json` (the home page) whenever the focus changes.
- **Publish:**
  1. Write a builder in `content/builders/<id>.ts` and run it.
  2. Register it in `content/artifacts.json`.
  3. Add its terms to `content/glossary.json`.
  4. Run `bun tools/info-server/check.ts`.
  5. Run `bun tools/info-server/visual-check.ts` (the separate VISUAL check; its result page is `/view/info-check`). Never run two at once.
  6. Look at the screenshots yourself (layout AND content: numbers add up, references exist), then share ONLY the link `http://localhost:<PORT>/view/<id>`: never a raw file path.
- Every knowledge share beyond a few lines becomes a kit page here. Rules: visuals over text; every chart has a legend; ≤ 5 answer lines; every modal starts with a visual; every jargon term is in the glossary.
```


Also here's the allowlist hook, to be placed at `.claude/hooks/check-allowlist.py` (exact contents below).
This is a PreToolUse hook that handles Bash and PowerShell commands, MCP tool calls, Skill calls, and read-only tools (needed because the VS Code extension does not honor native `permissions.allow`, so the hook emits the `allow` decisions itself). PowerShell reuses the same `Bash(...)` allow rules and is parsed with PowerShell syntax (backtick escaping, no `\` escape).

**MCP tool calls** (`tool_name` starts with `mcp__`) are matched by tool name: **allow** if the name matches an allowlisted `mcp__…` rule (`mcp__server__*`, `mcp__server`, or an exact `mcp__server__tool`), otherwise **ask**. No deny logic for MCP.

**Skill tool calls** — **allow** if the skill name matches a `Skill(...)` allow rule (`Skill(*)` allows any), otherwise **ask**.

**Read-only tools** (`Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch`) — always **allow**.

**Bash / PowerShell commands** decision order:
1. **Deny (precedence):** any segment that is a direct push to `origin main` (`PUSH_TO_MAIN`) or a force push to any branch (`PUSH_FORCE`) — both robust against flag order, `git -c`/global-option injection, and inline env prefixes — OR a `permissions.deny` rule → **deny**.
2. **Guarded → never auto-allow (fall through to ask):** destructive LOCAL git (`reset --hard`, `clean -f*`, discarding `checkout`/`restore`, `branch -D`) and mutating DB migrations (`alembic upgrade|downgrade`, `... migrate apply`; dry-run/plan variants are exempt).
3. Otherwise auto-**allow** only when EVERY top-level segment either matches a `Bash(...)` allow rule or is an `rm` whose every target is a relative path inside the project directory (`rm_within_project`).
4. Multiple segments where some are not allowed → **deny** (with an "unchain" message); a single un-allowed command → **ask**.
It is quote- and substitution-aware — separators inside quotes or `$(...)` are not split, and any segment containing command/process substitution (`$(...)`, backticks, `<(...)`, `>(...)`) is never auto-allowed.

**Mode gate:** the hook only emits decisions in `acceptEdits` (auto-accept-edits) mode. Under `bypassPermissions`, `default`, and `plan` it exits silently and defers to native handling — so bypass truly bypasses and default asks for everything. If `permission_mode` is absent (older clients) it stays active.

**Ask-log:** every command that hits an `ask` purely because it is not yet allowlisted (excluding the intentional guards) is appended to `.claude/permission-ask-log.jsonl` (last 100). Review it periodically to see which commands to add to `permissions.allow`.

```python
#!/usr/bin/env python3
r"""PreToolUse hook for Bash/PowerShell + MCP: emit allow/ask/deny decisions against the
settings.json allowlist. (The VS Code extension does not honor native
`permissions.allow`, so this hook grants the allow decisions itself.)

Bash/PowerShell: a command is auto-allowed only when EVERY top-level segment matches
an allowlisted `Bash(...)` rule. PowerShell reuses the same `Bash(...)` rules — dev
commands are identical across shells — and is parsed with PowerShell syntax (backtick
escaping, no `\` escape, `$(...)`/`@(...)` subexpressions). Segments are split with a
quote- and substitution-aware tokenizer so that separators inside quotes or `$(...)`
are not treated as command boundaries, and command/process substitution can never
smuggle an un-allowlisted command past an allowlisted prefix. Direct pushes to origin/main
and force pushes are always denied. `rm` is auto-allowed only when every target is a
relative path that stays inside the project directory (cwd); absolute paths, `~`,
globs, `..` traversal, `$`, or targeting the project root itself fall through to a
prompt.

Two guarded categories are NEVER auto-allowed even when an allow rule (e.g.
`Bash(git:*)`) would otherwise match — they fall through to an `ask` prompt:
  (A) destructive LOCAL git ops that can nuke committed/uncommitted work
      (`reset --hard`, `clean -f*`, discarding `checkout`/`restore`, `branch -D`);
  (C) mutating DB migrations (`alembic upgrade|downgrade`, `... migrate apply`),
      which must be dry-run + reviewed + approved first. Dry-run/plan variants
      (`--sql`, `--dry-run`, `plan`) stay auto-allowed.

MCP: a tool call (`tool_name` starts with `mcp__`) is allowed when its name matches
an allowlisted `mcp__...` rule, otherwise ask. No deny logic for MCP.

Skill: allowed when the skill name matches a `Skill(...)` allow rule, else ask.

Read-only tools (Read, Glob, Grep, WebSearch, WebFetch): always allowed — inherently safe.

These non-Bash branches exist because the VS Code extension does not honor native
`permissions.allow`, so the hook has to emit the allow decisions itself.

Mode gate: the hook only emits decisions in `acceptEdits` (auto-accept-edits) mode.
Under `bypassPermissions`, `default`, and `plan` it exits silently and defers to native
handling — so bypass truly bypasses and default asks for everything. (If the
`permission_mode` field is absent, e.g. an older client, it stays active.)

Ask-log: every command that hits an `ask` purely because it is not yet allowlisted
(excluding the intentional guards) is appended to `.claude/permission-ask-log.jsonl`
(last 100) so the allowlist can be grown by reviewing what actually gets prompted.
"""
import sys, json, re, os, shlex
from datetime import datetime


def load_settings(filepath, key="allow"):
    try:
        with open(filepath) as f:
            return json.load(f).get("permissions", {}).get(key, [])
    except Exception:
        return []


# The ask-log: every command that hits an `ask` because it is not yet allowlisted is
# appended here (capped at the last 100) so the allowlist can be grown by review.
# Intentional guards (destructive git, migrations) are NOT logged — they must never be
# allowlisted, so they would only be noise.
ASK_LOG = ".claude/permission-ask-log.jsonl"


def append_ask_log(tool, detail):
    try:
        path = os.path.join(project_root, ASK_LOG)
        entry = json.dumps({
            "ts": datetime.now().isoformat(timespec="seconds"),
            "tool": tool,
            "detail": detail,
        })
        lines = []
        if os.path.exists(path):
            with open(path, encoding="utf-8") as f:
                lines = f.read().splitlines()
        lines.append(entry)
        lines = lines[-100:]
        with open(path, "w", encoding="utf-8") as f:
            f.write("\n".join(lines) + "\n")
    except Exception:
        pass


def split_commands(cmd, shell="bash"):
    """Split a shell command into top-level segments.

    Splits on unquoted `&&`, `||`, `|`, `;`, `&`, and newlines. Content inside quotes
    and `$(...)` (and bash backtick substitution) is opaque and never split, so
    separators embedded in a commit message or a substitution stay with their segment.
    `shell` selects escaping: bash escapes with a backslash; PowerShell escapes with a
    backtick and treats the backslash as a literal path separator.
    """
    ps = shell == "powershell"
    esc = "`" if ps else "\\"     # line/character escape character
    segments, buf = [], []
    i, n = 0, len(cmd)
    quote = None       # active quote char (' or ") or None
    depth = 0          # nesting depth inside $( ... ) / @( ... )
    subshell = False   # inside a bash `...` command substitution

    def flush():
        segments.append("".join(buf))
        buf.clear()

    while i < n:
        c = cmd[i]
        two = cmd[i:i + 2]

        if quote:
            buf.append(c)
            if c == esc and quote == '"' and i + 1 < n:
                buf.append(cmd[i + 1]); i += 2; continue
            if c == quote:
                quote = None
            i += 1; continue

        if subshell:
            buf.append(c)
            if c == "`":
                subshell = False
            i += 1; continue

        if c == esc and i + 1 < n:
            buf.append(c); buf.append(cmd[i + 1]); i += 2; continue

        if c in ("'", '"'):
            quote = c; buf.append(c); i += 1; continue

        if not ps and c == "`":
            subshell = True; buf.append(c); i += 1; continue

        if two == "$(" or (ps and two == "@("):
            depth += 1; buf.append(two); i += 2; continue

        if c == ")" and depth > 0:
            depth -= 1; buf.append(c); i += 1; continue

        if depth > 0:
            buf.append(c); i += 1; continue

        # `&` inside a redirect (`2>&1`, `>&2`, `&>file`) is NOT a separator: it is
        # a separator only when preceded/followed by `>` is false.
        if c == "&":
            nxt = cmd[i + 1] if i + 1 < n else ""
            prev = next((ch for ch in reversed(buf) if not ch.isspace()), "")
            if nxt == ">" or prev == ">":
                buf.append(c); i += 1; continue

        if two in ("&&", "||"):
            flush(); i += 2; continue

        if c in "|;&\n\r":
            flush(); i += 1; continue

        buf.append(c); i += 1

    flush()
    return [s.strip() for s in segments if s.strip()]


def build_patterns(rules):
    patterns = set()
    for rule in rules:
        m = re.match(r"^Bash\((.+)\)$", rule)
        if not m:
            continue
        content = m.group(1)

        has_wildcard = False
        if content.endswith(":*") or content.endswith(" *"):
            content = content[:-2]
            has_wildcard = True

        for part in split_commands(content):
            escaped = re.escape(part)
            patterns.add(f"^{escaped}\\b" if has_wildcard else f"^{escaped}$")

    return list(patterns)


def abbrev(segment, n=10):
    """Shorten a segment for display in a decision reason. Long ad-hoc commands
    would otherwise bloat the reason string (and token usage) needlessly."""
    segment = segment.replace("\n", " ")
    return segment if len(segment) <= n else segment[:n] + "..."


def mcp_allowed(tool_name, rules):
    """Match an MCP tool name against `mcp__...` allow rules. Supports:
      - `mcp__server__*`   → any tool on that server (trailing-`*` prefix match)
      - `mcp__server`      → any tool on that server (server-level match)
      - `mcp__server__tool`→ that exact tool
    """
    for rule in rules:
        if not rule.startswith("mcp__"):
            continue
        if rule.endswith("*"):
            if tool_name.startswith(rule[:-1]):
                return True
        elif tool_name == rule or tool_name.startswith(rule + "__"):
            return True
    return False


def skill_allowed(skill_name, rules):
    """Match a skill name against `Skill(...)` allow rules. `Skill(*)` allows any
    skill; `Skill(foo*)` is a prefix match; `Skill(foo)` is an exact match."""
    for rule in rules:
        m = re.match(r"^Skill\((.+)\)$", rule)
        if not m:
            continue
        pat = m.group(1)
        if pat == "*" or pat == skill_name:
            return True
        if pat.endswith("*") and skill_name.startswith(pat[:-1]):
            return True
    return False


# The shell of the current tool call ("bash" or "powershell"); set once the tool is
# known. Governs escape handling and which substitution syntaxes are recognised.
SHELL = "bash"

# Command/process substitution: an allowlisted prefix must never auto-allow an opaque
# inner command, so any segment containing one is treated as not-allowed. Bash uses
# `$(...)`, backticks, and `<()`/`>()`; PowerShell uses `$(...)` and `@(...)`.
_SUBSTITUTION_BASH = re.compile(r"\$\(|`|<\(|>\(")
_SUBSTITUTION_PS = re.compile(r"\$\(|@\(")


def has_substitution(segment):
    pat = _SUBSTITUTION_PS if SHELL == "powershell" else _SUBSTITUTION_BASH
    return bool(pat.search(segment))

# Leading inline env assignments + `git` + any global options (`-c k=v`, `-C path`,
# `--no-pager`, ...). Stripping these yields a canonical `git <subcommand> ...` so
# that e.g. `git -c foo=bar push ...` or `FOO=bar git push ...` matches a plain
# `Bash(git push:*)` allow rule. Global options never change which subcommand runs.
GIT_GLOBALS = re.compile(
    r"^(?:\w+=\S+\s+)*git\s+(?:-[cC]\s+\S+\s+|--[\w-]+(?:=\S+)?\s+|-\w+\s+)*"
)


def canonical(segment):
    m = GIT_GLOBALS.match(segment)
    if not m:
        return segment
    return "git " + segment[m.end():]


def is_allowed(segment, allowed):
    if has_substitution(segment):
        return False
    candidates = {segment, canonical(segment)}
    return any(re.search(p, c) for p in allowed for c in candidates)


# --- Delta A: guarded destructive LOCAL git ops (force `ask`, never auto-allow) ---
# These are not network operations, so the push guards don't cover them; a stray
# `reset --hard` or `clean -fdx` can silently destroy work. We do NOT deny them
# (they're legitimate on request) — we just strip their auto-allow so they prompt.
def is_destructive_git(segment):
    if has_substitution(segment):
        return False
    seg = canonical(segment)
    if not seg.startswith("git "):
        return False
    # reset --hard
    if re.match(r"^git\s+reset\b", seg) and re.search(r"(?<![\w-])--hard(?![\w-])", seg):
        return True
    # clean with a force flag (-f, -fd, -fdx, -xf, --force)
    if re.match(r"^git\s+clean\b", seg) and re.search(r"(?<![\w-])(?:-\w*f\w*|--force)(?![\w-])", seg):
        return True
    # checkout that discards the working tree: explicit `--` pathspec, a bare `.`
    # target, or -f/--force. A plain `git checkout <branch>` is NOT matched.
    if re.match(r"^git\s+checkout\b", seg):
        if re.search(r"(?<![\w-])(?:-f|--force)(?![\w-])", seg):
            return True
        if re.search(r"\s--(?:\s|$)", seg):
            return True
        if re.search(r"(?<!\S)\.(?:\s|$)", seg):
            return True
    # restore discards the working tree unless it is ONLY `--staged` (unstage).
    if re.match(r"^git\s+restore\b", seg):
        has_staged = re.search(r"(?<![\w-])--staged(?![\w-])", seg)
        has_worktree = re.search(r"(?<![\w-])(?:--worktree|-W)(?![\w-])", seg)
        if not (has_staged and not has_worktree):
            return True
    # branch force-delete (-D, or --delete --force)
    if re.match(r"^git\s+branch\b", seg) and re.search(r"(?<![\w-])(?:-D|--force)(?![\w-])", seg):
        return True
    return False


# --- Delta C: mutating DB migrations (force `ask`, never auto-allow) ---
# Every mutating migration must be dry-run, reviewed together, and approved before
# it executes. Dry-run/plan variants stay auto-allowed (they don't touch the DB).
MIGRATION_APPLY = re.compile(
    r"(?:(?<![\w-])alembic\b.*\b(?:upgrade|downgrade)\b"
    r"|\bmigrate\s+apply\b"
    r"|\bmonday\.data\.migrate\b.*\bapply\b)"
)
MIGRATION_DRYRUN = re.compile(r"(?<![\w-])--sql\b|(?<![\w-])--dry-run\b|(?<![\w-])--plan\b|\bmigrate\s+plan\b")


def is_migration_apply(segment):
    if has_substitution(segment):
        return False
    if MIGRATION_DRYRUN.search(segment):
        return False
    return bool(MIGRATION_APPLY.search(segment))


# Auto-allow `rm` only when every target stays inside the project directory (cwd).
# Anything uncertain — absolute paths, `~`, globs, `..` traversal, `$`, command
# substitution, or targeting the project root itself — falls through to a prompt
# instead of being granted. Conservative by design: when in doubt, do not allow.
_RM_PREFIX = re.compile(r"^(?:\w+=\S+\s+)*rm\b")
_ABS_PATH = re.compile(r"^(?:/|[A-Za-z]:|~)")
_GLOB_CHARS = re.compile(r"[*?\[\]]")


def rm_within_project(segment):
    if not _RM_PREFIX.match(segment):
        return False
    if has_substitution(segment):
        return False
    try:
        tokens = shlex.split(segment, posix=True)
    except ValueError:
        return False
    while tokens and re.match(r"^\w+=", tokens[0]):
        tokens.pop(0)
    if not tokens or tokens[0] != "rm":
        return False

    paths, opts_ended = [], False
    for tok in tokens[1:]:
        if not opts_ended and tok == "--":
            opts_ended = True
            continue
        if not opts_ended and tok.startswith("-") and len(tok) > 1:
            continue  # a flag such as -r, -f, -rf, --recursive
        paths.append(tok)

    if not paths:
        return False
    for p in paths:
        if _ABS_PATH.match(p) or _GLOB_CHARS.search(p) or "$" in p:
            return False
        norm = os.path.normpath(p).replace("\\", "/")
        if norm in (".", "", "/") or norm.startswith("../") or "/../" in norm:
            return False
        if norm.split("/")[0] == "..":
            return False
    return True


# Shared prefix: a `git push` invocation, robust against push flags in any order,
# global git options injected before the subcommand, and leading env assignments.
_GIT_PUSH = (
    r"^(?:\w+=\S+\s+)*"
    r"git\s+(?:-[cC]\s+\S+\s+|--[\w-]+(?:=\S+)?\s+|-\w+\s+)*"
    r"push\b"
)

# Hard block: pushing to origin/main. `origin` and `main` must appear as whole
# shell tokens AFTER `push`, so branches like `main-branch`, `mainline`, or
# `feature/main` are NOT matched.
PUSH_TO_MAIN = re.compile(
    _GIT_PUSH
    + r"(?=.*(?<![\w./-])origin(?![\w./-]))"
    + r"(?=.*(?<![\w./-])main(?![\w./-]))"
)

# Hard block: force pushes to ANY branch (`--force`, `-f`, `--force-with-lease`,
# `--force-if-includes`). Only non-force pushes are permitted.
PUSH_FORCE = re.compile(
    _GIT_PUSH
    + r"(?=.*(?<![\w-])(?:-f|--force(?:-with-lease|-if-includes)?)(?![\w-]))"
)


def is_denied(segment, denied):
    if PUSH_TO_MAIN.search(segment) or PUSH_FORCE.search(segment):
        return True
    return any(re.search(p, segment) for p in denied)


# Derive project root from script location
script_dir = os.path.dirname(os.path.abspath(__file__))
claude_dir = os.path.dirname(script_dir)
project_root = os.path.dirname(claude_dir)
home = os.path.expanduser("~")

# Read allow + deny rules from all settings files
allow_rules, deny_rules = [], []
for path in [
    os.path.join(home, ".claude", "settings.json"),
    os.path.join(project_root, ".claude", "settings.json"),
    os.path.join(project_root, ".claude", "settings.local.json"),
]:
    allow_rules.extend(load_settings(path, "allow"))
    deny_rules.extend(load_settings(path, "deny"))

ALLOWED = build_patterns(allow_rules)
DENIED = build_patterns(deny_rules)

# Parse the incoming tool call
try:
    payload = json.load(sys.stdin)
except Exception:
    sys.exit(0)

tool_name = payload.get("tool_name", "")
tool_input = payload.get("tool_input", {}) or {}

# Mode gate: this hook exists only to grant `allow` decisions in the auto-accept-edits
# workflow (the VS Code extension ignores native `permissions.allow` there). In every
# other mode it exits silently and defers to native handling — so `bypassPermissions`
# truly bypasses, `default` asks for everything, and `plan` stays restricted. If the
# field is absent (older clients) we stay active to preserve the auto-edit behaviour.
mode = payload.get("permission_mode")
if mode is not None and mode != "acceptEdits":
    sys.exit(0)

# Inherently read-only tools — always safe to auto-allow. Their native allow rules
# are not honored by the extension, so the hook grants them to avoid needless
# prompts. (No mutation, so no deny path.)
READ_ONLY_TOOLS = {"Read", "Glob", "Grep", "WebSearch", "WebFetch"}
if tool_name in READ_ONLY_TOOLS:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
        }
    }))
    sys.exit(0)

# MCP tool calls: allow if the tool name matches an allowlisted `mcp__` rule,
# otherwise ask. The VS Code extension does not honor native MCP allow rules, so
# the hook grants the allow here. No deny logic for MCP (allow-or-ask only).
if tool_name.startswith("mcp__"):
    decision = "allow" if mcp_allowed(tool_name, allow_rules) else "ask"
    if decision == "ask":
        append_ask_log(tool_name, tool_name)
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
        }
    }))
    sys.exit(0)

# Skill tool calls: allow if the skill name matches a `Skill(...)` allow rule,
# otherwise ask. Same rationale as MCP — the extension does not honor native
# Skill allow rules, so the hook grants the allow. No deny logic.
if tool_name == "Skill":
    skill_name = tool_input.get("skill", "") or ""
    decision = "allow" if skill_allowed(skill_name, allow_rules) else "ask"
    if decision == "ask":
        append_ask_log("Skill", skill_name)
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": decision,
        }
    }))
    sys.exit(0)

# Command-bearing tools: Bash and PowerShell share one allowlist + guards. PowerShell
# reuses the `Bash(...)` rules; only the parsing differs (see SHELL / split_commands).
if tool_name not in ("Bash", "PowerShell"):
    sys.exit(0)

SHELL = "powershell" if tool_name == "PowerShell" else "bash"
cmd = tool_input.get("command", "")
parts = split_commands(cmd, shell=SHELL)

if not parts:
    sys.exit(0)

# Deny takes precedence over the allowlist.
denied = [part for part in parts if is_denied(part, DENIED)]
if denied:
    reason = "BLOCKED by deny policy: " + ", ".join(f"`{abbrev(d)}`" for d in denied) + "."
    if any(PUSH_TO_MAIN.search(d) for d in denied):
        reason += " Direct pushes to origin/main are not allowed — push a feature branch and open a PR."
    if any(PUSH_FORCE.search(d) for d in denied):
        reason += " Force pushes are not allowed."
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
    sys.exit(0)


# Guarded ops (destructive git / mutating migration) are never auto-allowed even
# when an allow rule would match — they fall through to a prompt.
def part_allowed(part):
    if is_destructive_git(part) or is_migration_apply(part):
        return False
    return is_allowed(part, ALLOWED) or rm_within_project(part)


blocked = [part for part in parts if not part_allowed(part)]

if not blocked:
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "allow",
        }
    }))
elif len(parts) > 1:
    reason = "BLOCKED — not allowlisted: " + ", ".join(f"`{abbrev(b)}`" for b in blocked)
    reason += ". Unchain and run blocked commands separately for approval."
    print(json.dumps({
        "hookSpecificOutput": {
            "hookEventName": "PreToolUse",
            "permissionDecision": "deny",
            "permissionDecisionReason": reason,
        }
    }))
else:
    part = parts[0]
    out = {"hookEventName": "PreToolUse", "permissionDecision": "ask"}
    if is_destructive_git(part):
        out["permissionDecisionReason"] = (
            "Guarded destructive git command — it can discard committed or "
            "uncommitted work. Review carefully, then confirm to proceed."
        )
    elif is_migration_apply(part):
        out["permissionDecisionReason"] = (
            "Mutating DB migration — run the plan/dry-run and review it together "
            "first, then approve to execute. Never mutate the DB outside a migration."
        )
    else:
        # A plain un-allowlisted command — a candidate for the allowlist. Log it.
        append_ask_log(tool_name, part)
    print(json.dumps({"hookSpecificOutput": out}))
```


Also here's the `introspect` skill, to be placed at `.claude/skills/introspect/SKILL.md` (exact contents below).
The directory layout matters: Claude Code only discovers skills at `.claude/skills/<name>/SKILL.md`. A flat `.claude/skills/introspect.md` is never loaded, so `/introspect` would not resolve even though CLAUDE.md tells every session to run it.
Update the `mistakes/` path to the current workspace root.

````markdown
---
name: introspect
description: End-of-session introspection — objectively list mistakes, root causes, and lessons. Run at the end of every session.
user_invocable: true
---

# Session Introspection

You are performing an honest, objective post-mortem of this session. No guessing, no false confidence, no dodging accountability.

## Instructions

### Phase 1: Draft the introspection
1. Create the `mistakes/` directory at the workspace root (`{{CWD}}\mistakes\`) if it doesn't exist
2. Create a markdown file named `{date}_{short-slug}.md` (e.g., `2026-07-21_phase-0-foundations.md`)
3. Review the ENTIRE conversation and list every mistake you made. For each mistake:
   - **What happened** — factual description
   - **Root cause** — why you made this mistake (not understanding the tool? laziness? wrong assumption?)
   - **Impact** — time wasted, user frustration, broken state
   - **How to avoid** — concrete rule for future sessions
4. If a problem remained unsolved, say so explicitly — do NOT claim it was resolved
5. At the end, add a **Score** section: rate yourself 1-10 on execution quality this session with a one-line justification

### Phase 2: Review with user
After writing the draft, present EACH mistake to the user one at a time using AskUserQuestion. For each mistake, show:
- Your summary of what went wrong
- Your proposed root cause and prevention rule

Ask about mistakes in batches of up to 4 (AskUserQuestion limit). Each question MUST follow this exact format:

- **header:** Short label like "middleware.ts", "node:crypto", "Cookie mismatch" (max 12 chars)
- **question:** "Mistake {N}: {title}. My take: {your one-line root cause analysis}. Is this accurate?"
- **options** (exactly these 3, always in this order):
  1. `"Accurate"` — description: "Analysis is correct — {your prevention rule}"
  2. `"Wrong root cause"` — description: "You'll explain the real reason"
  3. `"Not a real mistake"` — description: "Remove it"

If user picks "Wrong root cause", ask a follow-up to get their explanation, then update the entry.
If user picks "Not a real mistake", remove it from the file.

After the user reviews all mistakes, ask ONE final open-ended question: "Any other mistakes I missed, or general feedback?" with options "Nothing else", "Missed something", "General feedback". Update the file with all feedback and add a `## User Feedback` section capturing their notes.

### Phase 3: Persist lessons
Save relevant lessons as memory files (feedback type) so they persist across sessions. Only save NEW lessons not already in memory.

## Format

```markdown
# Session Introspection — {date}

## Task
{one-line summary of what was asked}

## Mistakes

### 1. {short title}
- **What happened:** ...
- **Root cause:** ...
- **Impact:** ...
- **How to avoid:** ...
- **User feedback:** {added after Phase 2}

### 2. {short title}
...

## Unsolved Problems
{list anything that remained broken or unclear}

## User Feedback
{overall notes from the review}

## Score: X/10
{one-line justification}
```

## Rules
- Be brutally honest. The user reads these.
- Only cite facts from the conversation. No invented details.
- Every mistake must have a concrete "how to avoid" — not vague platitudes like "be more careful."
- If you did something right that was non-obvious, you can note it briefly in a "What went well" section — but keep it short. This is primarily about failures.
- ALWAYS do Phase 2. Never skip the user review — their perspective is the whole point.
````


git init if not done already. then add CLAUDE.md, .claude, .mcp.json, prompts/ and tools/info-server/content/ to gitignore. and then make the first commit.
