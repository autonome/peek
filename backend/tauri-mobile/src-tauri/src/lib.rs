use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::ffi::CStr;
use std::os::raw::c_char;
use std::path::PathBuf;
use std::fs;
use std::sync::RwLock;
use reqwest;
use regex::Regex;
use tauri::Manager;

// Legacy model for backward compatibility (webhook, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedUrl {
    id: String,
    url: String,
    tags: Vec<String>,
    saved_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
}

// Text item for webhook
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedText {
    id: String,
    content: String,
    tags: Vec<String>,
    saved_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
}

// Tagset item for webhook
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedTagset {
    id: String,
    tags: Vec<String>,
    saved_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
}

// Image item
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedImage {
    id: String,
    tags: Vec<String>,
    saved_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
    // Base64-encoded thumbnail for display (smaller version)
    #[serde(skip_serializing_if = "Option::is_none")]
    thumbnail: Option<String>,
    mime_type: String,
    width: Option<u32>,
    height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TagStats {
    name: String,
    frequency: u32,
    last_used: String,
    frecency_score: f64,
}

// Webhook payload with all item types
#[derive(Debug, Clone, Serialize, Deserialize)]
struct WebhookPayload {
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    urls: Vec<SavedUrl>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    texts: Vec<SavedText>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    tagsets: Vec<SavedTagset>,
}

// Old webhook sync result (kept for backward compatibility)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncResult {
    success: bool,
    synced_count: usize,
    message: String,
}

// New bidirectional sync result
#[derive(Debug, Clone, Serialize, Deserialize)]
struct BidirectionalSyncResult {
    success: bool,
    pulled: usize,
    pushed: usize,
    conflicts: usize,
    message: String,
}

// Server item format (from GET /items)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerItem {
    id: String,
    #[serde(rename = "type")]
    item_type: String,
    content: Option<String>,
    tags: Vec<String>,
    metadata: Option<serde_json::Value>,
    created_at: String,
    updated_at: String,
}

// Server response for GET /items
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerItemsResponse {
    items: Vec<ServerItem>,
}

// Server response for POST /items
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ServerCreateResponse {
    id: String,
    created: bool,
}

// Sync status for UI display
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncStatus {
    configured: bool,
    last_sync_time: Option<String>,
    pending_count: usize,
}

// App Group bridge - just need the container path now
extern "C" {
    fn get_app_group_container_path() -> *const c_char;
    fn get_system_is_dark_mode() -> i32;
    fn is_app_store_build() -> i32;
}

/// Check if this is an App Store/TestFlight build (has receipt) vs Xcode install
fn is_production_build() -> bool {
    unsafe { is_app_store_build() == 1 }
}

// ============================================================================
// Profile Management System
// ============================================================================

/// Sync configuration (shared across all profiles)
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct SyncSettings {
    #[serde(default)]
    server_url: String,
    #[serde(default)]
    api_key: String,
    #[serde(default)]
    auto_sync: bool,
}

/// Profile configuration stored in profiles.json
#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProfileConfig {
    #[serde(rename = "currentProfileId")]
    current_profile_id: String,
    profiles: Vec<ProfileEntry>,
    #[serde(default)]
    sync: SyncSettings,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ProfileEntry {
    id: String,
    name: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "lastUsedAt")]
    last_used_at: String,
}

/// Cached profile config to avoid repeated file reads
static PROFILE_CONFIG: RwLock<Option<ProfileConfig>> = RwLock::new(None);

/// Get the App Group container path
fn get_container_path() -> Option<PathBuf> {
    unsafe {
        let c_str = get_app_group_container_path();
        if c_str.is_null() {
            println!("[Rust] Failed to get App Group container path");
            return None;
        }
        let path_str = CStr::from_ptr(c_str).to_string_lossy().to_string();
        libc::free(c_str as *mut libc::c_void);
        Some(PathBuf::from(path_str))
    }
}

/// Get the path to profiles.json
fn get_profiles_config_path() -> Option<PathBuf> {
    get_container_path().map(|p| p.join("profiles.json"))
}

/// Load profile config from file, creating default if needed
fn load_profile_config() -> ProfileConfig {
    // Check cache first
    if let Ok(guard) = PROFILE_CONFIG.read() {
        if let Some(ref config) = *guard {
            return config.clone();
        }
    }

    let config = load_profile_config_from_file();

    // Cache the loaded config
    if let Ok(mut guard) = PROFILE_CONFIG.write() {
        *guard = Some(config.clone());
    }

    config
}

/// Old format profile entry (for migration)
#[derive(Debug, Clone, Deserialize)]
struct OldProfileEntry {
    slug: String,
    name: String,
}

/// Old format profile config (for migration)
#[derive(Debug, Clone, Deserialize)]
struct OldProfileConfig {
    current: String,
    profiles: Vec<OldProfileEntry>,
}

/// Migrate from old slug-based format to new UUID-based format
fn migrate_old_profile_config(old_config: OldProfileConfig) -> ProfileConfig {
    println!("[Rust] Migrating old profile config format to new UUID-based format");
    println!("[Rust] Old config: current={}, profiles={:?}", old_config.current, old_config.profiles.iter().map(|p| &p.slug).collect::<Vec<_>>());

    let container_path = get_container_path();
    let now = Utc::now().to_rfc3339();

    // List all files in container for debugging
    if let Some(ref container) = container_path {
        println!("[Rust] Container path: {}", container.display());
        if let Ok(entries) = fs::read_dir(container) {
            println!("[Rust] Container files:");
            for entry in entries.flatten() {
                println!("[Rust]   - {}", entry.file_name().to_string_lossy());
            }
        }
    }

    let mut new_profiles = Vec::new();
    let mut current_profile_id = String::new();

    for old_profile in &old_config.profiles {
        let new_id = uuid::Uuid::new_v4().to_string();
        println!("[Rust] Processing profile: {} -> {}", old_profile.slug, new_id);

        // Rename database file from peek-{slug}.db to peek-{uuid}.db
        if let Some(ref container) = container_path {
            let old_db_path = container.join(format!("peek-{}.db", old_profile.slug));
            let new_db_path = container.join(format!("peek-{}.db", new_id));

            println!("[Rust] Looking for old DB: {} (exists: {})", old_db_path.display(), old_db_path.exists());

            if old_db_path.exists() && !new_db_path.exists() {
                println!("[Rust] Migrating database: {} -> {}", old_db_path.display(), new_db_path.display());
                if let Err(e) = fs::rename(&old_db_path, &new_db_path) {
                    println!("[Rust] Warning: Failed to rename database: {}", e);
                } else {
                    // Also rename WAL and SHM files if they exist
                    let old_wal = container.join(format!("peek-{}.db-wal", old_profile.slug));
                    let new_wal = container.join(format!("peek-{}.db-wal", new_id));
                    if old_wal.exists() {
                        let _ = fs::rename(&old_wal, &new_wal);
                    }
                    let old_shm = container.join(format!("peek-{}.db-shm", old_profile.slug));
                    let new_shm = container.join(format!("peek-{}.db-shm", new_id));
                    if old_shm.exists() {
                        let _ = fs::rename(&old_shm, &new_shm);
                    }
                    println!("[Rust] Database migration successful");
                }
            }
        }

        // If this was the current profile, remember its new ID
        if old_profile.slug == old_config.current {
            current_profile_id = new_id.clone();
        }

        new_profiles.push(ProfileEntry {
            id: new_id,
            name: old_profile.name.clone(),
            created_at: now.clone(),
            last_used_at: now.clone(),
        });
    }

    // If current profile wasn't found, use first profile or create based on build type
    if current_profile_id.is_empty() {
        if let Some(first) = new_profiles.first() {
            current_profile_id = first.id.clone();
        }
    }

    // Try to migrate sync settings from old database
    let sync = migrate_sync_settings_from_db(&container_path, &old_config.current);

    println!("[Rust] Migration complete: {} profiles, current={}", new_profiles.len(), current_profile_id);

    ProfileConfig {
        current_profile_id,
        profiles: new_profiles,
        sync,
    }
}

/// Migrate sync settings from old per-profile database to shared config
fn migrate_sync_settings_from_db(container_path: &Option<PathBuf>, old_current_slug: &str) -> SyncSettings {
    // Try to read sync settings from the old current profile's database
    if let Some(ref container) = container_path {
        let old_db_path = container.join(format!("peek-{}.db", old_current_slug));

        // The database might have already been renamed, so also check for peek.db as fallback
        let db_path = if old_db_path.exists() {
            Some(old_db_path)
        } else {
            let legacy_path = container.join("peek.db");
            if legacy_path.exists() { Some(legacy_path) } else { None }
        };

        if let Some(path) = db_path {
            if let Ok(conn) = Connection::open(&path) {
                let server_url: String = conn
                    .query_row("SELECT value FROM settings WHERE key = 'webhook_url'", [], |row| row.get(0))
                    .unwrap_or_default();
                let api_key: String = conn
                    .query_row("SELECT value FROM settings WHERE key = 'webhook_api_key'", [], |row| row.get(0))
                    .unwrap_or_default();
                let auto_sync: String = conn
                    .query_row("SELECT value FROM settings WHERE key = 'auto_sync'", [], |row| row.get(0))
                    .unwrap_or_default();

                if !server_url.is_empty() || !api_key.is_empty() {
                    println!("[Rust] Migrated sync settings from old database");
                    return SyncSettings {
                        server_url,
                        api_key,
                        auto_sync: auto_sync == "1" || auto_sync == "true",
                    };
                }
            }
        }
    }

    SyncSettings::default()
}

/// Load profile config directly from file (bypasses cache)
fn load_profile_config_from_file() -> ProfileConfig {
    let config_path = match get_profiles_config_path() {
        Some(p) => p,
        None => {
            println!("[Rust] No config path available, creating default config");
            return create_default_profile_config();
        }
    };

    println!("[Rust] Loading profile config from: {} (exists: {})", config_path.display(), config_path.exists());

    if config_path.exists() {
        match fs::read_to_string(&config_path) {
            Ok(contents) => {
                // First try to parse as new format
                match serde_json::from_str::<ProfileConfig>(&contents) {
                    Ok(config) => {
                        println!("[Rust] Loaded profile config: current={}", config.current_profile_id);
                        // Check if we need to migrate old slug-based databases
                        migrate_slug_databases_to_uuid(&config);
                        return config;
                    }
                    Err(e) => {
                        println!("[Rust] Failed to parse as new format: {}", e);

                        // Try to parse as old format and migrate
                        match serde_json::from_str::<OldProfileConfig>(&contents) {
                            Ok(old_config) => {
                                println!("[Rust] Found old format profiles.json, migrating...");
                                let new_config = migrate_old_profile_config(old_config);
                                save_profile_config(&new_config);
                                return new_config;
                            }
                            Err(e2) => {
                                println!("[Rust] Failed to parse as old format either: {}", e2);
                            }
                        }
                    }
                }
            }
            Err(e) => {
                println!("[Rust] Failed to read profiles.json: {}", e);
            }
        }
    }

    // Create default config
    let config = create_default_profile_config();
    save_profile_config(&config);
    config
}

/// Migrate old slug-based databases to UUID-based names
/// This handles the case where profiles.json was already migrated but databases weren't renamed
/// Also migrates sync settings from database if not already set in profiles.json
fn migrate_slug_databases_to_uuid(config: &ProfileConfig) {
    let container_path = match get_container_path() {
        Some(p) => p,
        None => return,
    };

    // Map profile names to their expected old slugs
    let slug_mappings = [
        ("Default", "default"),
        ("Development", "dev"),
    ];

    let mut needs_sync_migration = config.sync.server_url.is_empty() && config.sync.api_key.is_empty();
    let mut migrated_sync = SyncSettings::default();

    for profile in &config.profiles {
        // Find the old slug for this profile name
        let old_slug = slug_mappings.iter()
            .find(|(name, _)| *name == profile.name)
            .map(|(_, slug)| *slug);

        if let Some(slug) = old_slug {
            let old_db_path = container_path.join(format!("peek-{}.db", slug));
            let new_db_path = container_path.join(format!("peek-{}.db", profile.id));

            // Check if old database exists and new one doesn't have the data
            if old_db_path.exists() {
                let old_size = fs::metadata(&old_db_path).map(|m| m.len()).unwrap_or(0);
                let new_size = fs::metadata(&new_db_path).map(|m| m.len()).unwrap_or(0);

                println!("[Rust] Checking migration: {} ({}b) vs {} ({}b)",
                    old_db_path.display(), old_size, new_db_path.display(), new_size);

                // Try to migrate sync settings from old database before renaming
                if needs_sync_migration {
                    if let Ok(conn) = Connection::open(&old_db_path) {
                        let server_url: String = conn
                            .query_row("SELECT value FROM settings WHERE key = 'webhook_url'", [], |row| row.get(0))
                            .unwrap_or_default();
                        let api_key: String = conn
                            .query_row("SELECT value FROM settings WHERE key = 'webhook_api_key'", [], |row| row.get(0))
                            .unwrap_or_default();
                        let auto_sync: String = conn
                            .query_row("SELECT value FROM settings WHERE key = 'auto_sync'", [], |row| row.get(0))
                            .unwrap_or_default();

                        if !server_url.is_empty() || !api_key.is_empty() {
                            println!("[Rust] Found sync settings in old database: {}", old_db_path.display());
                            migrated_sync = SyncSettings {
                                server_url,
                                api_key,
                                auto_sync: auto_sync == "1" || auto_sync == "true",
                            };
                            needs_sync_migration = false;
                        }
                    }
                }

                // If old database is larger (has more data), use it instead
                if old_size > new_size {
                    println!("[Rust] Migrating slug database: {} -> {}", old_db_path.display(), new_db_path.display());

                    // Remove the empty new database if it exists
                    if new_db_path.exists() {
                        let _ = fs::remove_file(&new_db_path);
                        // Also remove WAL/SHM for new db
                        let _ = fs::remove_file(container_path.join(format!("peek-{}.db-wal", profile.id)));
                        let _ = fs::remove_file(container_path.join(format!("peek-{}.db-shm", profile.id)));
                    }

                    // Rename old database to new UUID name
                    if let Err(e) = fs::rename(&old_db_path, &new_db_path) {
                        println!("[Rust] Warning: Failed to rename database: {}", e);
                    } else {
                        println!("[Rust] Successfully migrated database");
                        // Also rename WAL and SHM files
                        let old_wal = container_path.join(format!("peek-{}.db-wal", slug));
                        let new_wal = container_path.join(format!("peek-{}.db-wal", profile.id));
                        if old_wal.exists() {
                            let _ = fs::rename(&old_wal, &new_wal);
                        }
                        let old_shm = container_path.join(format!("peek-{}.db-shm", slug));
                        let new_shm = container_path.join(format!("peek-{}.db-shm", profile.id));
                        if old_shm.exists() {
                            let _ = fs::rename(&old_shm, &new_shm);
                        }
                    }
                }
            }

            // Also check the current UUID database for sync settings (in case db was already migrated)
            if needs_sync_migration && new_db_path.exists() {
                if let Ok(conn) = Connection::open(&new_db_path) {
                    let server_url: String = conn
                        .query_row("SELECT value FROM settings WHERE key = 'webhook_url'", [], |row| row.get(0))
                        .unwrap_or_default();
                    let api_key: String = conn
                        .query_row("SELECT value FROM settings WHERE key = 'webhook_api_key'", [], |row| row.get(0))
                        .unwrap_or_default();
                    let auto_sync: String = conn
                        .query_row("SELECT value FROM settings WHERE key = 'auto_sync'", [], |row| row.get(0))
                        .unwrap_or_default();

                    if !server_url.is_empty() || !api_key.is_empty() {
                        println!("[Rust] Found sync settings in UUID database: {}", new_db_path.display());
                        migrated_sync = SyncSettings {
                            server_url,
                            api_key,
                            auto_sync: auto_sync == "1" || auto_sync == "true",
                        };
                        needs_sync_migration = false;
                    }
                }
            }
        }
    }

    // If we found sync settings, update the config
    if !migrated_sync.server_url.is_empty() || !migrated_sync.api_key.is_empty() {
        let mut updated_config = config.clone();
        updated_config.sync = migrated_sync;
        save_profile_config(&updated_config);
        // Update cache
        if let Ok(mut guard) = PROFILE_CONFIG.write() {
            *guard = Some(updated_config);
        }
        println!("[Rust] Migrated sync settings to profiles.json");
    }
}

/// Create default profile config based on build type
fn create_default_profile_config() -> ProfileConfig {
    let now = Utc::now().to_rfc3339();
    let default_id = uuid::Uuid::new_v4().to_string();
    let dev_id = uuid::Uuid::new_v4().to_string();

    // Determine which profile should be current based on build type
    let is_production = is_production_build();
    let current_id = if is_production { default_id.clone() } else { dev_id.clone() };

    println!("[Rust] Creating default profile config with profile id: {} (production: {})", current_id, is_production);

    ProfileConfig {
        current_profile_id: current_id,
        profiles: vec![
            ProfileEntry {
                id: default_id,
                name: "Default".to_string(),
                created_at: now.clone(),
                last_used_at: now.clone(),
            },
            ProfileEntry {
                id: dev_id,
                name: "Development".to_string(),
                created_at: now.clone(),
                last_used_at: now,
            },
        ],
        sync: SyncSettings::default(),
    }
}

/// Save profile config to file
fn save_profile_config(config: &ProfileConfig) -> bool {
    let config_path = match get_profiles_config_path() {
        Some(p) => p,
        None => return false,
    };

    match serde_json::to_string_pretty(config) {
        Ok(json) => {
            match fs::write(&config_path, json) {
                Ok(_) => {
                    println!("[Rust] Saved profile config");
                    // Update cache
                    if let Ok(mut guard) = PROFILE_CONFIG.write() {
                        *guard = Some(config.clone());
                    }
                    true
                }
                Err(e) => {
                    println!("[Rust] Failed to write profiles.json: {}", e);
                    false
                }
            }
        }
        Err(e) => {
            println!("[Rust] Failed to serialize profile config: {}", e);
            false
        }
    }
}

/// Get the current profile ID (from profiles.json)
fn get_current_profile_id() -> Result<String, String> {
    Ok(load_profile_config().current_profile_id)
}

/// Get the current profile's name
fn get_current_profile_name() -> Result<String, String> {
    let config = load_profile_config();
    config.profiles
        .iter()
        .find(|p| p.id == config.current_profile_id)
        .map(|p| p.name.clone())
        .ok_or_else(|| "Current profile not found".to_string())
}

/// Derive a slug from a profile name
/// "Default" → "default", "Development" → "dev", etc.
fn name_to_slug(name: &str) -> String {
    match name {
        "Default" => "default".to_string(),
        "Development" => "dev".to_string(),
        _ => name.to_lowercase().replace(' ', "-"),
    }
}

/// Append profile parameter to a URL
/// Includes both profile UUID and slug fallback for migration compatibility
fn append_profile_to_url(url: &str) -> Result<String, String> {
    // Use profile UUID for sync URLs - immutable even if profile is renamed
    let profile_id = get_current_profile_id()?;
    let profile_name = get_current_profile_name().unwrap_or_else(|_| "default".to_string());
    let slug = name_to_slug(&profile_name);

    let separator = if url.contains('?') { "&" } else { "?" };
    // Include both profile UUID and slug fallback for backwards compatibility
    Ok(format!("{}{}profile={}&slug={}", url, separator, profile_id, slug))
}

fn get_db_path() -> Option<PathBuf> {
    let container_path = get_container_path()?;

    // Use profile ID from config file for database selection
    // This allows user to switch profiles and see different data
    let config = load_profile_config();
    let profile_id = &config.current_profile_id;
    let db_name = format!("peek-{}.db", profile_id);
    let new_db_path = container_path.join(&db_name);

    // Migration: rename old peek.db to the first profile's database
    // This runs once when upgrading from old single-database version
    // TODO: Remove this transitional code after all users have migrated
    let old_db_path = container_path.join("peek.db");
    if old_db_path.exists() && !new_db_path.exists() {
        println!("[Rust] Migrating {} to {}", old_db_path.display(), new_db_path.display());
        if let Err(e) = fs::rename(&old_db_path, &new_db_path) {
            println!("[Rust] Migration failed: {}. Will use new empty database.", e);
        } else {
            println!("[Rust] Migration successful");
        }
    }

    println!("[Rust] Using database: {} (profile id: {})", db_name, profile_id);
    Some(new_db_path)
}

use std::sync::Once;

static DB_INIT: Once = Once::new();

fn ensure_database_initialized() -> Result<(), String> {
    let mut init_result: Result<(), String> = Ok(());

    DB_INIT.call_once(|| {
        let db_path = match get_db_path() {
            Some(p) => p,
            None => {
                init_result = Err("Failed to get database path".to_string());
                return;
            }
        };

        println!("[Rust] Initializing database at: {:?}", db_path);

        let conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                init_result = Err(format!("Failed to open database: {}", e));
                return;
            }
        };

        // Enable WAL mode for concurrent access from main app and share extension
        if let Err(e) = conn.execute_batch("PRAGMA journal_mode=WAL;") {
            init_result = Err(format!("Failed to set WAL mode: {}", e));
            return;
        }

        // Check if we need to migrate from old schema (urls table) to new schema (items table)
        let has_urls_table: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='urls'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;

        let has_items_table: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='items'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;

        if has_urls_table && !has_items_table {
            // Migration needed: urls -> items
            println!("[Rust] Migrating database from urls to items schema...");
            if let Err(e) = conn.execute_batch(
                "
                -- Create new items table
                CREATE TABLE items (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL DEFAULT 'url',
                    url TEXT,
                    content TEXT,
                    metadata TEXT,
                    sync_id TEXT DEFAULT '',
                    sync_source TEXT DEFAULT '',
                    synced_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                );

                -- Migrate data from urls to items
                INSERT INTO items (id, type, url, created_at, updated_at, deleted_at)
                    SELECT id, 'url', url, created_at, updated_at, deleted_at FROM urls;

                -- Create new item_tags table
                CREATE TABLE item_tags (
                    item_id TEXT NOT NULL,
                    tag_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (item_id, tag_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                );

                -- Migrate data from url_tags to item_tags
                INSERT INTO item_tags (item_id, tag_id, created_at)
                    SELECT url_id, tag_id, created_at FROM url_tags;

                -- Drop old tables
                DROP TABLE url_tags;
                DROP TABLE urls;

                -- Create indexes for new tables
                CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
                CREATE INDEX IF NOT EXISTS idx_items_url ON items(url);
                CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
                CREATE INDEX IF NOT EXISTS idx_items_sync_id ON items(sync_id);
                ",
            ) {
                init_result = Err(format!("Failed to migrate database: {}", e));
                return;
            }
            println!("[Rust] Database migration completed successfully");
        } else if !has_items_table {
            // Fresh install: create new schema
            if let Err(e) = conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL DEFAULT 'url',
                    url TEXT,
                    content TEXT,
                    metadata TEXT,
                    sync_id TEXT DEFAULT '',
                    sync_source TEXT DEFAULT '',
                    synced_at TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                );

                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    frequency INTEGER NOT NULL DEFAULT 0,
                    last_used TEXT NOT NULL,
                    frecency_score REAL NOT NULL DEFAULT 0.0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS item_tags (
                    item_id TEXT NOT NULL,
                    tag_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (item_id, tag_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                );

                CREATE TABLE IF NOT EXISTS blobs (
                    id TEXT PRIMARY KEY,
                    item_id TEXT NOT NULL,
                    data BLOB NOT NULL,
                    mime_type TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    width INTEGER,
                    height INTEGER,
                    thumbnail BLOB,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
                CREATE INDEX IF NOT EXISTS idx_items_url ON items(url);
                CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
                CREATE INDEX IF NOT EXISTS idx_items_sync_id ON items(sync_id);
                CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
                CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecency_score DESC);
                CREATE INDEX IF NOT EXISTS idx_blobs_item ON blobs(item_id);

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                ",
            ) {
                init_result = Err(format!("Failed to create tables: {}", e));
                return;
            }
        }

        // Add metadata column if it doesn't exist (for existing installs)
        let has_metadata_column: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name='metadata'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;

        if !has_metadata_column {
            println!("[Rust] Adding metadata column to items table...");
            if let Err(e) = conn.execute("ALTER TABLE items ADD COLUMN metadata TEXT", []) {
                println!("[Rust] Warning: Failed to add metadata column: {}", e);
                // Not fatal - column may already exist
            }
        }

        // Add sync columns if they don't exist (for existing installs)
        let has_sync_id: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name='sync_id'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;

        if !has_sync_id {
            println!("[Rust] Adding sync columns to items table...");
            let _ = conn.execute("ALTER TABLE items ADD COLUMN sync_id TEXT DEFAULT ''", []);
            let _ = conn.execute("ALTER TABLE items ADD COLUMN sync_source TEXT DEFAULT ''", []);
            let _ = conn.execute("ALTER TABLE items ADD COLUMN synced_at TEXT", []);
            let _ = conn.execute_batch("CREATE INDEX IF NOT EXISTS idx_items_sync_id ON items(sync_id)");
        }

        // Migrate 'page' type items to 'url' (for existing installs with old type name)
        let page_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM items WHERE type = 'page'",
                [],
                |row| row.get(0),
            )
            .unwrap_or(0);

        if page_count > 0 {
            println!("[Rust] Migrating {} 'page' items to 'url' type...", page_count);
            if let Err(e) = conn.execute("UPDATE items SET type = 'url' WHERE type = 'page'", []) {
                println!("[Rust] Warning: Failed to migrate page items: {}", e);
            } else {
                println!("[Rust] Page to URL migration complete");
            }
        }

        // Ensure blobs table exists (for existing installs)
        let has_blobs_table: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='blobs'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;

        if !has_blobs_table {
            println!("[Rust] Creating blobs table for image support...");
            if let Err(e) = conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS blobs (
                    id TEXT PRIMARY KEY,
                    item_id TEXT NOT NULL,
                    data BLOB NOT NULL,
                    mime_type TEXT NOT NULL,
                    size_bytes INTEGER NOT NULL,
                    width INTEGER,
                    height INTEGER,
                    thumbnail BLOB,
                    created_at TEXT NOT NULL,
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE
                );
                CREATE INDEX IF NOT EXISTS idx_blobs_item ON blobs(item_id);
                ",
            ) {
                println!("[Rust] Warning: Failed to create blobs table: {}", e);
            }
        }

        // Ensure tags and settings tables exist (for migration case)
        if let Err(e) = conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                frequency INTEGER NOT NULL DEFAULT 0,
                last_used TEXT NOT NULL,
                frecency_score REAL NOT NULL DEFAULT 0.0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
            CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecency_score DESC);
            ",
        ) {
            init_result = Err(format!("Failed to ensure auxiliary tables: {}", e));
            return;
        }

        println!("[Rust] Database initialized successfully");
    });

    init_result
}

fn get_connection() -> Result<Connection, String> {
    // Ensure tables exist (only runs once)
    ensure_database_initialized()?;

    // Open a fresh connection for thread safety
    let db_path = get_db_path().ok_or("Failed to get database path")?;
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    // Set WAL mode on this connection too
    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    Ok(conn)
}

// Parse hashtags from text content
fn parse_hashtags(content: &str) -> Vec<String> {
    let re = Regex::new(r"#(\w+)").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].to_lowercase())
        .collect()
}

// Calculate frecency score
fn calculate_frecency(frequency: u32, last_used: &str) -> f64 {
    let now = Utc::now();
    let last_used_time = chrono::DateTime::parse_from_rfc3339(last_used)
        .unwrap_or_else(|_| now.into())
        .with_timezone(&Utc);

    let days_since_use = (now - last_used_time).num_days() as f64;
    let decay_factor = 1.0 / (1.0 + days_since_use / 7.0);

    frequency as f64 * 10.0 * decay_factor
}

// Helper to get webhook config
fn get_webhook_config() -> (Option<String>, Option<String>) {
    let config = load_profile_config();
    let url = if config.sync.server_url.is_empty() {
        None
    } else {
        Some(config.sync.server_url)
    };
    let key = if config.sync.api_key.is_empty() {
        None
    } else {
        Some(config.sync.api_key)
    };
    (url, key)
}

// Helper function to push a single URL to webhook (fire and forget)
async fn push_url_to_webhook(saved_url: SavedUrl) {
    let (webhook_url, api_key) = get_webhook_config();

    if let Some(base_url) = webhook_url {
        if !base_url.is_empty() {
            // Append profile to webhook URL
            let url = match append_profile_to_url(&base_url) {
                Ok(u) => u,
                Err(e) => {
                    println!("[Rust] Failed to append profile to URL: {}", e);
                    return;
                }
            };
            println!("[Rust] Pushing URL to webhook: {}", saved_url.url);
            let client = reqwest::Client::new();
            let payload = WebhookPayload {
                urls: vec![saved_url],
                texts: vec![],
                tagsets: vec![],
            };

            let mut request = client.post(&url).json(&payload);

            if let Some(key) = api_key {
                if !key.is_empty() {
                    request = request.header("Authorization", format!("Bearer {}", key));
                }
            }

            match request.send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("[Rust] Webhook push successful");
                    } else {
                        println!("[Rust] Webhook returned error: {}", response.status());
                    }
                }
                Err(e) => {
                    println!("[Rust] Failed to push to webhook: {}", e);
                }
            }
        }
    }
}

// Helper function to push a single text to webhook (fire and forget)
async fn push_text_to_webhook(saved_text: SavedText) {
    let (webhook_url, api_key) = get_webhook_config();

    if let Some(base_url) = webhook_url {
        if !base_url.is_empty() {
            // Append profile to webhook URL
            let url = match append_profile_to_url(&base_url) {
                Ok(u) => u,
                Err(e) => {
                    println!("[Rust] Failed to append profile to URL: {}", e);
                    return;
                }
            };
            println!("[Rust] Pushing text to webhook");
            let client = reqwest::Client::new();
            let payload = WebhookPayload {
                urls: vec![],
                texts: vec![saved_text],
                tagsets: vec![],
            };

            let mut request = client.post(&url).json(&payload);

            if let Some(key) = api_key {
                if !key.is_empty() {
                    request = request.header("Authorization", format!("Bearer {}", key));
                }
            }

            match request.send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("[Rust] Webhook push successful");
                    } else {
                        println!("[Rust] Webhook returned error: {}", response.status());
                    }
                }
                Err(e) => {
                    println!("[Rust] Failed to push to webhook: {}", e);
                }
            }
        }
    }
}

// Helper function to push a single tagset to webhook (fire and forget)
async fn push_tagset_to_webhook(saved_tagset: SavedTagset) {
    let (webhook_url, api_key) = get_webhook_config();

    if let Some(base_url) = webhook_url {
        if !base_url.is_empty() {
            // Append profile to webhook URL
            let url = match append_profile_to_url(&base_url) {
                Ok(u) => u,
                Err(e) => {
                    println!("[Rust] Failed to append profile to URL: {}", e);
                    return;
                }
            };
            println!("[Rust] Pushing tagset to webhook");
            let client = reqwest::Client::new();
            let payload = WebhookPayload {
                urls: vec![],
                texts: vec![],
                tagsets: vec![saved_tagset],
            };

            let mut request = client.post(&url).json(&payload);

            if let Some(key) = api_key {
                if !key.is_empty() {
                    request = request.header("Authorization", format!("Bearer {}", key));
                }
            }

            match request.send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("[Rust] Webhook push successful");
                    } else {
                        println!("[Rust] Webhook returned error: {}", response.status());
                    }
                }
                Err(e) => {
                    println!("[Rust] Failed to push to webhook: {}", e);
                }
            }
        }
    }
}

// Commands
#[tauri::command]
fn get_shared_url() -> Result<Option<String>, String> {
    // Deprecated - kept for compatibility
    Ok(None)
}

#[tauri::command]
fn debug_list_container_files() -> Result<Vec<String>, String> {
    unsafe {
        let c_str = get_app_group_container_path();
        if c_str.is_null() {
            return Err("Failed to get App Group container path".to_string());
        }
        let path_str = CStr::from_ptr(c_str).to_string_lossy().to_string();
        libc::free(c_str as *mut libc::c_void);

        let container_path = PathBuf::from(&path_str);

        let mut files = Vec::new();
        files.push(format!("Container: {}", path_str));

        // List all files including hidden ones
        if let Ok(entries) = std::fs::read_dir(&container_path) {
            for entry in entries.flatten() {
                let path = entry.path();
                let metadata = std::fs::metadata(&path);
                let size = metadata.map(|m| m.len()).unwrap_or(0);
                let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                files.push(format!("{} ({} bytes)", name, size));
            }
        }

        // Also check for WAL and SHM files
        let wal_path = container_path.join("peek.db-wal");
        let shm_path = container_path.join("peek.db-shm");
        if wal_path.exists() {
            let size = std::fs::metadata(&wal_path).map(|m| m.len()).unwrap_or(0);
            files.push(format!("peek.db-wal ({} bytes)", size));
        }
        if shm_path.exists() {
            let size = std::fs::metadata(&shm_path).map(|m| m.len()).unwrap_or(0);
            files.push(format!("peek.db-shm ({} bytes)", size));
        }

        // Check Library folder for other databases
        let lib_path = container_path.join("Library");
        if lib_path.exists() {
            files.push("--- Library folder: ---".to_string());
            if let Ok(entries) = std::fs::read_dir(&lib_path) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    let metadata = std::fs::metadata(&path);
                    let size = metadata.map(|m| m.len()).unwrap_or(0);
                    let name = path.file_name().map(|n| n.to_string_lossy().to_string()).unwrap_or_default();
                    files.push(format!("  {} ({} bytes)", name, size));
                }
            }
        }

        Ok(files)
    }
}

#[tauri::command]
fn debug_profiles_json() -> Result<String, String> {
    let config_path = match get_profiles_config_path() {
        Some(p) => p,
        None => return Err("No config path".to_string()),
    };

    let mut result = format!("Path: {}\nExists: {}\n", config_path.display(), config_path.exists());

    if config_path.exists() {
        match fs::read_to_string(&config_path) {
            Ok(contents) => {
                result.push_str(&format!("Content:\n{}", contents));
            }
            Err(e) => {
                result.push_str(&format!("Read error: {}", e));
            }
        }
    }

    Ok(result)
}

#[tauri::command]
fn debug_settings_table() -> Result<String, String> {
    let db_path = get_db_path().ok_or("Failed to get database path")?;
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    let mut result = format!("DB: {:?}\n\nSettings table:\n", db_path);

    // Check if settings table exists
    let has_settings: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='settings'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    if !has_settings {
        result.push_str("Settings table does not exist!");
        return Ok(result);
    }

    // Get all settings
    let mut stmt = conn.prepare("SELECT key, value FROM settings").map_err(|e| e.to_string())?;
    let rows = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
    }).map_err(|e| e.to_string())?;

    for row in rows {
        if let Ok((key, value)) = row {
            let display_value = if key.contains("api_key") || key.contains("key") {
                format!("{}...", &value.chars().take(8).collect::<String>())
            } else {
                value
            };
            result.push_str(&format!("{} = {}\n", key, display_value));
        }
    }

    Ok(result)
}

#[tauri::command]
fn debug_query_database() -> Result<String, String> {
    let db_path = get_db_path().ok_or("Failed to get database path")?;
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    let mut info = Vec::new();
    info.push(format!("DB: {:?}", db_path));

    // List all tables
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .map_err(|e| e.to_string())?
        .query_map([], |row| row.get(0))
        .map_err(|e| e.to_string())?
        .filter_map(|r| r.ok())
        .collect();
    info.push(format!("Tables: {:?}", tables));

    // Count items in each relevant table (including old schema)
    for table in &["items", "urls", "texts", "tagsets", "tags", "addresses", "visits", "content"] {
        let count: Result<i64, _> = conn.query_row(
            &format!("SELECT COUNT(*) FROM {}", table),
            [],
            |row| row.get(0),
        );
        match count {
            Ok(c) => info.push(format!("{}: {} rows", table, c)),
            Err(_) => info.push(format!("{}: (not found)", table)),
        }
    }

    // Check for deleted items
    let deleted_count: Result<i64, _> = conn.query_row(
        "SELECT COUNT(*) FROM items WHERE deleted = 1",
        [],
        |row| row.get(0),
    );
    match deleted_count {
        Ok(c) => info.push(format!("deleted: {}", c)),
        Err(_) => {}
    }

    // Check distinct device_ids
    let device_ids: Result<Vec<String>, _> = conn
        .prepare("SELECT DISTINCT device_id FROM items WHERE device_id IS NOT NULL")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| row.get(0))
                .map(|rows| rows.filter_map(|r| r.ok()).collect())
        });
    match device_ids {
        Ok(ids) => info.push(format!("device_ids: {:?}", ids)),
        Err(_) => info.push("device_id: (no column)".to_string()),
    }

    // Get current device_id from settings
    let current_device: Result<String, _> = conn.query_row(
        "SELECT value FROM settings WHERE key = 'device_id'",
        [],
        |row| row.get(0),
    );
    match current_device {
        Ok(id) => info.push(format!("current device: {}", id)),
        Err(_) => info.push("current device: (not set)".to_string()),
    }

    // Sample first few items if any exist
    let sample: Result<Vec<String>, _> = conn
        .prepare("SELECT id, type, content, device_id FROM items LIMIT 3")
        .and_then(|mut stmt| {
            stmt.query_map([], |row| {
                let id: String = row.get(0)?;
                let item_type: String = row.get(1)?;
                let content: String = row.get::<_, String>(2).unwrap_or_default();
                let device: String = row.get::<_, String>(3).unwrap_or_default();
                Ok(format!("{}:{}:{:.20}...(dev:{})", id, item_type, content, device))
            })
            .map(|rows| rows.filter_map(|r| r.ok()).collect())
        });
    match sample {
        Ok(items) if !items.is_empty() => info.push(format!("sample: {:?}", items)),
        _ => {}
    }

    Ok(info.join(" | "))
}

#[tauri::command]
fn debug_export_database(app: tauri::AppHandle) -> Result<String, String> {
    let db_path = get_db_path().ok_or("Failed to get database path")?;
    let data = std::fs::read(&db_path).map_err(|e| format!("Failed to read database: {}", e))?;

    // Get app's data directory (accessible via Download Container)
    let app_data = app.path().app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    std::fs::create_dir_all(&app_data)
        .map_err(|e| format!("Failed to create app data dir: {}", e))?;

    // Copy raw database
    let export_db = app_data.join("peek-export.db");
    std::fs::write(&export_db, &data)
        .map_err(|e| format!("Failed to write database: {}", e))?;

    // Also create base64 version
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let encoded = STANDARD.encode(&data);
    let export_b64 = app_data.join("peek-export.b64");
    std::fs::write(&export_b64, &encoded)
        .map_err(|e| format!("Failed to write base64: {}", e))?;

    Ok(format!("Exported {} bytes to app data dir", data.len()))
}

#[tauri::command]
async fn save_url(url: String, tags: Vec<String>, metadata: Option<serde_json::Value>) -> Result<(), String> {
    println!("[Rust] save_url called with url: {}, tags: {:?}, metadata: {:?}", url, tags, metadata);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let metadata_json = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());

    // Check if URL already exists (as a page type)
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM items WHERE type = 'url' AND url = ? AND deleted_at IS NULL",
            params![&url],
            |row| row.get(0),
        )
        .ok();

    let item_id = if let Some(existing) = existing_id {
        // Update existing item (update metadata if provided)
        if metadata_json.is_some() {
            conn.execute(
                "UPDATE items SET updated_at = ?, metadata = ? WHERE id = ?",
                params![&now, &metadata_json, &existing],
            )
            .map_err(|e| format!("Failed to update item: {}", e))?;
        } else {
            conn.execute(
                "UPDATE items SET updated_at = ? WHERE id = ?",
                params![&now, &existing],
            )
            .map_err(|e| format!("Failed to update item: {}", e))?;
        }

        // Remove old tag associations
        conn.execute("DELETE FROM item_tags WHERE item_id = ?", params![&existing])
            .map_err(|e| format!("Failed to remove old tags: {}", e))?;

        existing
    } else {
        // Insert new page item
        conn.execute(
            "INSERT INTO items (id, type, url, metadata, created_at, updated_at) VALUES (?, 'page', ?, ?, ?, ?)",
            params![&id, &url, &metadata_json, &now, &now],
        )
        .map_err(|e| format!("Failed to insert item: {}", e))?;

        id
    };

    // Add tags
    for tag_name in &tags {
        // Get or create tag
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(id) => {
                // Update existing tag stats
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                id
            }
            Err(_) => {
                // Create new tag
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        // Create item-tag association
        conn.execute(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&item_id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Page saved successfully");

    // Trigger auto-sync if enabled (fire and forget)
    tauri::async_runtime::spawn(async move {
        trigger_auto_sync_if_enabled().await;
    });

    Ok(())
}

/// Extract domain from URL, removing www. prefix if present
fn extract_domain(url: &str) -> Option<String> {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| {
            if h.starts_with("www.") {
                h[4..].to_string()
            } else {
                h.to_string()
            }
        }))
}

#[tauri::command]
async fn get_tags_by_frecency() -> Result<Vec<TagStats>, String> {
    let conn = get_connection()?;

    let mut stmt = conn
        .prepare("SELECT name, frequency, last_used, frecency_score FROM tags ORDER BY frecency_score DESC")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let tags: Vec<TagStats> = stmt
        .query_map([], |row| {
            Ok(TagStats {
                name: row.get(0)?,
                frequency: row.get(1)?,
                last_used: row.get(2)?,
                frecency_score: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

/// Get tags sorted by frecency with domain affinity boost
/// Tags used on URLs from the same domain get a 2x score multiplier
#[tauri::command]
async fn get_tags_by_frecency_for_url(url: String) -> Result<Vec<TagStats>, String> {
    let domain = match extract_domain(&url) {
        Some(d) => d,
        None => return get_tags_by_frecency().await, // Fall back to regular frecency
    };

    let conn = get_connection()?;

    // Get all tags with their IDs
    let mut stmt = conn
        .prepare("SELECT id, name, frequency, last_used, frecency_score FROM tags")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let tags_with_ids: Vec<(i64, TagStats)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                TagStats {
                    name: row.get(1)?,
                    frequency: row.get(2)?,
                    last_used: row.get(3)?,
                    frecency_score: row.get(4)?,
                },
            ))
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Get tag IDs used on URLs with the same domain
    let domain_pattern = format!("%://{}/%", domain);
    let domain_pattern_root = format!("%://{}", domain);
    let www_domain_pattern = format!("%://www.{}/%", domain);
    let www_domain_pattern_root = format!("%://www.{}", domain);

    let mut domain_stmt = conn
        .prepare(
            "SELECT DISTINCT it.tag_id
             FROM item_tags it
             JOIN items i ON it.item_id = i.id
             WHERE i.deleted_at IS NULL AND i.type = 'url'
               AND (i.url LIKE ?1 OR i.url LIKE ?2 OR i.url LIKE ?3 OR i.url LIKE ?4)",
        )
        .map_err(|e| format!("Failed to prepare domain query: {}", e))?;

    let domain_tag_ids: std::collections::HashSet<i64> = domain_stmt
        .query_map(
            params![&domain_pattern, &domain_pattern_root, &www_domain_pattern, &www_domain_pattern_root],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to query domain tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Apply 2x multiplier to tags used on same-domain URLs and sort
    let mut boosted_tags: Vec<TagStats> = tags_with_ids
        .into_iter()
        .map(|(id, mut tag)| {
            if domain_tag_ids.contains(&id) {
                tag.frecency_score *= 2.0;
            }
            tag
        })
        .collect();

    boosted_tags.sort_by(|a, b| b.frecency_score.partial_cmp(&a.frecency_score).unwrap_or(std::cmp::Ordering::Equal));

    Ok(boosted_tags)
}

/// Get saved pages (URLs) - backward compatible, returns only page type items
#[tauri::command]
async fn get_saved_urls() -> Result<Vec<SavedUrl>, String> {
    let conn = get_connection()?;

    // Get all non-deleted pages (type='page')
    let mut stmt = conn
        .prepare(
            "SELECT id, url, created_at, metadata FROM items WHERE type = 'url' AND deleted_at IS NULL ORDER BY COALESCE(updated_at, created_at) DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let url_rows: Vec<(String, String, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .map_err(|e| format!("Failed to query pages: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Get tags for each item
    let mut urls: Vec<SavedUrl> = Vec::new();
    for (id, url, created_at, metadata_json) in url_rows {
        let mut tag_stmt = conn
            .prepare(
                "SELECT t.name FROM tags t
                 JOIN item_tags it ON t.id = it.tag_id
                 WHERE it.item_id = ?
                 ORDER BY t.name",
            )
            .map_err(|e| format!("Failed to prepare tag query: {}", e))?;

        let tags: Vec<String> = tag_stmt
            .query_map(params![&id], |row| row.get(0))
            .map_err(|e| format!("Failed to query tags for item: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        let metadata = metadata_json.and_then(|s| serde_json::from_str(&s).ok());

        urls.push(SavedUrl {
            id,
            url,
            tags,
            saved_at: created_at,
            metadata,
        });
    }

    Ok(urls)
}

/// Delete any item by ID (works for pages, texts, tagsets)
#[tauri::command]
async fn delete_url(id: String) -> Result<(), String> {
    println!("[Rust] delete_url/delete_item called for id: {}", id);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Soft delete: set deleted_at timestamp
    // This prevents sync from re-creating the item when pulling from server
    conn.execute(
        "UPDATE items SET deleted_at = ?, updated_at = ? WHERE id = ?",
        params![&now, &now, &id],
    )
    .map_err(|e| format!("Failed to delete item: {}", e))?;

    println!("[Rust] Item soft-deleted successfully");
    Ok(())
}

/// Update a page (URL) item - backward compatible
#[tauri::command]
async fn update_url(id: String, url: String, tags: Vec<String>) -> Result<(), String> {
    println!("[Rust] update_url called for id: {}, url: {}, tags: {:?}", id, url, tags);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Verify item exists and is a page
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM items WHERE id = ? AND type = 'url' AND deleted_at IS NULL",
            params![&id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !exists {
        return Err("Page not found".to_string());
    }

    // Update URL value and timestamp
    conn.execute(
        "UPDATE items SET url = ?, updated_at = ? WHERE id = ?",
        params![&url, &now, &id],
    )
    .map_err(|e| format!("Failed to update item: {}", e))?;

    // Get existing tags for this item
    let mut existing_tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?",
        )
        .map_err(|e| format!("Failed to prepare existing tags query: {}", e))?;

    let existing_tags: std::collections::HashSet<String> = existing_tag_stmt
        .query_map(params![&id], |row| row.get(0))
        .map_err(|e| format!("Failed to query existing tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let new_tags_set: std::collections::HashSet<String> = tags.iter().cloned().collect();

    // Determine which tags are being added vs removed
    let tags_to_add: Vec<&String> = new_tags_set.difference(&existing_tags).collect();
    let tags_to_remove: Vec<&String> = existing_tags.difference(&new_tags_set).collect();

    // Remove only the tags that were actually removed
    for tag_name in &tags_to_remove {
        conn.execute(
            "DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
            params![&id, tag_name],
        )
        .map_err(|e| format!("Failed to remove tag association: {}", e))?;
    }

    // Add only the tags that are new to this item
    for tag_name in &tags_to_add {
        // Get or create tag
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                // Update existing tag stats
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                // Create new tag
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        // Create item-tag association
        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Page updated successfully");

    // Push to webhook (fire and forget)
    let saved_url = SavedUrl {
        id,
        url,
        tags,
        saved_at: now,
        metadata: None,
    };
    tauri::async_runtime::spawn(async move {
        push_url_to_webhook(saved_url).await;
    });

    Ok(())
}

/// Update tags for any item (legacy function - kept for backward compatibility)
#[tauri::command]
async fn update_url_tags(id: String, tags: Vec<String>) -> Result<(), String> {
    println!("[Rust] update_url_tags called for id: {}, tags: {:?}", id, tags);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Verify item exists
    let item_info: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT type, url FROM items WHERE id = ? AND deleted_at IS NULL",
            params![&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let (item_type, url_opt) = match item_info {
        Some(info) => info,
        None => return Err("Item not found".to_string()),
    };

    // Get existing tags for this item
    let mut existing_tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?",
        )
        .map_err(|e| format!("Failed to prepare existing tags query: {}", e))?;

    let existing_tags: std::collections::HashSet<String> = existing_tag_stmt
        .query_map(params![&id], |row| row.get(0))
        .map_err(|e| format!("Failed to query existing tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let new_tags_set: std::collections::HashSet<String> = tags.iter().cloned().collect();

    // Determine which tags are being added vs removed
    let tags_to_add: Vec<&String> = new_tags_set.difference(&existing_tags).collect();
    let tags_to_remove: Vec<&String> = existing_tags.difference(&new_tags_set).collect();

    // Update item's updated_at timestamp
    conn.execute(
        "UPDATE items SET updated_at = ? WHERE id = ?",
        params![&now, &id],
    )
    .map_err(|e| format!("Failed to update item: {}", e))?;

    // Remove only the tags that were actually removed
    for tag_name in &tags_to_remove {
        conn.execute(
            "DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
            params![&id, tag_name],
        )
        .map_err(|e| format!("Failed to remove tag association: {}", e))?;
    }

    // Add only the tags that are new to this item
    for tag_name in &tags_to_add {
        // Get or create tag
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                // Update existing tag stats
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                // Create new tag
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        // Create item-tag association
        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Item tags updated successfully");

    // Push to webhook (fire and forget) - only for page types
    if item_type == "page" {
        if let Some(url) = url_opt {
            let saved_url = SavedUrl {
                id,
                url,
                tags,
                saved_at: now,
                metadata: None,
            };
            tauri::async_runtime::spawn(async move {
                push_url_to_webhook(saved_url).await;
            });
        }
    }

    Ok(())
}

/// Save a text item with hashtags auto-parsed as tags
#[tauri::command]
async fn save_text(content: String, tags: Option<Vec<String>>, metadata: Option<serde_json::Value>) -> Result<(), String> {
    println!("[Rust] save_text called with content: {}", &content[..content.len().min(50)]);
    println!("[Rust] save_text received tags: {:?}", tags);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let metadata_json = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());

    // Parse hashtags from content and merge with provided tags
    let mut all_tags = parse_hashtags(&content);
    if let Some(extra) = tags {
        for tag in extra {
            let normalized = tag.trim().to_lowercase();
            if !normalized.is_empty() && !all_tags.contains(&normalized) {
                all_tags.push(normalized);
            }
        }
    }
    println!("[Rust] Final tags (parsed + provided): {:?}", all_tags);

    // Insert text item
    conn.execute(
        "INSERT INTO items (id, type, content, metadata, created_at, updated_at) VALUES (?, 'text', ?, ?, ?, ?)",
        params![&id, &content, &metadata_json, &now, &now],
    )
    .map_err(|e| format!("Failed to insert text item: {}", e))?;

    // Add tags
    for tag_name in &all_tags {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Text saved successfully");

    // Trigger auto-sync if enabled (fire and forget)
    tauri::async_runtime::spawn(async move {
        trigger_auto_sync_if_enabled().await;
    });

    Ok(())
}

/// Save a tagset (tags only, no content)
#[tauri::command]
async fn save_tagset(tags: Vec<String>, metadata: Option<serde_json::Value>) -> Result<(), String> {
    println!("[Rust] save_tagset called with tags: {:?}", tags);

    if tags.is_empty() {
        return Err("At least one tag is required for a tagset".to_string());
    }

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let metadata_json = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());

    // Insert tagset item
    conn.execute(
        "INSERT INTO items (id, type, metadata, created_at, updated_at) VALUES (?, 'tagset', ?, ?, ?)",
        params![&id, &metadata_json, &now, &now],
    )
    .map_err(|e| format!("Failed to insert tagset item: {}", e))?;

    // Add tags
    for tag_name in &tags {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Tagset saved successfully");

    // Trigger auto-sync if enabled (fire and forget)
    tauri::async_runtime::spawn(async move {
        trigger_auto_sync_if_enabled().await;
    });

    Ok(())
}

/// Get all saved text items
#[tauri::command]
async fn get_saved_texts() -> Result<Vec<SavedText>, String> {
    let conn = get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content, created_at, metadata FROM items WHERE type = 'text' AND deleted_at IS NULL ORDER BY COALESCE(updated_at, created_at) DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows: Vec<(String, String, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .map_err(|e| format!("Failed to query texts: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut texts: Vec<SavedText> = Vec::new();
    for (id, content, created_at, metadata_json) in rows {
        let mut tag_stmt = conn
            .prepare(
                "SELECT t.name FROM tags t
                 JOIN item_tags it ON t.id = it.tag_id
                 WHERE it.item_id = ?
                 ORDER BY t.name",
            )
            .map_err(|e| format!("Failed to prepare tag query: {}", e))?;

        let tags: Vec<String> = tag_stmt
            .query_map(params![&id], |row| row.get(0))
            .map_err(|e| format!("Failed to query tags: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        let metadata = metadata_json.and_then(|s| serde_json::from_str(&s).ok());

        texts.push(SavedText {
            id,
            content,
            tags,
            saved_at: created_at,
            metadata,
        });
    }

    Ok(texts)
}

/// Get all saved tagsets
#[tauri::command]
async fn get_saved_tagsets() -> Result<Vec<SavedTagset>, String> {
    let conn = get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, created_at, metadata FROM items WHERE type = 'tagset' AND deleted_at IS NULL ORDER BY COALESCE(updated_at, created_at) DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows: Vec<(String, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| format!("Failed to query tagsets: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut tagsets: Vec<SavedTagset> = Vec::new();
    for (id, created_at, metadata_json) in rows {
        let mut tag_stmt = conn
            .prepare(
                "SELECT t.name FROM tags t
                 JOIN item_tags it ON t.id = it.tag_id
                 WHERE it.item_id = ?
                 ORDER BY t.name",
            )
            .map_err(|e| format!("Failed to prepare tag query: {}", e))?;

        let tags: Vec<String> = tag_stmt
            .query_map(params![&id], |row| row.get(0))
            .map_err(|e| format!("Failed to query tags: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        let metadata = metadata_json.and_then(|s| serde_json::from_str(&s).ok());

        tagsets.push(SavedTagset {
            id,
            tags,
            saved_at: created_at,
            metadata,
        });
    }

    Ok(tagsets)
}

/// Update a text item
#[tauri::command]
async fn update_text(id: String, content: String, tags: Vec<String>) -> Result<(), String> {
    println!("[Rust] update_text called for id: {}, tags: {:?}", id, tags);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Verify item exists and is a text type
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM items WHERE id = ? AND type = 'text' AND deleted_at IS NULL",
            params![&id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !exists {
        return Err("Text not found".to_string());
    }

    // Update content and timestamp
    conn.execute(
        "UPDATE items SET content = ?, updated_at = ? WHERE id = ?",
        params![&content, &now, &id],
    )
    .map_err(|e| format!("Failed to update text: {}", e))?;

    // Combine UI-provided tags with hashtags parsed from content
    let hashtags = parse_hashtags(&content);
    let mut new_tags_set: std::collections::HashSet<String> = tags.into_iter().collect();
    new_tags_set.extend(hashtags);

    // Get existing tags
    let mut existing_tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?",
        )
        .map_err(|e| format!("Failed to prepare existing tags query: {}", e))?;

    let existing_tags: std::collections::HashSet<String> = existing_tag_stmt
        .query_map(params![&id], |row| row.get(0))
        .map_err(|e| format!("Failed to query existing tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let tags_to_add: Vec<&String> = new_tags_set.difference(&existing_tags).collect();
    let tags_to_remove: Vec<&String> = existing_tags.difference(&new_tags_set).collect();

    // Remove old tags
    for tag_name in &tags_to_remove {
        conn.execute(
            "DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
            params![&id, tag_name],
        )
        .map_err(|e| format!("Failed to remove tag: {}", e))?;
    }

    // Add new tags
    for tag_name in &tags_to_add {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Text updated successfully");

    // Push to webhook
    let final_tags: Vec<String> = new_tags_set.into_iter().collect();
    let saved_text = SavedText {
        id,
        content,
        tags: final_tags,
        saved_at: now,
        metadata: None,
    };
    tauri::async_runtime::spawn(async move {
        push_text_to_webhook(saved_text).await;
    });

    Ok(())
}

/// Update a tagset's tags
#[tauri::command]
async fn update_tagset(id: String, tags: Vec<String>) -> Result<(), String> {
    println!("[Rust] update_tagset called for id: {}, tags: {:?}", id, tags);

    if tags.is_empty() {
        return Err("At least one tag is required for a tagset".to_string());
    }

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Verify item exists and is a tagset type
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM items WHERE id = ? AND type = 'tagset' AND deleted_at IS NULL",
            params![&id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !exists {
        return Err("Tagset not found".to_string());
    }

    // Update timestamp
    conn.execute(
        "UPDATE items SET updated_at = ? WHERE id = ?",
        params![&now, &id],
    )
    .map_err(|e| format!("Failed to update tagset: {}", e))?;

    // Get existing tags
    let mut existing_tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?",
        )
        .map_err(|e| format!("Failed to prepare existing tags query: {}", e))?;

    let existing_tags: std::collections::HashSet<String> = existing_tag_stmt
        .query_map(params![&id], |row| row.get(0))
        .map_err(|e| format!("Failed to query existing tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let new_tags_set: std::collections::HashSet<String> = tags.iter().cloned().collect();
    let tags_to_add: Vec<&String> = new_tags_set.difference(&existing_tags).collect();
    let tags_to_remove: Vec<&String> = existing_tags.difference(&new_tags_set).collect();

    // Remove old tags
    for tag_name in &tags_to_remove {
        conn.execute(
            "DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
            params![&id, tag_name],
        )
        .map_err(|e| format!("Failed to remove tag: {}", e))?;
    }

    // Add new tags
    for tag_name in &tags_to_add {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Tagset updated successfully");

    // Push to webhook
    let saved_tagset = SavedTagset {
        id,
        tags,
        saved_at: now,
        metadata: None,
    };
    tauri::async_runtime::spawn(async move {
        push_tagset_to_webhook(saved_tagset).await;
    });

    Ok(())
}

/// Save an image with optional tags and metadata
/// image_data is base64-encoded image bytes
/// thumbnail_data is optional base64-encoded thumbnail
#[tauri::command]
async fn save_image(
    image_data: String,
    mime_type: String,
    tags: Vec<String>,
    metadata: Option<serde_json::Value>,
    thumbnail_data: Option<String>,
    width: Option<u32>,
    height: Option<u32>,
) -> Result<String, String> {
    println!("[Rust] save_image called, mime_type: {}, tags: {:?}", mime_type, tags);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();
    let item_id = uuid::Uuid::new_v4().to_string();
    let blob_id = uuid::Uuid::new_v4().to_string();
    let metadata_json = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());

    // Decode base64 image data
    use base64::{Engine as _, engine::general_purpose::STANDARD};
    let image_bytes = STANDARD.decode(&image_data)
        .map_err(|e| format!("Failed to decode image data: {}", e))?;
    let size_bytes = image_bytes.len() as i64;

    let thumbnail_bytes: Option<Vec<u8>> = thumbnail_data
        .map(|t| STANDARD.decode(&t))
        .transpose()
        .map_err(|e| format!("Failed to decode thumbnail: {}", e))?;

    // Insert image item
    conn.execute(
        "INSERT INTO items (id, type, metadata, created_at, updated_at) VALUES (?, 'image', ?, ?, ?)",
        params![&item_id, &metadata_json, &now, &now],
    )
    .map_err(|e| format!("Failed to insert image item: {}", e))?;

    // Insert blob data
    conn.execute(
        "INSERT INTO blobs (id, item_id, data, mime_type, size_bytes, width, height, thumbnail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        params![&blob_id, &item_id, &image_bytes, &mime_type, size_bytes, width, height, &thumbnail_bytes, &now],
    )
    .map_err(|e| format!("Failed to insert blob: {}", e))?;

    // Add tags
    for tag_name in &tags {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&item_id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Image saved successfully with id: {}", item_id);

    // Trigger auto-sync if enabled (fire and forget)
    tauri::async_runtime::spawn(async move {
        trigger_auto_sync_if_enabled().await;
    });

    Ok(item_id)
}

/// Get all saved images (returns metadata and thumbnails, not full image data)
#[tauri::command]
async fn get_saved_images() -> Result<Vec<SavedImage>, String> {
    let conn = get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT i.id, i.created_at, i.metadata, b.mime_type, b.width, b.height, b.thumbnail
             FROM items i
             LEFT JOIN blobs b ON b.item_id = i.id
             WHERE i.type = 'image' AND i.deleted_at IS NULL
             ORDER BY COALESCE(i.updated_at, i.created_at) DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    use base64::{Engine as _, engine::general_purpose::STANDARD};

    let rows: Vec<(String, String, Option<String>, Option<String>, Option<u32>, Option<u32>, Option<Vec<u8>>)> = stmt
        .query_map([], |row| Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
            row.get(5)?,
            row.get(6)?,
        )))
        .map_err(|e| format!("Failed to query images: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut images: Vec<SavedImage> = Vec::new();
    for (id, created_at, metadata_json, mime_type, width, height, thumbnail_bytes) in rows {
        let mut tag_stmt = conn
            .prepare(
                "SELECT t.name FROM tags t
                 JOIN item_tags it ON t.id = it.tag_id
                 WHERE it.item_id = ?
                 ORDER BY t.name",
            )
            .map_err(|e| format!("Failed to prepare tag query: {}", e))?;

        let tags: Vec<String> = tag_stmt
            .query_map(params![&id], |row| row.get(0))
            .map_err(|e| format!("Failed to query tags: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        let metadata = metadata_json.and_then(|s| serde_json::from_str(&s).ok());
        let thumbnail = thumbnail_bytes.map(|b| STANDARD.encode(&b));

        images.push(SavedImage {
            id,
            tags,
            saved_at: created_at,
            metadata,
            thumbnail,
            mime_type: mime_type.unwrap_or_else(|| "image/jpeg".to_string()),
            width,
            height,
        });
    }

    Ok(images)
}

/// Get full image data by item ID (returns base64-encoded image)
#[tauri::command]
async fn get_image_data(id: String) -> Result<Option<String>, String> {
    let conn = get_connection()?;

    let result: Option<Vec<u8>> = conn
        .query_row(
            "SELECT data FROM blobs WHERE item_id = ?",
            params![&id],
            |row| row.get(0),
        )
        .ok();

    use base64::{Engine as _, engine::general_purpose::STANDARD};
    Ok(result.map(|bytes| STANDARD.encode(&bytes)))
}

/// Save a captured image from camera (simplified interface)
/// image_data is base64-encoded image bytes (without data URL prefix)
#[tauri::command]
async fn save_captured_image(
    image_data: String,
    mime_type: String,
    tags: Vec<String>,
) -> Result<String, String> {
    println!("[Rust] save_captured_image called, mime_type: {}, tags: {:?}", mime_type, tags);

    // Use the image data as its own thumbnail for display
    // (camera images are typically already reasonably sized)
    save_image(image_data.clone(), mime_type, tags, None, Some(image_data), None, None).await
}

/// Update image tags
#[tauri::command]
async fn update_image_tags(id: String, tags: Vec<String>) -> Result<(), String> {
    println!("[Rust] update_image_tags called for id: {}, tags: {:?}", id, tags);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Verify item exists and is an image type
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM items WHERE id = ? AND type = 'image' AND deleted_at IS NULL",
            params![&id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !exists {
        return Err("Image not found".to_string());
    }

    // Update timestamp
    conn.execute(
        "UPDATE items SET updated_at = ? WHERE id = ?",
        params![&now, &id],
    )
    .map_err(|e| format!("Failed to update image: {}", e))?;

    // Get existing tags
    let mut existing_tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?",
        )
        .map_err(|e| format!("Failed to prepare existing tags query: {}", e))?;

    let existing_tags: std::collections::HashSet<String> = existing_tag_stmt
        .query_map(params![&id], |row| row.get(0))
        .map_err(|e| format!("Failed to query existing tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let new_tags_set: std::collections::HashSet<String> = tags.iter().cloned().collect();
    let tags_to_add: Vec<&String> = new_tags_set.difference(&existing_tags).collect();
    let tags_to_remove: Vec<&String> = existing_tags.difference(&new_tags_set).collect();

    // Remove old tags
    for tag_name in &tags_to_remove {
        conn.execute(
            "DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
            params![&id, tag_name],
        )
        .map_err(|e| format!("Failed to remove tag: {}", e))?;
    }

    // Add new tags
    for tag_name in &tags_to_add {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Image tags updated successfully");
    Ok(())
}

#[tauri::command]
fn is_dark_mode() -> bool {
    unsafe { get_system_is_dark_mode() != 0 }
}

#[tauri::command]
fn quit_app() {
    println!("[Rust] Quitting app for profile switch");
    std::process::exit(0);
}

#[tauri::command]
async fn get_webhook_url() -> Result<Option<String>, String> {
    let config = load_profile_config();
    if config.sync.server_url.is_empty() {
        Ok(None)
    } else {
        Ok(Some(config.sync.server_url))
    }
}

#[tauri::command]
async fn get_webhook_api_key() -> Result<Option<String>, String> {
    let config = load_profile_config();
    if config.sync.api_key.is_empty() {
        Ok(None)
    } else {
        Ok(Some(config.sync.api_key))
    }
}

#[tauri::command]
async fn set_webhook_api_key(key: String) -> Result<(), String> {
    println!("[Rust] set_webhook_api_key called");
    let mut config = load_profile_config();
    config.sync.api_key = key;
    if !save_profile_config(&config) {
        return Err("Failed to save API key".to_string());
    }
    println!("[Rust] API key saved successfully");
    Ok(())
}

#[tauri::command]
async fn set_webhook_url(url: String) -> Result<(), String> {
    println!("[Rust] set_webhook_url called with url: {}", url);
    let mut config = load_profile_config();
    config.sync.server_url = url;
    if !save_profile_config(&config) {
        return Err("Failed to save webhook URL".to_string());
    }
    println!("[Rust] Webhook URL saved successfully");
    Ok(())
}

#[tauri::command]
fn get_auto_sync() -> Result<bool, String> {
    let config = load_profile_config();
    Ok(config.sync.auto_sync)
}

#[tauri::command]
fn set_auto_sync(enabled: bool) -> Result<(), String> {
    let mut config = load_profile_config();
    config.sync.auto_sync = enabled;
    if !save_profile_config(&config) {
        return Err("Failed to save auto-sync setting".to_string());
    }
    println!("[Rust] Auto-sync set to: {}", enabled);
    Ok(())
}

/// Check if auto-sync is enabled
fn is_auto_sync_enabled() -> bool {
    load_profile_config().sync.auto_sync
}

/// Trigger sync if auto-sync is enabled and webhook is configured
async fn trigger_auto_sync_if_enabled() {
    if !is_auto_sync_enabled() {
        return;
    }

    // Check if webhook is configured (from profiles.json)
    let config = load_profile_config();
    if config.sync.server_url.is_empty() {
        println!("[Rust] Auto-sync: skipping, no webhook configured");
        return;
    }

    println!("[Rust] Auto-sync: triggering sync after save");
    // Use sync_all for bidirectional sync
    match sync_all_internal().await {
        Ok(result) => {
            println!("[Rust] Auto-sync completed: pulled={}, pushed={}", result.pulled, result.pushed);
        }
        Err(e) => {
            println!("[Rust] Auto-sync failed: {}", e);
        }
    }
}

#[tauri::command]
async fn sync_to_webhook() -> Result<SyncResult, String> {
    println!("[Rust] sync_to_webhook called");

    // Get webhook URL and API key from profiles.json
    let config = load_profile_config();
    let base_webhook_url = &config.sync.server_url;

    if base_webhook_url.is_empty() {
        return Err("No webhook URL configured".to_string());
    }

    // Append profile to webhook URL
    let webhook_url = append_profile_to_url(base_webhook_url)?;

    let api_key = if config.sync.api_key.is_empty() {
        None
    } else {
        Some(config.sync.api_key.clone())
    };

    // Get all items (reuse existing logic)
    let urls = get_saved_urls().await?;
    let texts = get_saved_texts().await?;
    let tagsets = get_saved_tagsets().await?;

    let total_count = urls.len() + texts.len() + tagsets.len();

    if total_count == 0 {
        return Ok(SyncResult {
            success: true,
            synced_count: 0,
            message: "No items to sync".to_string(),
        });
    }

    // Create payload with all item types
    let payload = WebhookPayload { urls, texts, tagsets };

    // Send to webhook
    let client = reqwest::Client::new();
    let mut request = client.post(&webhook_url).json(&payload);

    // Add Authorization header if API key is configured
    if let Some(key) = api_key {
        if !key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to send webhook request: {}", e))?;

    if response.status().is_success() {
        // Update last sync time
        let conn = get_connection()?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync', ?)",
            params![&now],
        )
        .ok();

        println!("[Rust] Webhook sync successful, synced {} items", total_count);
        Ok(SyncResult {
            success: true,
            synced_count: total_count,
            message: format!("Successfully synced {} items", total_count),
        })
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!("Webhook returned error {}: {}", status, body))
    }
}

#[tauri::command]
fn get_last_sync() -> Result<Option<String>, String> {
    let conn = get_connection()?;
    let last_sync: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();
    Ok(last_sync)
}

/// Profile info returned to the UI
#[derive(Debug, Serialize, Deserialize)]
struct ProfileInfo {
    #[serde(rename = "currentProfileId")]
    current_profile_id: String,
    #[serde(rename = "isProductionBuild")]
    is_production_build: bool,
    profiles: Vec<ProfileEntry>,
    sync: SyncSettings,
}

/// Get current profile information including all available profiles
#[tauri::command]
fn get_profile_info() -> Result<ProfileInfo, String> {
    let config = load_profile_config();

    Ok(ProfileInfo {
        current_profile_id: config.current_profile_id.clone(),
        is_production_build: is_production_build(),
        profiles: config.profiles,
        sync: config.sync,
    })
}

/// Switch to a different profile
/// This changes both local database and sync target
/// Returns updated profile info
#[tauri::command]
fn set_profile(profile_id: String) -> Result<ProfileInfo, String> {
    let mut config = load_profile_config();

    // Verify profile exists
    let profile = config.profiles.iter().find(|p| p.id == profile_id);
    if profile.is_none() {
        return Err(format!("Profile '{}' does not exist", profile_id));
    }

    // Update last_used_at for the profile being switched to
    let now = Utc::now().to_rfc3339();
    for p in &mut config.profiles {
        if p.id == profile_id {
            p.last_used_at = now.clone();
        }
    }

    // Update current profile
    config.current_profile_id = profile_id.clone();
    if !save_profile_config(&config) {
        return Err("Failed to save profile config".to_string());
    }

    println!("[Rust] Switched to profile: {}", profile_id);

    // Clear the database connection cache so next access uses new profile's DB
    // Note: This requires the app to re-initialize database on next access
    clear_db_cache();

    get_profile_info()
}

/// Create a new profile
#[tauri::command]
fn create_profile(name: String) -> Result<ProfileInfo, String> {
    let mut config = load_profile_config();

    if name.trim().is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }

    // Check for duplicate name (case-insensitive)
    if config.profiles.iter().any(|p| p.name.to_lowercase() == name.to_lowercase()) {
        return Err(format!("Profile '{}' already exists", name));
    }

    // Generate UUID for new profile
    let id = uuid::Uuid::new_v4().to_string();
    let now = Utc::now().to_rfc3339();

    // Add new profile
    config.profiles.push(ProfileEntry {
        id: id.clone(),
        name: name.clone(),
        created_at: now.clone(),
        last_used_at: now,
    });

    if !save_profile_config(&config) {
        return Err("Failed to save profile config".to_string());
    }

    println!("[Rust] Created profile: {} (id: {})", name, id);
    get_profile_info()
}

/// Delete a profile (cannot delete current profile or the last remaining profile)
#[tauri::command]
fn delete_profile(profile_id: String) -> Result<ProfileInfo, String> {
    let mut config = load_profile_config();

    // Cannot delete current profile
    if config.current_profile_id == profile_id {
        return Err("Cannot delete the current profile. Switch to another profile first.".to_string());
    }

    // Cannot delete if it's the last profile
    if config.profiles.len() <= 1 {
        return Err("Cannot delete the last profile".to_string());
    }

    // Remove profile
    let original_len = config.profiles.len();
    config.profiles.retain(|p| p.id != profile_id);

    if config.profiles.len() == original_len {
        return Err(format!("Profile '{}' not found", profile_id));
    }

    if !save_profile_config(&config) {
        return Err("Failed to save profile config".to_string());
    }

    // Note: We don't delete the database file - user can manually remove it
    println!("[Rust] Deleted profile: {}", profile_id);
    get_profile_info()
}

/// Swap databases between two profiles (one-time migration helper)
#[tauri::command]
fn swap_profile_databases(profile_id_a: String, profile_id_b: String) -> Result<String, String> {
    let container_path = get_container_path().ok_or("Failed to get container path")?;

    let db_a = container_path.join(format!("peek-{}.db", profile_id_a));
    let db_b = container_path.join(format!("peek-{}.db", profile_id_b));
    let db_temp = container_path.join("peek-swap-temp.db");

    if !db_a.exists() {
        return Err(format!("Database A not found: {}", db_a.display()));
    }
    if !db_b.exists() {
        return Err(format!("Database B not found: {}", db_b.display()));
    }

    // Swap: A -> temp, B -> A, temp -> B
    fs::rename(&db_a, &db_temp).map_err(|e| format!("Failed to move A to temp: {}", e))?;
    fs::rename(&db_b, &db_a).map_err(|e| format!("Failed to move B to A: {}", e))?;
    fs::rename(&db_temp, &db_b).map_err(|e| format!("Failed to move temp to B: {}", e))?;

    // Also swap WAL files if they exist
    let wal_a = container_path.join(format!("peek-{}.db-wal", profile_id_a));
    let wal_b = container_path.join(format!("peek-{}.db-wal", profile_id_b));
    let wal_temp = container_path.join("peek-swap-temp.db-wal");
    if wal_a.exists() && wal_b.exists() {
        let _ = fs::rename(&wal_a, &wal_temp);
        let _ = fs::rename(&wal_b, &wal_a);
        let _ = fs::rename(&wal_temp, &wal_b);
    }

    // Also swap SHM files if they exist
    let shm_a = container_path.join(format!("peek-{}.db-shm", profile_id_a));
    let shm_b = container_path.join(format!("peek-{}.db-shm", profile_id_b));
    let shm_temp = container_path.join("peek-swap-temp.db-shm");
    if shm_a.exists() && shm_b.exists() {
        let _ = fs::rename(&shm_a, &shm_temp);
        let _ = fs::rename(&shm_b, &shm_a);
        let _ = fs::rename(&shm_temp, &shm_b);
    }

    Ok(format!("Swapped databases. Restart app to see changes."))
}

/// Reset to first profile (typically Default or Development based on build)
#[tauri::command]
fn reset_profile_to_default() -> Result<ProfileInfo, String> {
    let config = load_profile_config();
    if let Some(first_profile) = config.profiles.first() {
        set_profile(first_profile.id.clone())
    } else {
        Err("No profiles available".to_string())
    }
}

/// Clear database cache to force re-initialization on profile switch
fn clear_db_cache() {
    // The DB_INIT Once guard can't be reset, but we can work around this
    // by tracking the current profile in a separate variable
    // For now, profile switch will require app restart for full isolation
    // This matches desktop behavior where profile switch restarts the app
    println!("[Rust] Note: Full profile switch requires app restart for complete database isolation");
}

#[tauri::command]
async fn auto_sync_if_needed() -> Result<Option<SyncResult>, String> {
    // Check if webhook URL is configured (from profiles.json)
    let config = load_profile_config();
    if config.sync.server_url.is_empty() {
        return Ok(None); // No webhook configured, nothing to do
    }

    // Check last sync time (still in database as it's per-profile data)
    let conn = get_connection()?;
    let last_sync: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();

    let should_sync = match last_sync {
        None => true, // Never synced
        Some(last_sync_str) => {
            if let Ok(last_sync_time) = chrono::DateTime::parse_from_rfc3339(&last_sync_str) {
                let now = Utc::now();
                let hours_since_sync = (now - last_sync_time.with_timezone(&Utc)).num_hours();
                hours_since_sync >= 24
            } else {
                true // Invalid date, sync anyway
            }
        }
    };

    drop(conn); // Close connection before async call

    if should_sync {
        println!("[Rust] Auto-sync: syncing (>24h since last sync)");
        match sync_to_webhook().await {
            Ok(result) => Ok(Some(result)),
            Err(e) => {
                println!("[Rust] Auto-sync failed: {}", e);
                Ok(None) // Don't propagate error, just skip
            }
        }
    } else {
        println!("[Rust] Auto-sync: skipping (synced within 24h)");
        Ok(None)
    }
}

// ==================== Bidirectional Sync ====================

/// Helper to convert ISO string to chrono DateTime
fn parse_iso_datetime(iso: &str) -> Option<chrono::DateTime<Utc>> {
    chrono::DateTime::parse_from_rfc3339(iso)
        .ok()
        .map(|dt| dt.with_timezone(&Utc))
}

/// Get items that need to be pushed (never synced or modified since last sync)
fn get_items_to_push(conn: &Connection, last_sync: Option<&str>) -> Result<Vec<(String, String, Option<String>, Option<String>, String, String)>, String> {
    // Returns: (id, type, url, content, metadata, updated_at)
    if let Some(sync_time) = last_sync {
        // Items never synced OR modified after last sync
        let mut stmt = conn
            .prepare(
                "SELECT id, type, url, content, COALESCE(metadata, ''), updated_at FROM items
                 WHERE deleted_at IS NULL AND (sync_source = '' OR sync_source IS NULL OR updated_at > ?)"
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let items: Vec<(String, String, Option<String>, Option<String>, String, String)> = stmt
            .query_map(params![sync_time], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
            })
            .map_err(|e| format!("Failed to query items: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(items)
    } else {
        // All items that haven't been synced
        let mut stmt = conn
            .prepare(
                "SELECT id, type, url, content, COALESCE(metadata, ''), updated_at FROM items
                 WHERE deleted_at IS NULL AND (sync_source = '' OR sync_source IS NULL)"
            )
            .map_err(|e| format!("Failed to prepare query: {}", e))?;

        let items: Vec<(String, String, Option<String>, Option<String>, String, String)> = stmt
            .query_map([], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?, row.get(5)?))
            })
            .map_err(|e| format!("Failed to query items: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        Ok(items)
    }
}

/// Get tags for an item
fn get_item_tags(conn: &Connection, item_id: &str) -> Result<Vec<String>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?
             ORDER BY t.name"
        )
        .map_err(|e| format!("Failed to prepare tag query: {}", e))?;

    let tags: Vec<String> = stmt
        .query_map(params![item_id], |row| row.get(0))
        .map_err(|e| format!("Failed to query tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

/// Merge a server item into the local database
fn merge_server_item(conn: &Connection, server_item: &ServerItem) -> Result<&'static str, String> {
    let now = Utc::now().to_rfc3339();
    let server_updated = parse_iso_datetime(&server_item.updated_at)
        .ok_or("Invalid server updated_at timestamp")?;

    // Check if this item was soft-deleted locally - if so, skip the import
    let was_deleted: bool = conn
        .query_row(
            "SELECT 1 FROM items WHERE sync_id = ? AND deleted_at IS NOT NULL",
            params![&server_item.id],
            |_| Ok(true)
        )
        .unwrap_or(false);

    if was_deleted {
        println!("[Rust] Sync: Skipping deleted item from server: {}", server_item.id);
        return Ok("skipped");
    }

    // Find local item by sync_id matching server id
    let local_item: Option<(String, String)> = conn
        .query_row(
            "SELECT id, updated_at FROM items WHERE sync_id = ? AND deleted_at IS NULL",
            params![&server_item.id],
            |row| Ok((row.get(0)?, row.get(1)?))
        )
        .ok();

    if let Some((local_id, local_updated_str)) = local_item {
        // Item exists locally - check timestamps for conflict resolution
        let local_updated = parse_iso_datetime(&local_updated_str);

        if let Some(local_dt) = local_updated {
            if server_updated > local_dt {
                // Server is newer - update local
                println!("[Rust] Sync: Updating local item from server: {}", server_item.id);

                let metadata_json = server_item.metadata.as_ref()
                    .map(|m| serde_json::to_string(m).unwrap_or_default());

                // Map server type to local type (server uses "url", mobile may have used "page")
                let item_type = &server_item.item_type;

                // Determine content field based on type
                let (url_val, content_val): (Option<&str>, Option<&str>) = match item_type.as_str() {
                    "url" | "page" => (server_item.content.as_deref(), None),
                    _ => (None, server_item.content.as_deref()),
                };

                conn.execute(
                    "UPDATE items SET type = ?, url = ?, content = ?, metadata = ?, updated_at = ? WHERE id = ?",
                    params![item_type, url_val, content_val, &metadata_json, &server_item.updated_at, &local_id],
                )
                .map_err(|e| format!("Failed to update item: {}", e))?;

                // Update tags
                update_item_tags_from_server(conn, &local_id, &server_item.tags)?;

                return Ok("pulled");
            } else if local_dt > server_updated {
                // Local is newer - conflict, local wins
                println!("[Rust] Sync: Conflict - local is newer for {}, keeping local", server_item.id);
                return Ok("conflict");
            }
        }

        // Same timestamp - skip
        return Ok("skipped");
    }

    // Item doesn't exist locally - insert it
    println!("[Rust] Sync: Inserting new item from server: {}", server_item.id);

    let new_id = uuid::Uuid::new_v4().to_string();
    let metadata_json = server_item.metadata.as_ref()
        .map(|m| serde_json::to_string(m).unwrap_or_default());

    // Map server type to local type
    let item_type = &server_item.item_type;

    // Determine content field based on type
    let (url_val, content_val): (Option<&str>, Option<&str>) = match item_type.as_str() {
        "url" | "page" => (server_item.content.as_deref(), None),
        _ => (None, server_item.content.as_deref()),
    };

    conn.execute(
        "INSERT INTO items (id, type, url, content, metadata, sync_id, sync_source, synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'server', ?, ?, ?)",
        params![
            &new_id,
            item_type,
            url_val,
            content_val,
            &metadata_json,
            &server_item.id,
            &now,
            &server_item.created_at,
            &server_item.updated_at
        ],
    )
    .map_err(|e| format!("Failed to insert item: {}", e))?;

    // Add tags
    update_item_tags_from_server(conn, &new_id, &server_item.tags)?;

    Ok("pulled")
}

/// Update tags for an item based on server data
fn update_item_tags_from_server(conn: &Connection, item_id: &str, tag_names: &[String]) -> Result<(), String> {
    let now = Utc::now().to_rfc3339();

    // Remove existing tags for this item
    conn.execute("DELETE FROM item_tags WHERE item_id = ?", params![item_id])
        .map_err(|e| format!("Failed to remove old tags: {}", e))?;

    // Add new tags
    for tag_name in tag_names {
        // Get or create tag
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(id) => {
                // Update existing tag stats
                let frequency: u32 = conn
                    .query_row("SELECT frequency FROM tags WHERE id = ?", params![id], |row| row.get(0))
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, id],
                ).ok();

                id
            }
            Err(_) => {
                // Create new tag
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        // Create item-tag association
        conn.execute(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![item_id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    Ok(())
}

/// Pull items from server and merge into local database
#[tauri::command]
async fn pull_from_server() -> Result<BidirectionalSyncResult, String> {
    println!("[Rust] pull_from_server called");

    // Get server URL and API key from profiles.json
    let config = load_profile_config();
    let server_url = &config.sync.server_url;

    if server_url.is_empty() {
        return Err("No server URL configured".to_string());
    }

    let api_key = if config.sync.api_key.is_empty() {
        None
    } else {
        Some(config.sync.api_key.clone())
    };

    // Get last sync time from database (per-profile data)
    let conn = get_connection()?;
    let last_sync: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();

    drop(conn); // Close connection before async call

    // Build request URL with profile parameter
    let base_url = if let Some(ref sync_time) = last_sync {
        // Incremental sync - get items since last sync
        format!("{}/items/since/{}", server_url.trim_end_matches('/'), sync_time)
    } else {
        // Full sync - get all items
        format!("{}/items", server_url.trim_end_matches('/'))
    };
    let items_url = append_profile_to_url(&base_url)?;

    println!("[Rust] Pulling from: {}", items_url);

    // Fetch items from server
    let client = reqwest::Client::new();
    let mut request = client.get(&items_url);

    if let Some(key) = &api_key {
        if !key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to fetch from server: {}", e))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Server returned error {}: {}", status, body));
    }

    let server_response: ServerItemsResponse = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse server response: {}", e))?;

    println!("[Rust] Received {} items from server", server_response.items.len());

    // Merge items into local database
    let conn = get_connection()?;
    let mut pulled = 0;
    let mut conflicts = 0;

    for server_item in &server_response.items {
        match merge_server_item(&conn, server_item)? {
            "pulled" => pulled += 1,
            "conflict" => conflicts += 1,
            _ => {}
        }
    }

    println!("[Rust] Pull complete: {} pulled, {} conflicts", pulled, conflicts);

    Ok(BidirectionalSyncResult {
        success: true,
        pulled,
        pushed: 0,
        conflicts,
        message: format!("Pulled {} items, {} conflicts", pulled, conflicts),
    })
}

/// Push local items to server using POST /items
#[tauri::command]
async fn push_to_server() -> Result<BidirectionalSyncResult, String> {
    println!("[Rust] push_to_server called");

    // Get server URL and API key from profiles.json
    let config = load_profile_config();
    let server_url = &config.sync.server_url;

    if server_url.is_empty() {
        return Err("No server URL configured".to_string());
    }

    let api_key = if config.sync.api_key.is_empty() {
        None
    } else {
        Some(config.sync.api_key.clone())
    };

    // Get last sync time from database (per-profile data)
    let conn = get_connection()?;
    let last_sync: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();

    // Get items to push
    let items = get_items_to_push(&conn, last_sync.as_deref())?;
    println!("[Rust] Found {} items to push", items.len());

    if items.is_empty() {
        return Ok(BidirectionalSyncResult {
            success: true,
            pulled: 0,
            pushed: 0,
            conflicts: 0,
            message: "No items to push".to_string(),
        });
    }

    let client = reqwest::Client::new();
    let base_post_url = format!("{}/items", server_url.trim_end_matches('/'));
    let post_url = append_profile_to_url(&base_post_url)?;
    let mut pushed = 0;
    let mut failed = 0;

    for (item_id, item_type, url_opt, content_opt, metadata_str, _updated_at) in &items {
        // Get tags for this item
        let tags = get_item_tags(&conn, item_id)?;

        // Determine content based on type
        let content = match item_type.as_str() {
            "url" | "page" => url_opt.clone(),
            _ => content_opt.clone(),
        };

        // Map "page" type to "url" for server
        let server_type = if item_type == "page" { "url" } else { item_type };

        // Parse metadata
        let metadata: Option<serde_json::Value> = if !metadata_str.is_empty() {
            serde_json::from_str(metadata_str).ok()
        } else {
            None
        };

        // Build request body
        let body = serde_json::json!({
            "type": server_type,
            "content": content,
            "tags": tags,
            "metadata": metadata,
            "sync_id": item_id,  // Send local id as sync_id for deduplication
        });

        let mut request = client.post(&post_url).json(&body);

        if let Some(key) = &api_key {
            if !key.is_empty() {
                request = request.header("Authorization", format!("Bearer {}", key));
            }
        }

        match request.send().await {
            Ok(response) => {
                if response.status().is_success() {
                    // Parse response to get server ID
                    if let Ok(create_response) = response.json::<ServerCreateResponse>().await {
                        // Update local item with sync info
                        let now = Utc::now().to_rfc3339();
                        conn.execute(
                            "UPDATE items SET sync_id = ?, sync_source = 'server', synced_at = ? WHERE id = ?",
                            params![&create_response.id, &now, item_id],
                        ).ok();

                        println!("[Rust] Pushed item {} -> {}", item_id, create_response.id);
                        pushed += 1;
                    } else {
                        failed += 1;
                    }
                } else {
                    let status = response.status();
                    println!("[Rust] Failed to push item {}: {}", item_id, status);
                    failed += 1;
                }
            }
            Err(e) => {
                println!("[Rust] Failed to push item {}: {}", item_id, e);
                failed += 1;
            }
        }
    }

    println!("[Rust] Push complete: {} pushed, {} failed", pushed, failed);

    Ok(BidirectionalSyncResult {
        success: failed == 0,
        pulled: 0,
        pushed,
        conflicts: 0,
        message: if failed > 0 {
            format!("Pushed {} items, {} failed", pushed, failed)
        } else {
            format!("Pushed {} items", pushed)
        },
    })
}

/// Full bidirectional sync: pull then push
#[tauri::command]
/// Internal sync_all implementation (called by both command and auto-sync)
async fn sync_all_internal() -> Result<BidirectionalSyncResult, String> {
    // Pull first
    let pull_result = pull_from_server().await?;

    // Then push
    let push_result = push_to_server().await?;

    // Update last sync time
    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();
    conn.execute(
        "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync', ?)",
        params![&now],
    ).ok();

    let total_pulled = pull_result.pulled;
    let total_pushed = push_result.pushed;
    let total_conflicts = pull_result.conflicts;

    println!("[Rust] Sync complete: {} pulled, {} pushed, {} conflicts", total_pulled, total_pushed, total_conflicts);

    Ok(BidirectionalSyncResult {
        success: true,
        pulled: total_pulled,
        pushed: total_pushed,
        conflicts: total_conflicts,
        message: format!("Synced: {} pulled, {} pushed", total_pulled, total_pushed),
    })
}

#[tauri::command]
async fn sync_all() -> Result<BidirectionalSyncResult, String> {
    println!("[Rust] sync_all called");
    sync_all_internal().await
}

/// Get current sync status
#[tauri::command]
fn get_sync_status() -> Result<SyncStatus, String> {
    let conn = get_connection()?;

    // Check if configured (from profiles.json)
    let config = load_profile_config();
    let configured = !config.sync.server_url.is_empty() && !config.sync.api_key.is_empty();

    // Get last sync time (per-profile data)
    let last_sync_time: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();

    // Count pending items (never synced or modified since last sync)
    let pending_count: usize = if let Some(ref sync_time) = last_sync_time {
        conn.query_row(
            "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL AND (sync_source = '' OR sync_source IS NULL OR updated_at > ?)",
            params![sync_time],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) as usize
    } else {
        conn.query_row(
            "SELECT COUNT(*) FROM items WHERE deleted_at IS NULL AND (sync_source = '' OR sync_source IS NULL)",
            [],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) as usize
    };

    Ok(SyncStatus {
        configured,
        last_sync_time,
        pending_count,
    })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Page (URL) commands
            save_url,
            get_saved_urls,
            update_url,
            update_url_tags,
            delete_url,
            // Text commands
            save_text,
            get_saved_texts,
            update_text,
            // Tagset commands
            save_tagset,
            get_saved_tagsets,
            update_tagset,
            // Image commands
            save_image,
            save_captured_image,
            get_saved_images,
            get_image_data,
            update_image_tags,
            // Tag commands
            get_tags_by_frecency,
            get_tags_by_frecency_for_url,
            // Settings and sync
            is_dark_mode,
            get_webhook_url,
            set_webhook_url,
            get_webhook_api_key,
            set_webhook_api_key,
            get_auto_sync,
            set_auto_sync,
            sync_to_webhook,
            get_last_sync,
            auto_sync_if_needed,
            // Profile management
            get_profile_info,
            set_profile,
            create_profile,
            delete_profile,
            reset_profile_to_default,
            quit_app,
            // Bidirectional sync
            pull_from_server,
            push_to_server,
            sync_all,
            get_sync_status,
            // Legacy/deprecated
            get_shared_url,
            // Debug
            debug_list_container_files,
            debug_profiles_json,
            debug_settings_table,
            debug_query_database,
            debug_export_database,
            swap_profile_databases
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use rusqlite::{params, Connection};
    use chrono::Utc;

    /// Create the database schema for testing (unified model with sync columns)
    fn create_test_schema(conn: &Connection) {
        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS items (
                id TEXT PRIMARY KEY,
                type TEXT NOT NULL DEFAULT 'url',
                url TEXT,
                content TEXT,
                metadata TEXT,
                sync_id TEXT DEFAULT '',
                sync_source TEXT DEFAULT '',
                synced_at TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                deleted_at TEXT
            );

            CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
            CREATE INDEX IF NOT EXISTS idx_items_sync_id ON items(sync_id);

            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                frequency INTEGER NOT NULL DEFAULT 0,
                last_used TEXT NOT NULL,
                frecency_score REAL NOT NULL DEFAULT 0.0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS item_tags (
                item_id TEXT NOT NULL,
                tag_id INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                PRIMARY KEY (item_id, tag_id),
                FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
            );
            ",
        )
        .expect("Failed to create test schema");
    }

    /// Save a text item with tags (core logic extracted for testing)
    fn save_text_with_tags(conn: &Connection, content: &str, tags: &[String]) -> String {
        let now = Utc::now().to_rfc3339();
        let id = uuid::Uuid::new_v4().to_string();

        // Insert text item
        conn.execute(
            "INSERT INTO items (id, type, content, created_at, updated_at) VALUES (?, 'text', ?, ?, ?)",
            params![&id, content, &now, &now],
        )
        .expect("Failed to insert text item");

        // Add tags
        for tag_name in tags {
            let normalized = tag_name.trim().to_lowercase();
            if normalized.is_empty() {
                continue;
            }

            let tag_id: i64 = match conn.query_row(
                "SELECT id FROM tags WHERE name = ?",
                params![&normalized],
                |row| row.get(0),
            ) {
                Ok(existing_id) => existing_id,
                Err(_) => {
                    conn.execute(
                        "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, 10.0, ?, ?)",
                        params![&normalized, &now, &now, &now],
                    )
                    .expect("Failed to insert tag");
                    conn.last_insert_rowid()
                }
            };

            conn.execute(
                "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
                params![&id, tag_id, &now],
            )
            .expect("Failed to link tag");
        }

        id
    }

    /// Get tags for an item from the database
    fn get_item_tags(conn: &Connection, item_id: &str) -> Vec<String> {
        let mut stmt = conn
            .prepare(
                "SELECT t.name FROM tags t
                 JOIN item_tags it ON t.id = it.tag_id
                 WHERE it.item_id = ?
                 ORDER BY t.name",
            )
            .expect("Failed to prepare query");

        stmt.query_map(params![item_id], |row| row.get(0))
            .expect("Failed to query tags")
            .filter_map(|r| r.ok())
            .collect()
    }

    #[test]
    fn test_save_text_with_tags() {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory database");
        create_test_schema(&conn);

        // Save a text item with tags (simulates quick-add with tag buttons)
        let tags = vec!["work".to_string(), "important".to_string()];
        let item_id = save_text_with_tags(&conn, "This is a test note", &tags);

        // Verify the item was saved
        let content: String = conn
            .query_row(
                "SELECT content FROM items WHERE id = ?",
                params![&item_id],
                |row| row.get(0),
            )
            .expect("Failed to find saved item");
        assert_eq!(content, "This is a test note");

        // Verify tags were saved and linked
        let saved_tags = get_item_tags(&conn, &item_id);
        assert_eq!(saved_tags.len(), 2, "Expected 2 tags, got {:?}", saved_tags);
        assert!(saved_tags.contains(&"work".to_string()), "Missing 'work' tag");
        assert!(saved_tags.contains(&"important".to_string()), "Missing 'important' tag");
    }

    #[test]
    fn test_save_text_with_hashtags_and_button_tags() {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory database");
        create_test_schema(&conn);

        // Simulate content with hashtags plus additional button-selected tags
        // The real save_text parses hashtags and merges with provided tags
        let content_hashtags = vec!["hashtag1".to_string()];
        let button_tags = vec!["button-tag".to_string()];
        let mut all_tags = content_hashtags;
        all_tags.extend(button_tags);

        let item_id = save_text_with_tags(&conn, "Note with #hashtag1", &all_tags);

        let saved_tags = get_item_tags(&conn, &item_id);
        assert_eq!(saved_tags.len(), 2, "Expected 2 tags (hashtag + button), got {:?}", saved_tags);
        assert!(saved_tags.contains(&"hashtag1".to_string()), "Missing hashtag");
        assert!(saved_tags.contains(&"button-tag".to_string()), "Missing button tag");
    }

    #[test]
    fn test_save_text_empty_tags() {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory database");
        create_test_schema(&conn);

        // Save without any tags
        let item_id = save_text_with_tags(&conn, "Note without tags", &[]);

        let saved_tags = get_item_tags(&conn, &item_id);
        assert!(saved_tags.is_empty(), "Expected no tags, got {:?}", saved_tags);
    }

    #[test]
    fn test_tag_normalization() {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory database");
        create_test_schema(&conn);

        // Tags should be normalized (lowercase, trimmed)
        let tags = vec!["  UPPERCASE  ".to_string(), "MixedCase".to_string()];
        let item_id = save_text_with_tags(&conn, "Test normalization", &tags);

        let saved_tags = get_item_tags(&conn, &item_id);
        assert!(saved_tags.contains(&"uppercase".to_string()), "Tag should be lowercase");
        assert!(saved_tags.contains(&"mixedcase".to_string()), "Tag should be lowercase");
    }

    // === Unified Item Type Tests ===

    /// Save a URL item (tests url type)
    fn save_url_item(conn: &Connection, url: &str) -> String {
        let now = Utc::now().to_rfc3339();
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO items (id, type, url, created_at, updated_at) VALUES (?, 'url', ?, ?, ?)",
            params![&id, url, &now, &now],
        )
        .expect("Failed to insert url item");

        id
    }

    /// Save a tagset item (tests tagset type)
    fn save_tagset_item(conn: &Connection, tags: &[String]) -> String {
        let now = Utc::now().to_rfc3339();
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO items (id, type, created_at, updated_at) VALUES (?, 'tagset', ?, ?)",
            params![&id, &now, &now],
        )
        .expect("Failed to insert tagset item");

        // Add tags
        for tag_name in tags {
            let normalized = tag_name.trim().to_lowercase();
            if normalized.is_empty() {
                continue;
            }

            let tag_id: i64 = match conn.query_row(
                "SELECT id FROM tags WHERE name = ?",
                params![&normalized],
                |row| row.get(0),
            ) {
                Ok(existing_id) => existing_id,
                Err(_) => {
                    conn.execute(
                        "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, 10.0, ?, ?)",
                        params![&normalized, &now, &now, &now],
                    )
                    .expect("Failed to insert tag");
                    conn.last_insert_rowid()
                }
            };

            conn.execute(
                "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
                params![&id, tag_id, &now],
            )
            .expect("Failed to link tag");
        }

        id
    }

    #[test]
    fn test_unified_item_types() {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory database");
        create_test_schema(&conn);

        // Create items of each type
        let url_id = save_url_item(&conn, "https://example.com");
        let text_id = save_text_with_tags(&conn, "My note", &[]);
        let tagset_id = save_tagset_item(&conn, &["tag1".to_string(), "tag2".to_string()]);

        // Verify url type
        let url_type: String = conn
            .query_row("SELECT type FROM items WHERE id = ?", params![&url_id], |row| row.get(0))
            .expect("Failed to query url type");
        assert_eq!(url_type, "url", "URL item should have type 'url'");

        // Verify text type
        let text_type: String = conn
            .query_row("SELECT type FROM items WHERE id = ?", params![&text_id], |row| row.get(0))
            .expect("Failed to query text type");
        assert_eq!(text_type, "text", "Text item should have type 'text'");

        // Verify tagset type
        let tagset_type: String = conn
            .query_row("SELECT type FROM items WHERE id = ?", params![&tagset_id], |row| row.get(0))
            .expect("Failed to query tagset type");
        assert_eq!(tagset_type, "tagset", "Tagset item should have type 'tagset'");
    }

    #[test]
    fn test_sync_columns_exist() {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory database");
        create_test_schema(&conn);

        // Verify sync columns exist by inserting an item with sync values
        let now = Utc::now().to_rfc3339();
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO items (id, type, url, sync_id, sync_source, synced_at, created_at, updated_at) VALUES (?, 'url', ?, ?, ?, ?, ?, ?)",
            params![&id, "https://sync-test.com", "remote-123", "server", &now, &now, &now],
        )
        .expect("Failed to insert item with sync columns");

        // Retrieve and verify
        let (sync_id, sync_source, synced_at): (String, String, String) = conn
            .query_row(
                "SELECT sync_id, sync_source, synced_at FROM items WHERE id = ?",
                params![&id],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .expect("Failed to query sync columns");

        assert_eq!(sync_id, "remote-123", "sync_id should be saved");
        assert_eq!(sync_source, "server", "sync_source should be saved");
        assert_eq!(synced_at, now, "synced_at should be saved");
    }

    #[test]
    fn test_sync_id_index() {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory database");
        create_test_schema(&conn);

        // Verify the sync_id index exists
        let index_count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='index' AND name='idx_items_sync_id'",
                [],
                |row| row.get(0),
            )
            .expect("Failed to query index");

        assert_eq!(index_count, 1, "idx_items_sync_id index should exist");
    }

    #[test]
    fn test_filter_items_by_type() {
        let conn = Connection::open_in_memory().expect("Failed to create in-memory database");
        create_test_schema(&conn);

        // Create items of different types
        save_url_item(&conn, "https://example1.com");
        save_url_item(&conn, "https://example2.com");
        save_text_with_tags(&conn, "Note 1", &[]);
        save_tagset_item(&conn, &["tag".to_string()]);

        // Count by type
        let url_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM items WHERE type = 'url'", [], |row| row.get(0))
            .expect("Failed to count urls");
        let text_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM items WHERE type = 'text'", [], |row| row.get(0))
            .expect("Failed to count texts");
        let tagset_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM items WHERE type = 'tagset'", [], |row| row.get(0))
            .expect("Failed to count tagsets");

        assert_eq!(url_count, 2, "Should have 2 url items");
        assert_eq!(text_count, 1, "Should have 1 text item");
        assert_eq!(tagset_count, 1, "Should have 1 tagset item");
    }
}
