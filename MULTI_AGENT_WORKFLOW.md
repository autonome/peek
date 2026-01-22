# Multi-Agent Development Workflow for Peek

## Overview

Parallel AI agent development using jj workspaces + tmux for the Peek project. Work on desktop, mobile, server, and other components simultaneously in isolated worktrees.

**Remotes:**
- Tangled: `git@tangled.sh:burrito.space/peek`
- GitHub: `git@github.com:autonome/peek`

---

## Setup

### 1. Add shell functions to ~/.zshrc

Copy the following to your `~/.zshrc`:

```bash
# ============================================
# Multi-agent workflow - jj workspaces + tmux
# ============================================

# --- Workspace listing ---
alias mls="jj workspace list"            # list all workspaces
alias mwin="tmux list-windows"           # list tmux windows

# --- Quick status ---
alias mlog="jj log --all"                # log across all workspaces

# --- Functions ---

# Create agent worktree with tmux window
# Usage: magent desktop-auth "Implement OAuth2 login"
function magent {
  local name="$1"
  local prompt="$2"
  local base_dir=$(dirname "$PWD")
  local repo_name=$(basename "$PWD")
  local worktree_path="${base_dir}/${repo_name}-${name}"

  # Create jj workspace
  jj workspace add "$worktree_path" --name "$name"

  # Create tmux window
  tmux new-window -n "$name" -c "$worktree_path"

  # Start claude with prompt if provided
  if [[ -n "$prompt" ]]; then
    tmux send-keys -t "$name" "claude \"$prompt\"" Enter
  else
    tmux send-keys -t "$name" "claude" Enter
  fi

  echo "Created workspace: $name"
  echo "Worktree: $worktree_path"
}

# Clean up agent workspace
# Usage: mclean desktop-auth
function mclean {
  local name="$1"
  local base_dir=$(dirname "$PWD")
  local repo_name=$(basename "$PWD")
  local worktree_path="${base_dir}/${repo_name}-${name}"

  # Forget workspace
  jj workspace forget "$name" 2>/dev/null

  # Remove directory
  if [[ -d "$worktree_path" ]]; then
    rm -rf "$worktree_path"
    echo "Removed: $worktree_path"
  fi

  # Kill tmux window
  tmux kill-window -t "$name" 2>/dev/null && echo "Killed window: $name"
}

# List all agents with status
# Usage: magents
function magents {
  echo "=== Workspaces ==="
  jj workspace list 2>/dev/null || echo "(not in a jj repo)"
  echo ""
  echo "=== Tmux Windows ==="
  tmux list-windows -F "  #{window_index}: #{window_name}" 2>/dev/null || echo "(no tmux session)"
}

# Switch to agent window
# Usage: mgo desktop-auth
function mgo {
  tmux select-window -t "$1"
}

# Squash and describe current workspace changes
# Usage: mdone "feat(desktop): add OAuth2 login"
function mdone {
  jj squash -m "$1"
  echo "Squashed with: $1"
}

# Review diff in agent workspace
# Usage: mreview desktop-auth
function mreview {
  local name="$1"
  local base_dir=$(dirname "$PWD")
  local repo_name=$(basename "$PWD")
  local worktree_path="${base_dir}/${repo_name}-${name}"

  if [[ -d "$worktree_path" ]]; then
    jj diff --from main --to "$name"
  else
    echo "Workspace not found: $name"
  fi
}

# Merge agent work to main and cleanup
# Usage: mmerge desktop-auth "feat(desktop): add OAuth2"
function mmerge {
  local name="$1"
  local message="$2"
  local base_dir=$(dirname "$PWD")
  local repo_name=$(basename "$PWD")
  local worktree_path="${base_dir}/${repo_name}-${name}"

  # Squash in the workspace
  (cd "$worktree_path" && jj squash -m "$message")

  # Cleanup
  mclean "$name"

  echo "Merged and cleaned: $name"
}

# Push to all remotes (tangled + github)
# Usage: mpush
function mpush {
  jj bookmark set main -r @- 2>/dev/null
  jj git push --all-remotes
}

# Spawn multiple agents from a task file
# Usage: mspawn tasks.txt
# Format: each line is "name: prompt"
function mspawn {
  local taskfile="$1"
  if [[ ! -f "$taskfile" ]]; then
    echo "Task file not found: $taskfile"
    return 1
  fi

  while IFS=': ' read -r name prompt; do
    [[ -z "$name" || "$name" == \#* ]] && continue
    echo "Spawning: $name"
    magent "$name" "$prompt"
    sleep 1  # Brief pause between spawns
  done < "$taskfile"
}
```

Then reload: `source ~/.zshrc`

### 2. Initialize the repo

```bash
cd ~/projects
git clone git@github.com:autonome/peek peek
cd peek
jj git init --colocate

# Add remotes
jj git remote add tangled git@tangled.sh:burrito.space/peek
jj git remote add github git@github.com:autonome/peek
```

### 3. Start a tmux session

```bash
tmux new-session -s peek -n coord
```

---

## Shell Commands Reference

| Command | Description |
|---------|-------------|
| `magent <name> "prompt"` | Create workspace + tmux window, start claude |
| `mclean <name>` | Remove workspace, directory, and tmux window |
| `magents` | List all workspaces and tmux windows |
| `mgo <name>` | Switch to agent's tmux window |
| `mdone "message"` | Squash current workspace changes |
| `mreview <name>` | Show diff for agent workspace vs main |
| `mmerge <name> "msg"` | Squash, merge to main, cleanup |
| `mpush` | Push to all remotes |
| `mspawn tasks.txt` | Spawn multiple agents from file |
| `mstatus` | Show all agent statuses |
| `mwatch` | Watch agent status (live updates) |
| `mnotify "title" "msg"` | Send desktop notification |
| `mls` | List jj workspaces |
| `mwin` | List tmux windows |
| `mlog` | Log across all workspaces |

---

## Workflow

### Directory Structure

```
~/projects/
├── peek/                    # Main working copy
├── peek-desktop-auth/       # Agent worktree
├── peek-mobile-offline/     # Agent worktree
└── peek-server-api/         # Agent worktree
```

### Typical Session

**1. Start coordinator**
```bash
cd ~/projects/peek
tmux new-session -s peek -n coord
claude
```

Ask claude to explore and create a task list:
> "Explore the codebase and create TODO.md with improvements by component"

**2. Spawn agents**
```bash
magent desktop-auth "Implement OAuth2 login. See TODO.md"
magent mobile-offline "Add offline caching. See TODO.md"
magent server-api "Refactor REST API to OpenAPI. See TODO.md"
```

**3. Monitor**
```bash
magents              # See all workspaces/windows
Ctrl-b 1             # Switch to window 1
Ctrl-b 2             # Switch to window 2
mreview desktop-auth # Review agent's diff
```

**4. Merge completed work**
```bash
mmerge desktop-auth "feat(desktop): add OAuth2 login"
mpush                # Push to tangled + github
```

### Batch Spawning

Create a task file:
```
# tasks.txt
desktop-auth: Implement OAuth2 login for desktop app
mobile-offline: Add offline caching for mobile
server-api: Refactor REST API to use OpenAPI spec
```

Spawn all at once:
```bash
mspawn tasks.txt
```

---

## Tmux Tips

```bash
Ctrl-b c          # New window
Ctrl-b <number>   # Switch to window
Ctrl-b ,          # Rename window
Ctrl-b w          # Window picker
Ctrl-b d          # Detach session
tmux attach -t peek  # Reattach
```

---

## jj Tips

```bash
jj workspace list           # See all workspaces
jj log -r 'all()'           # Log all changes
jj diff --from main         # Diff against main
jj squash -m "message"      # Squash with message
jj git push --all-remotes   # Push to all remotes
```

### Handling Conflicts

If two agents modify the same files:
```bash
jj git fetch
jj rebase -s <change-id> -d <other-change-id>
jj resolve
```

---

## Why Not Workmux?

We get 90% of workmux with shell functions:

| Need | Our Solution |
|------|--------------|
| Create worktree + window | `magent` |
| Cleanup | `mclean` |
| Status dashboard | `magents` + tmux window names |
| Merge workflow | `mmerge` |

**Advantages of rolling our own:**
- jj-native (workspaces, not git worktrees)
- No extra dependency
- Easy to customize
- Fewer moving parts

---

## Agent Status Protocol

Agents report their status so the coordinator can monitor progress without watching each window.

### Status States

| State | When to use | Triggers notification? |
|-------|-------------|----------------------|
| `working` | Actively working on task | No |
| `blocked` | Need input or clarification | Yes |
| `review` | Ready for human review | Yes |
| `done` | Task completed | Yes |
| `error` | Something went wrong | Yes |

### How Agents Report Status

Agents run this bash command to update status:
```bash
agent-status "state" "brief message"
```

Examples:
```bash
agent-status "working" "implementing sync API"
agent-status "blocked" "need clarification on auth approach"
agent-status "review" "sync working, ready for testing"
agent-status "done" "pushed to tangled"
agent-status "error" "build failing, see logs"
```

### When to Update Status

1. **On start**: `agent-status "working" "starting task"`
2. **On progress**: Update when switching subtasks
3. **When blocked**: Immediately, so coordinator knows
4. **When done**: Before finishing, so work can be reviewed

### Coordinator Commands

```bash
mstatus          # Show all agent statuses (one-shot)
mwatch           # Live-updating status display
```

Status files are stored in `~/.agent-status/` and include timestamps.

---

## Agent Behavior Rules

These rules apply to all Claude agents working in this system.

### Git Commit Policy

- User (dietrich ayala) is sole author of all commits
- Do not add co-author lines or "Generated with Claude" to commit messages
- Do not commit changes unless explicitly asked - leave commits to the user

### Process Management

**CRITICAL**: Only use `yarn kill` to kill dev processes. NEVER use generic pkill commands like `pkill -f "Peek"` or `pkill -f "electron"` - these will kill the user's production app.

```bash
yarn kill  # ONLY way to kill dev Peek
```

**Testing without UI**: When testing startup, logs, or non-interactive behavior, use headless mode:
```bash
./scripts/test-headless.sh 8    # Run headless for 8 seconds, auto-kills
yarn test:electron              # Run automated tests
```

Only run `yarn dev` or `yarn start` (foreground with UI) when you need the user to interact with the app.

### Protected Directories

**NEVER modify files in `./app` without explicit user approval.** The `app/` directory is backend-agnostic - it must work unchanged with both Electron and Tauri backends. All backend-specific code belongs in `backend/{electron,tauri}/`. If you think `app/` needs changes, ASK FIRST.

### TODO Management

- Project todos go in `TODO.md`, not in CLAUDE.md
- Use checkbox syntax: `- [ ] task` for pending, `- [x] task` for done
- Keep entries brief and actionable

### Status Reporting

**Agents MUST report status** so the coordinator can track progress:

```bash
# On start
agent-status "working" "starting: brief description"

# When blocked or need input
agent-status "blocked" "need clarification on X"

# When ready for review
agent-status "review" "task complete, ready for review"

# When completely done
agent-status "done" "summary of what was accomplished"
```

See "Agent Status Protocol" section above for full details.

### Agent Setup

When starting in a new workspace, get pre-configured permissions:
```bash
mkdir -p .claude
cp ~/sync/Dev/agent-workflow/claude-permissions.json .claude/settings.local.json
```

### Development Resources

- See `DEVELOPMENT.md` for architecture, commands, and common pitfalls
- See `docs/api.md` for the Peek API reference
- See `docs/extensions.md` for extension development

---

## Appendix: Workmux Reference

If you later want workmux for its config file features:

```bash
brew install raine/workmux/workmux
```

`.workmux.yaml`:
```yaml
panes:
  - command: claude
    focus: true
  - command: npm install && npm run dev
    split: horizontal

files:
  symlink:
    - node_modules
    - .jj
  copy:
    - .env
```

Main commands:
- `workmux add <name>` - Create worktree + window
- `workmux merge` - Merge to main, cleanup
- `workmux merge --rebase` - Rebase first, then merge

The config file is useful when you need:
- Auto-run setup commands per worktree
- Symlinked `node_modules` to avoid reinstalling
- Multiple panes per agent (code + dev server)
