//! Profile Management Module
//!
//! Manages user profiles on the desktop client. Each profile has:
//! - Isolated data storage (separate datastore.sqlite)
//! - Optional per-profile sync configuration
//! - Separate Chromium session data (on desktop)
//!
//! Profile metadata is stored in profiles.db in the userData directory.
//! Ports backend/electron/profiles.ts to Rust.

use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Profile {
    pub id: String,
    pub name: String,
    pub slug: String,

    pub sync_enabled: bool,
    pub api_key: Option<String>,
    pub server_profile_slug: Option<String>,
    pub last_sync_at: Option<i64>,

    pub created_at: i64,
    pub last_used_at: i64,
    pub is_default: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSyncConfig {
    pub api_key: String,
    pub server_profile_slug: String,
}

// ==================== Database Initialization ====================

/// Initialize the profiles database
pub fn init_profiles_db(db_path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS profiles (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            slug TEXT NOT NULL UNIQUE,

            sync_enabled INTEGER DEFAULT 0,
            api_key TEXT,
            server_profile_slug TEXT,
            last_sync_at INTEGER,

            created_at INTEGER NOT NULL,
            last_used_at INTEGER NOT NULL,
            is_default INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS active_profile (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            profile_slug TEXT NOT NULL
        );",
    )?;

    Ok(conn)
}

// ==================== Helpers ====================

fn row_to_profile(row: &rusqlite::Row) -> rusqlite::Result<Profile> {
    Ok(Profile {
        id: row.get("id")?,
        name: row.get("name")?,
        slug: row.get("slug")?,
        sync_enabled: row.get::<_, i64>("sync_enabled")? == 1,
        api_key: row.get("api_key")?,
        server_profile_slug: row.get("server_profile_slug")?,
        last_sync_at: row.get("last_sync_at")?,
        created_at: row.get("created_at")?,
        last_used_at: row.get("last_used_at")?,
        is_default: row.get::<_, i64>("is_default")? == 1,
    })
}

fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn generate_uuid() -> String {
    uuid::Uuid::new_v4().to_string()
}

/// Generate a filesystem-safe slug from a name
fn slugify(name: &str) -> String {
    name.to_lowercase()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join("-")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == '-')
        .collect()
}

// ==================== CRUD Operations ====================

/// List all profiles
pub fn list_profiles(conn: &Connection) -> Vec<Profile> {
    let mut stmt = conn
        .prepare("SELECT * FROM profiles ORDER BY last_used_at DESC")
        .unwrap();
    stmt.query_map([], |row| row_to_profile(row))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect()
}

/// Create a new profile
pub fn create_profile(
    conn: &Connection,
    name: &str,
    user_data_path: Option<&Path>,
) -> rusqlite::Result<Profile> {
    let slug = slugify(name);

    // Check if slug already exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM profiles WHERE slug = ?1",
            params![slug],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)?;

    if exists {
        return Err(rusqlite::Error::QueryReturnedNoRows); // Profile exists
    }

    let id = generate_uuid();
    let timestamp = now();

    conn.execute(
        "INSERT INTO profiles (id, name, slug, sync_enabled, created_at, last_used_at, is_default) VALUES (?1, ?2, ?3, 0, ?4, ?5, 0)",
        params![id, name, slug, timestamp, timestamp],
    )?;

    // Create profile directory
    if let Some(data_path) = user_data_path {
        let profile_dir = data_path.join(&slug);
        let _ = std::fs::create_dir_all(profile_dir);
    }

    get_profile(conn, &slug).ok_or(rusqlite::Error::QueryReturnedNoRows)
}

/// Get a profile by slug
pub fn get_profile(conn: &Connection, slug: &str) -> Option<Profile> {
    conn.query_row("SELECT * FROM profiles WHERE slug = ?1", params![slug], |row| {
        row_to_profile(row)
    })
    .ok()
}

/// Get a profile by ID
pub fn get_profile_by_id(conn: &Connection, id: &str) -> Option<Profile> {
    conn.query_row("SELECT * FROM profiles WHERE id = ?1", params![id], |row| {
        row_to_profile(row)
    })
    .ok()
}

/// Delete a profile (cannot delete default or active profile)
pub fn delete_profile(conn: &Connection, id: &str) -> Result<(), String> {
    let profile = get_profile_by_id(conn, id).ok_or("Profile not found")?;

    if profile.is_default {
        return Err("Cannot delete default profile".to_string());
    }

    let active = get_active_profile(conn);
    if active.id == id {
        return Err("Cannot delete active profile".to_string());
    }

    conn.execute("DELETE FROM profiles WHERE id = ?1", params![id])
        .map_err(|e| format!("Failed to delete profile: {}", e))?;

    Ok(())
}

// ==================== Active Profile ====================

/// Get the active profile
pub fn get_active_profile(conn: &Connection) -> Profile {
    // Try to get from active_profile table
    if let Ok(slug) = conn.query_row(
        "SELECT profile_slug FROM active_profile WHERE id = 1",
        [],
        |row| row.get::<_, String>(0),
    ) {
        if let Some(profile) = get_profile(conn, &slug) {
            return profile;
        }
    }

    // Fallback to default profile
    if let Ok(profile) = conn.query_row(
        "SELECT * FROM profiles WHERE is_default = 1",
        [],
        |row| row_to_profile(row),
    ) {
        return profile;
    }

    // Last resort: any profile
    if let Ok(profile) = conn.query_row("SELECT * FROM profiles LIMIT 1", [], |row| {
        row_to_profile(row)
    }) {
        return profile;
    }

    // Should not reach here if ensure_default_profile was called
    panic!("No profiles found. Call ensure_default_profile first.");
}

/// Set the active profile
pub fn set_active_profile(conn: &Connection, slug: &str) -> Result<(), String> {
    let profile = get_profile(conn, slug).ok_or(format!("Profile '{}' not found", slug))?;

    conn.execute(
        "INSERT OR REPLACE INTO active_profile (id, profile_slug) VALUES (1, ?1)",
        params![slug],
    )
    .map_err(|e| format!("Failed to set active profile: {}", e))?;

    // Update last_used_at
    conn.execute(
        "UPDATE profiles SET last_used_at = ?1 WHERE id = ?2",
        params![now(), profile.id],
    )
    .map_err(|e| format!("Failed to update last_used_at: {}", e))?;

    Ok(())
}

/// Ensure the default profile exists
pub fn ensure_default_profile(conn: &Connection, user_data_path: Option<&Path>) {
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM profiles WHERE slug = 'default'",
            [],
            |row| row.get::<_, i64>(0),
        )
        .map(|c| c > 0)
        .unwrap_or(false);

    if exists {
        return;
    }

    let id = generate_uuid();
    let timestamp = now();

    let _ = conn.execute(
        "INSERT INTO profiles (id, name, slug, sync_enabled, created_at, last_used_at, is_default) VALUES (?1, 'Default', 'default', 0, ?2, ?3, 1)",
        params![id, timestamp, timestamp],
    );

    // Create profile directory
    if let Some(data_path) = user_data_path {
        let profile_dir = data_path.join("default");
        let _ = std::fs::create_dir_all(profile_dir);
    }
}

/// Migrate existing profile directories to profiles.db
pub fn migrate_existing_profiles(conn: &Connection, user_data_path: &Path) {
    let timestamp = now();

    // Check for 'default' directory
    let default_dir = user_data_path.join("default");
    if default_dir.exists() {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM profiles WHERE slug = 'default'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);

        if !exists {
            let id = generate_uuid();
            let _ = conn.execute(
                "INSERT INTO profiles (id, name, slug, sync_enabled, created_at, last_used_at, is_default) VALUES (?1, 'Default', 'default', 0, ?2, ?3, 1)",
                params![id, timestamp, timestamp],
            );
            println!("[profiles] Migrated existing default profile directory");
        }
    }

    // Check for 'dev' directory
    let dev_dir = user_data_path.join("dev");
    if dev_dir.exists() {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM profiles WHERE slug = 'dev'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);

        if !exists {
            let id = generate_uuid();
            let _ = conn.execute(
                "INSERT INTO profiles (id, name, slug, sync_enabled, created_at, last_used_at, is_default) VALUES (?1, 'Development', 'dev', 0, ?2, ?3, 0)",
                params![id, timestamp, timestamp],
            );
            println!("[profiles] Migrated existing dev profile directory");
        }
    }

    // Ensure at least default profile exists
    ensure_default_profile(conn, Some(user_data_path));
}

// ==================== Sync Configuration ====================

/// Enable sync for a profile
pub fn enable_sync(
    conn: &Connection,
    profile_id: &str,
    api_key: &str,
    server_profile_slug: &str,
) -> Result<(), String> {
    let _profile = get_profile_by_id(conn, profile_id).ok_or("Profile not found")?;

    conn.execute(
        "UPDATE profiles SET sync_enabled = 1, api_key = ?1, server_profile_slug = ?2 WHERE id = ?3",
        params![api_key, server_profile_slug, profile_id],
    )
    .map_err(|e| format!("Failed to enable sync: {}", e))?;

    Ok(())
}

/// Disable sync for a profile
pub fn disable_sync(conn: &Connection, profile_id: &str) -> Result<(), String> {
    conn.execute(
        "UPDATE profiles SET sync_enabled = 0, api_key = NULL, server_profile_slug = NULL, last_sync_at = NULL WHERE id = ?1",
        params![profile_id],
    )
    .map_err(|e| format!("Failed to disable sync: {}", e))?;

    Ok(())
}

/// Get sync configuration for a profile
pub fn get_sync_config(conn: &Connection, profile_id: &str) -> Option<ProfileSyncConfig> {
    let profile = get_profile_by_id(conn, profile_id)?;

    if !profile.sync_enabled {
        return None;
    }

    let api_key = profile.api_key?;
    let server_profile_slug = profile.server_profile_slug?;

    Some(ProfileSyncConfig {
        api_key,
        server_profile_slug,
    })
}

/// Update last sync time for a profile
pub fn update_last_sync_time(
    conn: &Connection,
    profile_id: &str,
    timestamp: i64,
) -> Result<(), String> {
    conn.execute(
        "UPDATE profiles SET last_sync_at = ?1 WHERE id = ?2",
        params![timestamp, profile_id],
    )
    .map_err(|e| format!("Failed to update last_sync_at: {}", e))?;

    Ok(())
}
