## Chrome DevTools MCP — Agent Instructions

You have access to the **Chrome DevTools MCP server**, a browser automation and debugging toolkit exposed as MCP tools (prefixed `mcp__chrome-devtools__`). Use these tools to control Chrome/Brave, inspect pages, debug performance, profile memory, run Lighthouse audits, and automate browser interactions.

### Setup — real browser, shared Google login

This MCP does **not** launch its own browser. A wrapper launches an ordinary Brave instance and the MCP merely *attaches* to it.

**Why.** Left to itself, chrome-devtools-mcp launches Chrome through Puppeteer with `--enable-automation` and a throwaway profile. That sets `navigator.webdriver = true`, and Google then refuses sign-in with "this browser or app may not be secure". Attaching to a browser the MCP did not launch avoids the automation flags entirely, so `navigator.webdriver` stays `false` and the profile is a real one that is already signed in.

`.mcp.json` at the project root:

```json
{
  "mcpServers": {
    "chrome-devtools": {
      "command": "node",
      "args": ["C:/Users/enthu/AgentBrowsers/bin/agent-browser.mjs"]
    }
  }
}
```

That is the whole per-project setup. If `.mcp.json` already exists, add the `"chrome-devtools"` entry to the existing `"mcpServers"` object — do not overwrite other servers.

**What happens on session start**, handled by the wrapper, no agent action needed:

1. The project directory is assigned a slug and a debug port from 9300–9399, recorded in `C:/Users/enthu/AgentBrowsers/registry.json`. **A project's port is assigned once and then never changes**, so it is stable across sessions and reboots. Ports 9222/9223 are outside the range entirely.
2. On first use the project gets its own profile, cloned from the master profile at `C:/Users/enthu/AgentBrowsers/master` — so it inherits the Google login.
3. Brave launches on that port with that profile, visible, with no automation flags. A browser already on that port is reused **only if it is running this project’s profile** — verified against the owning process’s command line. If some other browser holds the port, the project is moved to a free one. (Ports 9222/9223 are deliberately outside the range: they are commonly already taken by a browser the user started, and attaching an agent to that would drive the user’s real browsing session.)
4. The MCP starts with `--browserUrl http://127.0.0.1:<port>`.

Each project therefore gets **its own browser window and its own cookie jar**, and all of them are signed into the same Google account. Two Claude sessions in the *same* project share one browser.

**Never** add `--headless`, `--isolated`, or a bare `-e <path>` launch config back in. Each one re-creates the automation fingerprint and the Google sign-in wall returns.

#### Operator commands (for the user, not usually the agent)

Run as `node C:/Users/enthu/AgentBrowsers/bin/agent-browser.mjs <cmd>`:

| Command | Effect |
|---------|--------|
| `master` | Open the master profile to sign into Google. Do this once. Close the window when done. |
| `status` | List every project, its port, and whether its browser is running. |
| `refresh [slug\|--all]` | Re-clone a project profile from master. Needed after a fresh master login. |
| `stop [slug\|--all]` | Close a project's browser. |
| `update` | Update the pinned chrome-devtools-mcp. |

Profiles are cloned, not linked, so a **later** login in master does not reach existing projects until `refresh` is run. Cloning refuses to run while the source browser is open, since copying a live profile yields a torn cookie database.

#### Picking up changes to `agent-browser.mjs` or `.mcp.json`

**The browser survives a restart, so this is cheap.** It is launched through WMI, which puts it outside the session's job object. Ending a Claude Code session does not kill it: the Google login, cookies and open tabs all persist, and the next session logs `reusing this project's browser` instead of launching one. Only the thin MCP wrapper needs to come back.

How to reload depends on the front end, and the difference matters:

| Front end | Reconnect available? | What to do |
|-----------|---------------------|------------|
| **VS Code extension** (checked on 2.1.246) | The `/mcp reconnect` *slash command* is **not** available — it answers *"Reconnect, enable, and disable aren't available in this session."* But the extension's own **"MCP servers" panel** does have Reconnect, and a local patch adds two more doors (below). | Any of the three routes below. |
| **Terminal TUI** (`claude`) | Believed yes — `/mcp` there is an interactive menu with a Reconnect action. **Not verified end to end.** | `/mcp`, pick the server, Reconnect. |

**MCP connections are per session.** Reconnecting in a terminal session does nothing for a VS Code session — each holds its own. A terminal reconnect is not a workaround for the extension.

##### Three ways to reconnect in the VS Code extension

1. **Built in, no patch.** Open the slash/command menu (`/`) and type the server name, e.g. `chrome-devtools`. It appears under an **MCP servers** section (the entries are `filterOnly`, so they stay hidden until you search). Select it to open the server panel, which has **Reconnect**, Enable/Disable and View tools.
2. **Command Palette** — *Claude Code: Reconnect MCP* (`claude-vscode.reconnectMcp`), added by the patch. Reconnects every configured server.
3. **Agent-triggered**, added by the patch — write the server name (or `all`) to the trigger file, then read the result:

```bash
echo chrome-devtools > ~/.claude/mcp-reload-trigger
sleep 2 && cat ~/.claude/mcp-reload-result      # -> "<timestamp> ok chrome-devtools"
```

Use route 3 yourself after editing an MCP; do not ask the user to restart Claude Code.

##### About the patch

`C:/Users/enthu/AgentBrowsers/bin/patch-vscode-mcp-reload.mjs` injects both doors into the extension's `extension.js`, funnelling into the extension's *own* reconnect path. `check` / `apply` / `revert` are its subcommands, it is idempotent, and it keeps an `extension.js.orig-backup` beside the file.

It does **not** make `/mcp reconnect` work - that gate is in the core binary, not the extension.

Two traps it exists to survive. **The editor on this machine is Windsurf** (`~/.windsurf/extensions`), which ships a different, newer build than the stale copy in `~/.vscode/extensions`; patching the unused root looks successful and does nothing, so the patcher covers every editor root. And `extension.js` is minified with identifiers that change between builds (`set($,M)` became `set($,R)` from 2.1.246 to 2.1.263), so the anchors are regexes that capture those names, are rejected unless they match exactly once, and the patched bundle is compiled with `vm.Script` before it is written.

`mcp-reload-boot` records `module-loaded` (with the file path), `activate-reached` and `ready`. If reconnect is not working, read that file first: no `module-loaded` line means the running editor is loading a different extension.js than the one that was patched.

A VS Code extension update installs into a new versioned directory and deletes the old one, **taking the patch with it**. `agent-browser.mjs` therefore re-applies it on every session start, so it heals itself the first time a session opens after an update — but the new patch only becomes live after a **window reload** (`Developer: Reload Window`). If the extension's internals shift, the patcher refuses rather than corrupting the bundle, and logs `failed:anchor1|anchor2`; the fallback is route 1, which needs no patch. Set `AGENT_BROWSER_NO_EXT_PATCH=1` to stop touching the extension entirely.

#### If the server fails to start

The message on stderr says which case it is:

- *"No master profile yet"* — the user must run `agent-browser master` and sign in once.
- *"master profile browser is still open"* — the user must close that window.
- *"browser did not expose CDP"* — a browser is running on that port with a different profile, or Brave failed to start. `agent-browser status` shows the state.

Logs are at `C:/Users/enthu/AgentBrowsers/logs/<slug>.log`.

### Read this first: almost every tool needs a `pageId`

Page-scoped tools take a **required `pageId`**, and it must be a **number**, not a string. Omit it and the call fails before it runs:

```
MCP error -32602: Invalid arguments for tool navigate_page: Required at pageId
MCP error -32602: Invalid arguments for tool navigate_page: Expected number, received string at pageId
```

Get it from `list_pages`, which returns the id as the leading index:

```
## Pages
1: Google Account (https://myaccount.google.com/) [selected]
```

So the opening move of any browser task is:

```
list_pages()                                     -> 1
navigate_page(pageId: 1, url: "https://...")     // number, not "1"
take_snapshot(pageId: 1)
click(pageId: 1, uid: "e42")
```

**28 of the 42 tools require it** — every input, navigation, emulation, debugging, network and performance tool, plus `take_heapsnapshot`.

**The 14 that do not take a `pageId`:** `list_pages`, `new_page`, and the twelve heapsnapshot readers (`close_heapsnapshot`, `compare_heapsnapshots`, `query_heapsnapshot_objects`, and the `get_heapsnapshot_*` family) — those are scoped to a snapshot handle instead.

This is `--pageIdRouting`, on by default. It is what lets two Claude sessions share one project browser without stealing each other's tabs, so leave it on.

### Quick Reference — When to Use What

| Goal | Tool(s) | Notes |
|------|---------|-------|
| **See page structure** | `take_snapshot` | Returns accessibility tree with element UIDs for interaction. |
| **Screenshot** | `take_screenshot` | Capture full page or specific element. Supports png/jpeg/webp. |
| **Navigate** | `navigate_page` | Go to URL, back, forward, reload. Supports `initScript` for pre-page JS. |
| **Open/close tabs** | `new_page`, `list_pages`, `select_page`, `close_page` | Multi-tab support with isolated contexts. |
| **Click elements** | `click` | Use `uid` from `take_snapshot`. Supports double-click. |
| **Click by coordinates** | `click_at` | Pixel-based clicking. Enabled in this setup. |
| **Fill a single input** | `fill` | Fill input/textarea by `uid`. Use `"true"`/`"false"` for toggles. |
| **Fill entire form** | `fill_form` | Faster than multiple `fill` calls — batch all fields at once. |
| **Type text** | `type_text` | Type into focused element with optional submit key. |
| **Press keyboard keys** | `press_key` | e.g. `"Enter"`, `"Control+A"`, `"Tab"`. |
| **Hover** | `hover` | Trigger hover effects on elements. |
| **Drag and drop** | `drag` | Drag from one element UID to another. |
| **Handle dialogs** | `handle_dialog` | Accept or dismiss browser alerts/confirms/prompts. |
| **Upload a file** | `upload_file` | Through file input elements. |
| **Wait for content** | `wait_for` | Waits until specific text appears on page. |
| **Run JavaScript** | `evaluate_script` | Execute JS functions with arguments, capture return values. |
| **Resize viewport** | `resize_page` | Change viewport width and height. |
| **Emulate device** | `emulate` | Set viewport, user agent, network throttle, geolocation, color scheme, CPU throttle. |
| **List network requests** | `list_network_requests` | Filter by resource type, paginate results. |
| **Inspect a request** | `get_network_request` | Get full request/response details, optionally export to file. |
| **Console messages** | `list_console_messages`, `get_console_message` | See all console output or inspect a specific message. |
| **Lighthouse audit** | `lighthouse_audit` | Full performance/accessibility audit (desktop or mobile). |
| **Performance trace** | `performance_start_trace`, `performance_stop_trace`, `performance_analyze_insight` | Record and analyze performance traces. |
| **Memory profiling** | `take_heapsnapshot`, `compare_heapsnapshots`, `close_heapsnapshot` | Heap snapshot analysis for memory leaks. |
| **Find retainers** | `get_heapsnapshot_retainers`, `get_heapsnapshot_retaining_paths` | Identify what keeps an object in memory. |
| **Find by class** | `get_heapsnapshot_class_nodes` | Find all objects of a specific class in heap. |

### Core Workflows

#### 1. Page Inspection & Interaction (Most Common)

0. **Get the page id**: `list_pages()` — returns e.g. `1: New Tab (chrome://newtab/) [selected]`
1. **Navigate**: `navigate_page(pageId: 1, url: "https://example.com")`
2. **Snapshot**: `take_snapshot(pageId: 1)` — returns the accessibility tree with element `uid` values
3. **Interact**: Use the `uid` from the snapshot:
   - `fill(pageId: 1, uid: "e42", value: "username")` — fill an input
   - `click(pageId: 1, uid: "e55")` — click a button
   - `press_key(pageId: 1, key: "Enter")` — press a key
   - `fill_form(pageId: 1, elements: [{uid: "e42", value: "user"}, {uid: "e43", value: "pass"}])` — fill multiple fields
4. **Verify**: `take_snapshot(pageId: 1)` again, or `wait_for(pageId: 1, text: ["Dashboard"])`

#### 2. Debugging & Console

```
list_console_messages(pageId: 1, types: ["error", "warning"])
evaluate_script(pageId: 1, function: "() => document.querySelectorAll('.error').length")
```

Use `evaluate_script` to run arbitrary JavaScript in the page context. Combine with `list_console_messages` to diagnose issues.

#### 3. Performance Analysis

```
performance_start_trace(pageId: 1, reload: true)
// page loads...
performance_stop_trace(pageId: 1, filePath: "trace.json")
performance_analyze_insight(pageId: 1, insightName: "LCPPhases", insightSetId: "...")
```

Start a trace, optionally reload the page during recording, stop it, then analyze specific insights. Use `lighthouse_audit` for a comprehensive one-shot report.

#### 4. Memory Leak Investigation

```
take_heapsnapshot(pageId: 1)             // handle A, baseline
// perform the suspected-leaky actions...
take_heapsnapshot(pageId: 1)             // handle B
compare_heapsnapshots(a, b)              // what grew?
get_heapsnapshot_retaining_paths(b, nodeId)   // why is it still alive?
close_heapsnapshot(a); close_heapsnapshot(b)
```

Snapshot before and after, diff them, then chase retaining paths on whatever grew. Snapshots are large — always close the handles.

#### 5. Network Inspection

```
list_network_requests(pageId: 1, resourceTypes: ["fetch", "xhr"])
get_network_request(pageId: 1, reqid: 42, responseFilePath: "response.json")
```

Filter requests by type, then inspect specific requests in detail.

#### 6. Multi-Tab Workflows

```
new_page(url: "https://app.example.com/page1")          // no pageId - it makes one
new_page(url: "https://app.example.com/page2", background: true)
list_pages()                                            // no pageId
select_page(pageId: 2)
```

Open pages in background tabs, switch between them. **Keep a maximum of 6 tabs open** — close unused tabs before opening new ones.

### Tool Reference

**42 tools** in this configuration. The wrapper passes `--memoryDebugging` and `--experimentalVision`, which is what enables the heapsnapshot family and `click_at`.

#### Input Automation (11 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `click` | `uid` (required), `dblClick`, `includeSnapshot` | Click an element by UID |
| `click_at` | `x`, `y` (required), `dblClick`, `includeSnapshot` | Click at pixel coordinates |
| `drag` | `from_uid`, `to_uid` (required), `includeSnapshot` | Drag from one element to another |
| `fill` | `uid`, `value` (required), `includeSnapshot` | Fill an input field |
| `fill_form` | `elements` (required array), `includeSnapshot` | Fill multiple fields at once |
| `handle_dialog` | `action` (required: "accept"/"dismiss"), `promptText` | Handle browser dialogs |
| `hover` | `uid` (required), `includeSnapshot` | Hover over an element |
| `press_key` | `key` (required), `includeSnapshot` | Press a key (e.g. "Enter", "Control+A") |
| `type_text` | `text` (required), `submitKey` | Type into the focused element |
| `upload_file` | `filePath`, `uid` (required), `includeSnapshot` | Upload through a file input |
| `wait_for` | `text` (required array), `timeout` | Wait for text to appear |

#### Navigation (5 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `navigate_page` | `url`, `type` ("url"/"back"/"forward"/"reload"), `timeout`, `ignoreCache`, `handleBeforeUnload`, `initScript` | Navigate, or go back/forward/reload |
| `new_page` | `url` (required), `timeout`, `background`, `isolatedContext` | Open a new tab |
| `select_page` | `pageId` (required), `bringToFront` | Switch to a tab |
| `close_page` | `pageId` (required) | Close a tab |
| `list_pages` | — | List all open tabs |

#### Emulation (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `emulate` | `colorScheme`, `userAgent`, `networkConditions`, `cpuThrottlingRate`, `geolocation`, `viewport` | Emulate device, network, location |
| `resize_page` | `width`, `height` (required) | Change viewport size |

#### Debugging (6 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `take_snapshot` | `verbose`, `filePath` | Accessibility tree snapshot with element UIDs |
| `take_screenshot` | `uid`, `fullPage`, `format`, `quality`, `filePath` | Page or element screenshot |
| `evaluate_script` | `function` (required), `args`, `dialogAction`, `filePath` | Execute JavaScript |
| `list_console_messages` | `types`, `pageIdx`, `pageSize`, `includePreservedMessages` | List console output |
| `get_console_message` | `msgid` (required) | Get one console message |
| `lighthouse_audit` | `device`, `mode`, `outputDirPath` | Full performance + a11y audit |

#### Network (2 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `list_network_requests` | `resourceTypes`, `pageIdx`, `pageSize`, `includePreservedRequests` | List requests |
| `get_network_request` | `reqid`, `requestFilePath`, `responseFilePath` | Full request/response detail |

#### Performance (3 tools)

| Tool | Parameters | Description |
|------|-----------|-------------|
| `performance_start_trace` | `reload`, `autoStop`, `filePath` | Begin a trace |
| `performance_stop_trace` | `filePath` | End the trace and save |
| `performance_analyze_insight` | `insightName`, `insightSetId` (required) | Analyze a trace insight |

#### Memory / heap (13 tools)

Workflow: `take_heapsnapshot` opens a snapshot handle, the `get_*`/`query_*` tools read it, `close_heapsnapshot` releases it. Snapshots are large — always close them.

| Tool | Description |
|------|-------------|
| `take_heapsnapshot` | Capture a heap snapshot and open a handle to it |
| `close_heapsnapshot` | Release a snapshot handle |
| `compare_heapsnapshots` | Diff two snapshots — the fastest route to a leak |
| `get_heapsnapshot_summary` | Per-class totals |
| `get_heapsnapshot_details` | Snapshot metadata |
| `query_heapsnapshot_objects` | Find objects matching a query |
| `get_heapsnapshot_class_nodes` | All instances of a class |
| `get_heapsnapshot_object_details` | Inspect one object |
| `get_heapsnapshot_retainers` | What holds a reference to an object |
| `get_heapsnapshot_retaining_paths` | Full path from a GC root |
| `get_heapsnapshot_dominators` | Dominator tree — biggest retained sizes |
| `get_heapsnapshot_edges` | Outgoing references from a node |
| `get_heapsnapshot_duplicate_strings` | Duplicated strings wasting heap |

#### Not available in this configuration

Because the MCP attaches to an existing browser rather than launching it, these require a pipe connection and are **absent**: `install_extension`, `list_extensions`, `reload_extension`, `trigger_extension_action`, `uninstall_extension`, and the PWA tools. Do not attempt them. Screencast (`screencast_start`/`screencast_stop`) needs `--experimentalScreencast` plus ffmpeg; third-party and WebMCP tools need `--categoryExperimentalThirdParty`. None of these are enabled.

### Configuration Flags

Set in the wrapper, not per-project. Change them in `C:/Users/enthu/AgentBrowsers/bin/agent-browser.mjs`.

| Flag | Status here |
|------|-------------|
| `--browserUrl` | **Always on.** The whole point — attach instead of launch. |
| `--memoryDebugging` | On. Enables the heapsnapshot family. |
| `--experimentalVision` | On. Enables `click_at`. |
| `--headless` | **Never.** Re-triggers the Google sign-in wall. |
| `--isolated` | **Never.** Throwaway profile — loses the login. |
| `-e` / `--executablePath` | Not used; the wrapper launches the browser itself. |
| `--channel` | Not used. |

Environment overrides, if ever needed:

| Variable | Effect |
|----------|--------|
| `AGENT_BROWSER_EXE` | Use a different browser binary |
| `AGENT_BROWSERS_ROOT` | Move the profiles/registry root |
| `AGENT_BROWSER_MCP_PKG` | Pin a specific chrome-devtools-mcp version |

### Tips

1. **Always `take_snapshot` before any click/fill** — you need element UIDs from the accessibility tree.
2. **Use `fill_form` over multiple `fill` calls** — significantly faster and more reliable.
3. **Keep max 6 tabs open** — close unused tabs before opening new ones. The browser is persistent and shared across sessions in this project, so tabs you leave open are still there next session. Clean up after yourself.
4. **The browser is already signed into the user's Google account.** Treat it as the user's own logged-in session: it can read their mail, drive, and calendar. Do not navigate to account-management or purchase pages, change account settings, or send anything from their account unless explicitly asked.
5. **Use `verbose: true` on `take_snapshot`** when the default view is not enough.
6. **Use `initScript` on `navigate_page`** to inject JavaScript before the page's own scripts run (useful for mocking APIs or setting globals).
7. **`lighthouse_audit`** gives performance + accessibility in one call — prefer it over manual checks.
8. **Use `wait_for` after form submission or navigation** to wait for the page to update before the next action.
9. **For memory leaks**, `take_heapsnapshot` before and after, then `compare_heapsnapshots`; `get_heapsnapshot_retaining_paths` explains why an object survived. Always `close_heapsnapshot`.

### If a site blocks you

The browser is real and signed in, so most sites behave. When one still walls you — a Cloudflare interstitial, a CAPTCHA, HTTP 403/429 — **stop and report it**. Say which host and which signature you saw.

Do not attempt to defeat the challenge: no solver services, no re-request loops, no UA or fingerprint spoofing to look like a different client. Beyond being a bad idea, it does not work, and it risks the signed-in Google session attached to this profile.

Prefer routing around: the site's RSS/Atom feed, `sitemap.xml`, JSON-LD embedded in the page, or a documented public API. If none exist, report the block and let the user decide.
