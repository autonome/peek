#!/bin/bash
# Deploy server to Railway by updating the deploy/server branch
# with only backend/server/ contents at the root.
#
# Railway uses npm (not yarn). The deploy branch must not contain
# yarn.lock, otherwise Nixpacks will use yarn and fail.
#
# In a jj-managed repo, git subtree must run from the repo root
# (where .git lives), not from a workspace subdirectory.
set -e

# Find the jj repo root (where .git lives)
REPO_ROOT="$(jj workspace root)"

# If we're in a jj workspace, the repo root may differ from workspace root.
# Walk up to find the directory containing .git
DIR="$REPO_ROOT"
while [ ! -d "$DIR/.git" ] && [ "$DIR" != "/" ]; do
  DIR="$(dirname "$DIR")"
done

if [ ! -d "$DIR/.git" ]; then
  echo "Error: could not find .git directory" >&2
  exit 1
fi

# Sync jj state to git
jj git export

cd "$DIR"

# Split backend/server/ into a standalone branch
git subtree split --prefix=backend/server -b deploy/server

# Remove yarn.lock from deploy branch if present (Railway uses npm)
if git show deploy/server:yarn.lock &>/dev/null; then
  echo "Removing yarn.lock from deploy/server branch (Railway uses npm)..."
  CURRENT_BRANCH="$(git symbolic-ref --short HEAD 2>/dev/null || git rev-parse HEAD)"
  git checkout deploy/server
  git rm -f yarn.lock
  git commit -m "chore: remove yarn.lock (Railway uses npm)"
  git checkout "$CURRENT_BRANCH"
fi

# Push to GitHub
git push github deploy/server
echo "Pushed deploy/server branch to GitHub"
