# Research: Bundled Web Extensions for Peek

## Executive Summary

Bundling a small set of extensions (uBlock Origin, Proton Pass) with Peek for Electron is **technically feasible but requires careful architectural decisions**. The primary challenge is **API coverage limitations** and **licensing complexity**, particularly around the Manifest V2→V3 transition.

**Key Recommendation**: Use electron-chrome-extensions for MV2 support (short term) or Polypane's fork for MV3, implement a hybrid approach with native ad-blocking fallback, and establish clear licensing disclosures for bundled extensions.

---

## 1. electron-chrome-extensions Analysis

**Status**: Actively maintained as of 2025
- **Repository**: [samuelmaddock/electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell)
- **Alternative Fork**: [Polypane/electron-chrome-extensions](https://github.com/Polypane/electron-chrome-extensions) (provides MV3 support)

**Capabilities**:
- Loads unpacked Chrome extensions from filesystem
- Supports customizable API behavior for tab/window management
- Extensions run in isolated BrowserWindow processes
- Tabs API supported with customizable callbacks

**Critical Limitations**:
- **Manifest V2 only** in samuelmaddock's version (MV3 blocked in Chromium for security)
- **webRequest API conflict**: Using Electron's webRequest prevents chrome.webRequest listeners from firing
- **No incognito/private session support** for extensions
- **MV3 limitations**: webRequest is restricted to force-installed extensions only; uses limited declarativeNetRequest instead

**Licensing**: MIT, but contact author for proprietary-use license

---

## 2. Bundling Approach

**How to Bundle**:
1. Place extension code in app's resources directory (unpacked)
2. Load on startup: `session.extensions.loadExtension(extensionPath)`
3. Extensions not automatically remembered across restarts—must re-load on each start
4. Configuration: Only enable/disable per extension via settings

**Build Integration**:
- Copy unpacked extension directories into `app.asar` or unpacked resources folder
- Load paths at startup via main process IPC
- Settings stored in app datastore to track enable/disable state per extension

**Note**: Electron does NOT natively support .crx files—only unpacked extensions work.

---

## 3. Extension-Specific Findings

### uBlock Origin (ad blocker)

**License**: GPLv3 (open source)

**APIs Required**:
- **Critical**: chrome.webRequest (blocking version) - for network filtering
- **Secondary**: chrome.tabs, chrome.storage, chrome.runtime

**Manifest V3 Impact**:
- **Broken in MV3**: webRequest blocking removed
- Google provides only declarativeNetRequest (rule-based, ~30K rule limit)
- Creator has stated MV3 makes full uBlock functionality "technically impossible"

**Viability in Peek**:
- ✅ Works in Electron with electron-chrome-extensions (uses MV2)
- ⚠️ Risk: If uBlock migrates to MV3, declarativeNetRequest support needed

### Proton Pass (password manager)

**License**: GPLv3 (open source codebase, proprietary service)

**APIs Required**:
- chrome.webRequest (non-blocking, for content injection)
- chrome.tabs, chrome.storage, chrome.runtime

**Manifest V3 Support**:
- ✅ **Better positioned than uBlock** - non-blocking webRequest is supported
- Simpler feature set (no blocking needed)

**Viability in Peek**:
- ✅ Works well with electron-chrome-extensions
- ✅ MV3 compatible without major changes
- ⚠️ Requires Proton account for full sync features

---

## 4. API Coverage Matrix

| API | uBlock | Proton Pass | Electron Support | MV3 Status |
|-----|--------|-------------|------------------|------------|
| webRequest (blocking) | ✅ Critical | ❌ Not needed | ✅ Yes (conflicts) | ❌ Restricted |
| webRequest (non-blocking) | ❌ Insufficient | ✅ Yes | ✅ Yes | ✅ Yes |
| tabs | ✅ Yes | ✅ Yes | ✅ Customizable | ✅ Yes |
| storage | ✅ Yes | ✅ Yes | ✅ Yes | ✅ Yes |
| cookies | ✅ Optional | ❌ No | ✅ Yes | ✅ Yes |
| declarativeNetRequest | ❌ (MV3 only) | ✅ Can use | ⚠️ Partial | ✅ Yes |

---

## 5. Alternative Approaches

**Option A: Native Ad Blocking** - [@cliqz/adblocker-electron](https://www.npmjs.com/package/@cliqz/adblocker-electron)
- Covers 99% of uBlock Origin + Easylist filters
- No webRequest API conflicts
- Simpler deployment, smaller attack surface

**Option B: Hybrid Approach** (Recommended)
- Use native ad blocker for core needs
- Bundle Proton Pass as full extension (most compatible)

**Option C: Built-in Equivalents**
- Password manager: Built-in secure storage + autofill
- Ad blocker: Native implementation via webRequest in main process

---

## 6. Licensing Considerations

| Extension | License | Bundling OK? | Notes |
|-----------|---------|--------------|-------|
| uBlock Origin | GPLv3 | ✅ Yes | Must acknowledge GPL, include source |
| Proton Pass | GPLv3 | ✅ Yes | Open source + proprietary service |

**Disclosure Requirements**:
- Display list of bundled extensions with versions in Settings
- Link to source repositories
- Disclose GPL licensing in app credits

---

## 7. Security Considerations

**Risks**:
- Extensions run in isolated BrowserWindow processes (good)
- Each extension gets full webRequest access (risky)
- No ability to restrict permissions per extension

**Mitigations**:
- ✅ Bundle only well-known, maintained projects
- ✅ Validate extension code at build time (sign/hash)
- ✅ Use Electron's sandbox: `sandbox: true`
- ✅ Limit to utility functions (no main process access)
- ⚠️ Monitor for security advisories

---

## 8. Implementation Phases

### Phase 1: Research & Setup (1-2 weeks)
- [ ] Clone electron-chrome-extensions, test with sample extension
- [ ] Evaluate Polypane fork for MV3 support readiness
- [ ] Create extension bundling directory structure
- [ ] Prototype loading via session.extensions.loadExtension()

### Phase 2: Proof of Concept (2-3 weeks)
- [ ] Bundle & load Proton Pass (easiest, most compatible)
- [ ] Implement enable/disable toggle in Settings UI
- [ ] Test basic functionality (password saving/autofill)

### Phase 3: Ad Blocking (2-3 weeks)
- [ ] Integrate @cliqz/adblocker-electron as native solution
- [ ] OR address webRequest conflict for uBlock Origin
- [ ] Measure performance impact

### Phase 4: Polish (1-2 weeks)
- [ ] Per-extension settings UI (if extensions provide manifests)
- [ ] Licensing/attribution UI in About dialog
- [ ] Security review of bundled code

---

## 9. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| webRequest conflict | uBlock fails | Use @cliqz/adblocker native |
| MV3 migration | uBlock breaks | Monitor; plan native fallback |
| Memory/CPU impact | App bloat | Profile; lazy-load extensions |
| Security vulnerability | RCE via extension | Sandbox; audit code |

---

## 10. Recommended Path Forward

**Immediate (MVP)**:
1. Use [Polypane/electron-chrome-extensions](https://github.com/Polypane/electron-chrome-extensions) (MV3-ready)
2. Bundle **Proton Pass only** (best compatibility, no licensing issues)
3. Implement toggle in Settings UI

**Short-term**:
4. Add **@cliqz/adblocker-electron** as native ad blocker (no webRequest conflicts)
5. Monitor uBlock Origin MV3 progress; defer until stable

**Long-term**:
7. If uBlock MV3 becomes viable, bundle as opt-in
8. Consider extension update mechanism

---

## Resources

- [samuelmaddock/electron-browser-shell](https://github.com/samuelmaddock/electron-browser-shell)
- [Polypane/electron-chrome-extensions](https://github.com/Polypane/electron-chrome-extensions)
- [Electron Extension Support](https://www.electronjs.org/docs/latest/api/extensions)
- [uBlock Origin](https://github.com/gorhill/uBlock)
- [Proton Pass](https://proton.me/pass)
- [@cliqz/adblocker-electron](https://www.npmjs.com/package/@cliqz/adblocker-electron)
- [Chrome MV3 Overview](https://developer.chrome.com/docs/extensions/develop/migrate/what-is-mv3)
