# Peek Agent Instructions

Project-specific rules and context for agents working on Peek.

**Remotes:**
- Tangled: `git@tangled.sh:burrito.space/peek` (primary)
- GitHub: `git@github.com:autonome/peek`

---

## Critical Rules

1. **NEVER modify `./app` without approval** - Backend-agnostic, must work with Electron and Tauri unchanged.

2. **Only use `yarn kill` for dev processes** - Never `pkill -f "Peek"` or similar (kills production app).

3. **NEVER combine shell commands** - Do not use `&&`, `;`, or `|` to chain commands. Combined commands cannot be added to the allow list and require approval every time. Run commands separately, or create a script in `package.json` or `scripts/`.

---

## Documentation

- `DEVELOPMENT.md` - Architecture, commands, mobile, server deployment
- `docs/api.md` - Peek API reference
- `docs/mobile.md` - iOS/Android development
- `docs/sync.md` - Sync architecture
