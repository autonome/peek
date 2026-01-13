//! Theme management for Tauri backend
//!
//! Handles theme discovery, registration, and settings persistence.
//! Mirrors the Electron implementation in backend/electron/protocol.ts and ipc.ts

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

lazy_static::lazy_static! {
    /// Maps theme IDs to their filesystem paths
    pub static ref THEME_PATHS: Mutex<HashMap<String, PathBuf>> = Mutex::new(HashMap::new());

    /// Currently active theme ID (defaults to "basic")
    pub static ref ACTIVE_THEME_ID: Mutex<String> = Mutex::new("basic".to_string());
}

// Theme settings storage keys (matches Electron's ipc.ts)
const THEME_SETTINGS_KEY: &str = "core";
const THEME_ID_KEY: &str = "theme.id";
const THEME_COLOR_SCHEME_KEY: &str = "theme.colorScheme";

/// Theme manifest structure
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThemeManifest {
    pub id: String,
    pub name: Option<String>,
    pub version: Option<String>,
    pub description: Option<String>,
}

/// Discovered theme with path
#[derive(Debug, Clone)]
pub struct DiscoveredTheme {
    pub id: String,
    pub path: PathBuf,
    pub manifest: ThemeManifest,
}

/// Register a theme path
pub fn register_theme_path(id: &str, path: PathBuf) {
    let mut paths = THEME_PATHS.lock().unwrap();
    paths.insert(id.to_string(), path.clone());
    println!("[tauri:theme] Registered theme path: {} -> {:?}", id, path);
}

/// Get theme filesystem path by ID
pub fn get_theme_path(id: &str) -> Option<PathBuf> {
    let paths = THEME_PATHS.lock().unwrap();
    paths.get(id).cloned()
}

/// Get all registered theme IDs
pub fn get_registered_theme_ids() -> Vec<String> {
    let paths = THEME_PATHS.lock().unwrap();
    paths.keys().cloned().collect()
}

/// Get the active theme ID
pub fn get_active_theme_id() -> String {
    let id = ACTIVE_THEME_ID.lock().unwrap();
    id.clone()
}

/// Set the active theme ID
/// Returns true if successful, false if theme not found
pub fn set_active_theme_id(id: &str) -> bool {
    if get_theme_path(id).is_none() {
        println!("[tauri:theme] Theme not found: {}", id);
        return false;
    }

    let mut active = ACTIVE_THEME_ID.lock().unwrap();
    *active = id.to_string();
    println!("[tauri:theme] Active theme set to: {}", id);
    true
}

/// Discover themes from a directory
pub fn discover_themes(themes_dir: &Path) -> Vec<DiscoveredTheme> {
    let mut themes = Vec::new();

    if !themes_dir.exists() {
        println!("[tauri:theme] Themes directory not found: {:?}", themes_dir);
        return themes;
    }

    let entries = match fs::read_dir(themes_dir) {
        Ok(e) => e,
        Err(e) => {
            println!("[tauri:theme] Failed to read themes directory: {}", e);
            return themes;
        }
    };

    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let manifest_path = path.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }

        match fs::read_to_string(&manifest_path) {
            Ok(content) => match serde_json::from_str::<ThemeManifest>(&content) {
                Ok(manifest) => {
                    let theme_id = manifest.id.clone();

                    // Register the theme path
                    register_theme_path(&theme_id, path.clone());

                    themes.push(DiscoveredTheme {
                        id: theme_id.clone(),
                        path,
                        manifest,
                    });

                    println!("[tauri:theme] Discovered theme: {}", theme_id);
                }
                Err(e) => {
                    println!(
                        "[tauri:theme] Failed to parse manifest at {:?}: {}",
                        manifest_path, e
                    );
                }
            },
            Err(e) => {
                println!(
                    "[tauri:theme] Failed to read manifest at {:?}: {}",
                    manifest_path, e
                );
            }
        }
    }

    themes
}

/// Get theme setting from database
pub fn get_theme_setting(db: &Connection, key: &str) -> Option<String> {
    let result: Result<String, _> = db.query_row(
        "SELECT value FROM extension_settings WHERE extensionId = ? AND key = ?",
        [THEME_SETTINGS_KEY, key],
        |row| row.get(0),
    );

    match result {
        Ok(value) => {
            // Value is JSON-encoded, parse it
            match serde_json::from_str::<String>(&value) {
                Ok(parsed) => Some(parsed),
                Err(_) => Some(value), // Fall back to raw value for backwards compatibility
            }
        }
        Err(_) => None,
    }
}

/// Set theme setting in database
pub fn set_theme_setting(db: &Connection, key: &str, value: &str) -> Result<(), rusqlite::Error> {
    let id = format!("{}_{}", THEME_SETTINGS_KEY, key);
    let json_value = serde_json::to_string(value).unwrap_or_else(|_| value.to_string());
    let timestamp = chrono::Utc::now().timestamp_millis();

    db.execute(
        "INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt) VALUES (?, ?, ?, ?, ?)",
        rusqlite::params![id, THEME_SETTINGS_KEY, key, json_value, timestamp],
    )?;

    Ok(())
}

/// Restore saved theme from database
/// Call this AFTER themes have been discovered/registered
pub fn restore_saved_theme(db: &Connection) {
    if let Some(saved_theme_id) = get_theme_setting(db, THEME_ID_KEY) {
        let success = set_active_theme_id(&saved_theme_id);
        if !success {
            println!(
                "[tauri:theme] Failed to restore theme: {} - theme may not be registered yet",
                saved_theme_id
            );
        }
    }
}

/// Get saved color scheme from database
pub fn get_saved_color_scheme(db: &Connection) -> String {
    get_theme_setting(db, THEME_COLOR_SCHEME_KEY).unwrap_or_else(|| "system".to_string())
}

/// Set color scheme in database
pub fn set_color_scheme(db: &Connection, scheme: &str) -> Result<(), rusqlite::Error> {
    set_theme_setting(db, THEME_COLOR_SCHEME_KEY, scheme)
}

/// Set theme ID in database
pub fn set_theme_id(db: &Connection, theme_id: &str) -> Result<(), rusqlite::Error> {
    set_theme_setting(db, THEME_ID_KEY, theme_id)
}
