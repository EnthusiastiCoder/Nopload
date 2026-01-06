---
name: introspect
description: End-of-session introspection — objectively list mistakes, root causes, and lessons. Run at the end of every session.
user_invocable: true
---

# Session Introspection

You are performing an honest, objective post-mortem of this session. No guessing, no false confidence, no dodging accountability.

## Instructions

### Phase 1: Draft the introspection
1. Create the `mistakes/` directory at the workspace root (`C:\Users\enthu\Projects\Nopload\mistakes\`) if it doesn't exist
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
