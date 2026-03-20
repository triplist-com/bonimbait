---
name: git-guardrails-claude-code
description: Set up Claude Code hooks to block dangerous git commands (push, reset --hard, clean, branch -D) before execution. Use when user wants git safety hooks, guardrails, or to prevent destructive git operations.
---

# Git Guardrails for Claude Code

Set up a PreToolUse hook that blocks dangerous git commands before Claude can execute them.

## Protected Commands

- `git push` (including force variants)
- `git reset --hard`
- `git clean -f` / `git clean -fd`
- `git branch -D`
- `git checkout .` / `git restore .`

When blocked, Claude receives a message indicating it lacks authority.

## Installation

### 1. Choose scope

Ask user: "Project-level (`.claude/settings.json`) or global (`~/.claude/settings.json`)?"

### 2. Copy the blocking script

The script is at [scripts/block-dangerous-git.sh](scripts/block-dangerous-git.sh).

Copy it to the hooks directory:

- **Project**: `.claude/hooks/block-dangerous-git.sh`
- **Global**: `~/.claude/hooks/block-dangerous-git.sh`

Make executable: `chmod +x <path>`

### 3. Update settings

Add a `PreToolUse` hook to the chosen settings file:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": ["<path-to-script>"]
      }
    ]
  }
}
```

Merge with existing settings — don't replace.

### 4. Customize (optional)

Ask: "Would you like to modify the blocked patterns?"

The patterns are in the copied script — user can edit directly.

### 5. Test

```bash
echo '{"tool_name":"Bash","tool_input":{"command":"git push origin main"}}' | bash <path-to-script>
```

Should exit with code 2 and print "BLOCKED" to stderr.
