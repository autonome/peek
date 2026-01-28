#!/bin/bash
# Deploy server to Railway by updating the deploy/server branch
# with backend/server/ contents at the root.
#
# Railway uses npm (not yarn). The deploy branch must not contain
# yarn.lock, otherwise Nixpacks will use yarn and fail.
set -e

# Find the jj repo root (where .git lives)
REPO_ROOT="$(jj workspace root)"
DIR="$REPO_ROOT"
while [ ! -d "$DIR/.git" ] && [ "$DIR" != "/" ]; do
  DIR="$(dirname "$DIR")"
done

if [ ! -d "$DIR/.git" ]; then
  echo "Error: could not find .git directory" >&2
  exit 1
fi

cd "$DIR"

echo "=== Server Deploy ==="
echo ""

# Auto-commit any pending jj changes
if [ -n "$(jj diff --stat 2>/dev/null)" ]; then
  echo ">>> Auto-committing pending changes..."
  jj commit -m "chore: auto-commit for deploy"
fi

# Sync jj state to git and ensure git main matches jj main
echo ">>> Syncing jj → git..."
jj git export
MAIN_COMMIT=$(jj log -r main --no-graph -T 'commit_id' 2>/dev/null)
git branch -f main "$MAIN_COMMIT" 2>/dev/null || true

# Show what we're deploying
echo ""
echo ">>> Deploying from main:"
jj log -r main --no-graph -T 'commit_id.short(12) ++ " " ++ description.first_line()' 2>/dev/null
echo ""

# Show recent server changes
echo ">>> Recent server changes:"
jj log -r 'ancestors(main, 5)' --no-graph -T 'if(diff.contains("backend/server/"), change_id.short(8) ++ " " ++ description.first_line() ++ "\n")' 2>/dev/null | head -10
echo ""

# Ensure deploy/server branch exists
if ! git rev-parse --verify deploy/server &>/dev/null; then
  echo "Creating deploy/server branch..."
  git checkout --orphan deploy/server
  git rm -rf . 2>/dev/null || true
  git commit --allow-empty -m "Initial deploy/server branch"
  git checkout main
fi

# Create temp worktree for deploy branch
DEPLOY_DIR=$(mktemp -d)
trap "rm -rf $DEPLOY_DIR; git worktree remove $DEPLOY_DIR --force 2>/dev/null || true" EXIT

git worktree add "$DEPLOY_DIR" deploy/server

# Use jj to get the actual files (avoids git working tree sync issues)
echo "Syncing backend/server/ to deploy branch..."
rm -rf "$DEPLOY_DIR"/* 2>/dev/null || true
jj file list -r main -- backend/server/ | while read f; do
  REL="${f#backend/server/}"
  [ "$REL" = "yarn.lock" ] && continue
  mkdir -p "$DEPLOY_DIR/$(dirname "$REL")"
  jj file show "$f" -r main > "$DEPLOY_DIR/$REL"
done

# Commit and push if there are changes
cd "$DEPLOY_DIR"
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "deploy: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "Committed new deployment"
else
  echo "No changes to deploy"
fi

# Push to GitHub
git push github deploy/server --force-with-lease 2>/dev/null || git push github deploy/server -f
echo "Pushed deploy/server branch to GitHub"
