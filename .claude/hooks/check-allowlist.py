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

# Hard block: force pushes to ANY branch (`--force`, `-f`, `--force-with-lease`,
# `--force-if-includes`). Only non-force pushes are permitted.
PUSH_FORCE = re.compile(
    _GIT_PUSH
    + r"(?=.*(?<![\w-])(?:-f|--force(?:-with-lease|-if-includes)?)(?![\w-]))"
)


def is_denied(segment, denied):
    if PUSH_FORCE.search(segment):
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
