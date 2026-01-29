# Research: Tauri Mobile (iOS/Android) and Android Backend Planning for Peek

## Executive Summary

**Tauri iOS**: Production-ready as of v2.0 (October 2024), uses WKWebView, requires Xcode/macOS for development. Native APIs accessible via Swift plugins.

**Tauri Android**: Production-ready, uses Chromium-based WebView, minimum API 24 (Android 7.0). Native APIs via Kotlin plugins.

**Recommendation**: Use Tauri Mobile + Shared Rust Core (Option A) for Android - leverages existing architecture, unified sync, eliminates dual-storage bugs seen in iOS.

---

## 1. Tauri iOS Current State (2026)

**Status**: Production-ready but not fully feature-complete

**Key Findings**:
- **Production Readiness**: Tauri v2.0 (released October 2, 2024) enables production-ready iOS apps
- **Webview Engine**: Uses iOS's **WKWebView (WebKit)** - same as macOS, providing consistent behavior
- **Development Model**: Requires Xcode; development only available on macOS
- **API Access Mechanism**: Native APIs accessible via plugins written in Swift

**Limitations vs Desktop Tauri**:
- Not all desktop features/plugins ported to mobile yet
- Some configuration options documented but not implemented in Tauri 2.9.x
- Requires native Swift code for features beyond basic webview functionality

**WKWebView Specifics**:
- Consistent WebKit implementation across iOS/macOS
- Delegates and Objective-C interoperability handled by Tauri's wry library
- Full capability/permission system available (granular security constraints per window)
- Safari Web Inspector required for iOS debugging

**Security & Permissions**:
- Capabilities system for granular permission control
- App Group containers for secure inter-process communication (as Peek uses)
- Entitlements model familiar to iOS developers

---

## 2. Tauri Android Current State (2026)

**Status**: Production-ready but incomplete feature parity with desktop

**Key Findings**:
- **Production Readiness**: Tauri v2.0 includes stable Android support; minimum API level: Android 7.0 (API 24)
- **Webview Engine**: Uses **Chromium-based Android WebView** (updatable via Play Store)
- **Development Tools**: Android Studio project under the hood - follows official Android practices
- **API Access Mechanism**: Native APIs via plugins written in Kotlin (or Java)

**Native Android Integration**:
- **Chrome Custom Tabs** available for enhanced web interaction (requires custom Kotlin plugin)
- **Plugin Model**: Full Kotlin/Java support with annotations for exposing functions
- **Available Plugins**: NFC, Barcode Scanner, Biometric, Haptics, Geolocation (contributed by CrabNebula)
- **JNI Support**: Can call shared code even when WebView suspended

**Performance Considerations**:
- Chromium WebView generally performant
- Plugin communication via message bridge (or JSI equivalent for deeper integration)
- Can access native Android APIs (notifications, share sheet, etc.) via plugins

---

## 3. Existing Peek Mobile Approach

**Current iOS Strategy** (from codebase review):

**Architecture**:
- **Desktop**: Tauri v2 Rust backend with React frontend
- **iOS**: Currently Tauri-based approach (not React Native)
- **Backend**: Rust with SQLite; Share Extension uses Swift/GRDB
- **Dual Storage Issue**: Main app (Rust/rusqlite) and Share Extension (Swift/GRDB) both access same database

**Problems with Current Dual Storage**:
- Schema divergence bugs (e.g., `'page'` vs `'url'` type mismatch)
- Duplicated business logic (frecency calculation, tag management)
- Type sync issues requiring manual coordination

**Current Data Stack**:
- SQLite in iOS App Groups container (`group.com.dietrich.peek-mobile`)
- WAL mode for concurrent access
- Webhook sync to backend server
- Unified items table (pages, texts, tagsets)

**Mozilla/UniFFI Proposal** (from `notes/mozilla-approach-proposal.md`):

The team has already researched a migration to unified Rust core:

**Solution**: Extract database operations into dedicated Rust crate (`peek-core`) with:
- UniFFI bindings to generate Swift code automatically
- Single source of truth for schema and business logic
- XCFramework distribution to both main app and Share Extension

**Timeline**: 2-3 weeks of focused work
- Week 1: Create peek-core crate, add UniFFI annotations
- Week 2: Build XCFramework, integrate with Share Extension
- Week 3: Testing, edge cases, CI/CD updates

---

## 4. Android Backend Planning

**Recommended Approach**: Build on existing Tauri architecture with Android-specific considerations

**Proposed Architecture**:

```
┌─────────────────────────────────────────────────┐
│          PEEK ANDROID (Tauri + Kotlin)          │
├─────────────────────────────────────────────────┤
│                                                 │
│  React Frontend (same as iOS/Desktop)           │
│  ↓                                              │
│  Tauri Android Backend                          │
│  ├── Rust core (shared with iOS)                │
│  ├── Kotlin plugins for:                        │
│  │   ├── Notifications (FCM integration)        │
│  │   ├── Share sheet integration                │
│  │   ├── Chrome Custom Tabs for extensions      │
│  │   └── Device-specific permissions            │
│  └── SQLite storage (same schema as iOS/Server) │
│                                                 │
└─────────────────────────────────────────────────┘
```

**Data Storage Strategy**:
- **Single SQLite database** (not dual-path like iOS currently is)
- Shared via Android's content provider architecture
- Same schema as server and iOS to enable sync

**Key Android-Specific Features**:
1. **Share Sheet Integration**: Custom Kotlin plugin to handle incoming URLs/text
2. **Chrome Custom Tabs** (optional): For opening browser-like URLs with extension support
3. **Notifications**: FCM-based sync notifications
4. **Permissions**: Granular Android permission requests via Tauri capabilities system
5. **Storage**: Android's scoped storage compliant (API 30+)

**Shared Rust Core Strategy**:

```rust
peek-core/
├── src/
│   ├── lib.rs           # Public API
│   ├── db.rs            # Database operations
│   ├── schema.rs        # SQLite schema
│   ├── items.rs         # Item CRUD
│   ├── tags.rs          # Frecency scoring
│   ├── sync.rs          # Sync operations
│   └── types.rs         # Shared enums/structs
├── uniffi.toml          # UniFFI configuration
└── Cargo.toml
```

**Can be used by**:
- iOS main app (Rust direct calls)
- iOS Share Extension (via UniFFI -> Swift bindings -> XCFramework)
- Android app (via JNI bindings)
- Desktop (via existing Tauri FFI or direct Rust usage)

**Benefits**:
- Single implementation of frecency, dedup, sync logic
- Consistent schema across all platforms
- Type safety via Rust enums (no more `'page'` vs `'url'` bugs)
- Easier testing (test Rust once, works everywhere)

---

## 5. Comparison: Tauri Mobile vs React Native vs Native Kotlin

| Aspect | Tauri Mobile | React Native | Native Kotlin |
|--------|--------------|--------------|---------------|
| **Learning Curve** | Moderate (Rust + Web) | Low (React.js) | Medium (Kotlin) |
| **Code Reuse** | Share with desktop Tauri | Share with React Web | Platform-specific |
| **Performance** | High (native WebView) | Good (bridge overhead) | Best (native) |
| **Feature Parity** | Desktop -> iOS/Android | Mobile-first | Full platform access |
| **Development Speed** | Moderate (fewer plugins) | Fast (large ecosystem) | Slow (more native code) |
| **Native API Access** | Via plugins (Rust/Swift/Kotlin) | Via JSI or bridges | Direct |
| **Bundle Size** | Moderate (~50-100MB) | Moderate (~50-150MB) | Small (~30-50MB) |
| **Ecosystem** | Growing | Mature | Mature |

**For Peek's use case (browser-like app with extensions)**:
- **Tauri Mobile**: Best fit - can share React UI with desktop, Rust core for sync logic
- **React Native**: Viable if willing to port UI to React Native primitives
- **Native Kotlin**: Overkill, highest dev cost, abandons code sharing

---

## 6. Recommended Path Forward

### Option A (Recommended): Tauri Mobile + Shared Rust Core

- **Pros**: Leverages existing architecture, code sharing with desktop, unified sync
- **Cons**: Smaller plugin ecosystem, newer framework
- **Effort**: 8-12 weeks for MVP (storage + share integration + sync)
- **Risk**: Low (pattern proven in iOS)

### Option B: React Native + Rust via UniFFI

- **Pros**: Mature ecosystem, strong community
- **Cons**: Requires learning React Native primitives, separate build pipeline
- **Effort**: 6-10 weeks for MVP
- **Risk**: Medium (bridge sync logic needed)

### Option C: Native Kotlin (Not recommended)

- **Cons**: Abandons code sharing, maximum maintenance burden
- Only if Android-only optimization is critical

**Verdict**: **Option A (Tauri + Rust Core)** is the strategic fit for Peek.

---

## 7. Implementation Phases

### Phase 1 (2-4 weeks): Foundation

1. **Unify iOS Storage** (if not already done):
   - Migrate to single Rust core via UniFFI
   - Eliminate Swift/Rust dual-path bugs
   - Establish pattern for Android to follow

2. **Plan Android Architecture**:
   - Tauri setup for Android (`cargo tauri android dev`)
   - Design Kotlin plugin layer

### Phase 2 (4-8 weeks): Android Implementation

1. **Android Backend**:
   - SQLite with shared schema (no dual-storage)
   - Share Extension equivalent (Android share receiver)

2. **Kotlin Plugin Development**:
   - Notifications (FCM)
   - Share sheet integration
   - Chrome Custom Tabs (optional)
   - Biometric auth (optional)

### Phase 3+: Feature Parity

- Command palette on mobile
- Frecency + adaptive matching UI
- Tag management UI
- App Store / Play Store submission

---

## Resources & Links

**Official Documentation**:
- [Tauri 2.0 Release](https://v2.tauri.app/)
- [Tauri iOS/Android Prerequisites](https://v2.tauri.app/start/prerequisites/)
- [Tauri Mobile Plugin Development](https://v2.tauri.app/develop/plugins/develop-mobile/)
- [App Store Distribution](https://v2.tauri.app/distribute/app-store/)
- [Google Play Distribution](https://v2.tauri.app/distribute/google-play/)

**UniFFI & Mozilla Approach**:
- [UniFFI GitHub](https://github.com/mozilla/uniffi-rs)
- [Mozilla Application-Services Documentation](https://mozilla.github.io/application-services/book/)
- [Running Rust on Android with UniFFI](https://sal.dev/android/intro-rust-android-uniffi/)
- [Building iOS App with Rust Using UniFFI](https://dev.to/almaju/building-an-ios-app-with-rust-using-uniffi-200a)
- [Integrating with Xcode](https://mozilla.github.io/uniffi-rs/latest/swift/xcode.html)
- [UniFFI for React Native (2024)](https://hacks.mozilla.org/2024/12/introducing-uniffi-for-react-native-rust-powered-turbo-modules/)

**WebView & Performance**:
- [Exploring System WebViews in Tauri](https://dev.to/shrsv/exploring-system-webviews-in-tauri-native-rendering-for-efficient-cross-platform-apps-9hl)
- [Wry (Tauri's WebView library)](https://github.com/tauri-apps/wry)
- [Chrome Custom Tabs with Kotlin](https://medium.com/@esracangungor/chrome-custom-tabs-with-kotlin-fecce1daf8a7)

**Framework Comparisons**:
- [React Native vs Tauri Comparison](https://buildwith.app/compare/reactnative-vs-tauri)
- [Universal Stack: React Native + Next.js + Tauri](https://medium.com/@fadiabdelmessih/the-true-universal-stack-why-react-native-next-js-and-tauri-beat-the-competition-c34538f2739b)
- [Tauri v2: One Codebase 4 All](https://andamp.io/blog/tauri-v2-one-codebase-4-all)
