//! Extension discovery and loading
//!
//! Discovers and loads extensions from the extensions/ directory.

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};

/// Extension settings schema
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct SettingsSchema {
    #[serde(default)]
    pub prefs: Option<serde_json::Value>,
    #[serde(default)]
    pub item: Option<serde_json::Value>,
    #[serde(default)]
    pub storage_keys: Option<serde_json::Value>,
    #[serde(default)]
    pub defaults: Option<serde_json::Value>,
}

/// Extension manifest
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionManifest {
    pub id: Option<String>,
    pub shortname: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub version: Option<String>,
    pub background: Option<String>,
    pub settings_schema: Option<String>,
    #[serde(default)]
    pub builtin: bool,
    /// Loaded settings schema (from settings-schema.json or settingsSchema reference)
    #[serde(default)]
    pub schemas: Option<serde_json::Value>,
    #[serde(default)]
    pub storage_keys: Option<serde_json::Value>,
    #[serde(default)]
    pub defaults: Option<serde_json::Value>,
}

/// Discovered extension
#[derive(Debug, Clone)]
pub struct DiscoveredExtension {
    pub id: String,
    pub path: PathBuf,
    pub manifest: ExtensionManifest,
}

/// Discover extensions in a directory
pub fn discover_extensions(base_path: &Path) -> Vec<DiscoveredExtension> {
    let mut extensions = Vec::new();

    if !base_path.exists() {
        return extensions;
    }

    let entries = match fs::read_dir(base_path) {
        Ok(e) => e,
        Err(_) => return extensions,
    };

    for entry in entries.flatten() {
        let ext_path = entry.path();
        if !ext_path.is_dir() {
            continue;
        }

        let manifest_path = ext_path.join("manifest.json");
        if !manifest_path.exists() {
            continue;
        }

        match load_manifest(&manifest_path) {
            Ok(mut manifest) => {
                let id = manifest
                    .id
                    .clone()
                    .or_else(|| manifest.shortname.clone())
                    .unwrap_or_else(|| {
                        entry.file_name().to_string_lossy().to_string()
                    });

                // Load settings schema if specified
                if let Some(schema_path) = &manifest.settings_schema {
                    let schema_file = ext_path.join(schema_path.trim_start_matches("./"));
                    if let Ok(schema) = load_settings_schema(&schema_file) {
                        manifest.schemas = schema.get("prefs").cloned().map(|prefs| {
                            let mut schemas = serde_json::Map::new();
                            schemas.insert("prefs".to_string(), prefs);
                            if let Some(item) = schema.get("item") {
                                schemas.insert("item".to_string(), item.clone());
                            }
                            serde_json::Value::Object(schemas)
                        });
                        manifest.storage_keys = schema.get("storageKeys").cloned();
                        manifest.defaults = schema.get("defaults").cloned();
                    }
                }

                extensions.push(DiscoveredExtension {
                    id,
                    path: ext_path,
                    manifest,
                });
            }
            Err(e) => {
                eprintln!(
                    "[tauri:ext] Failed to load manifest for {:?}: {}",
                    ext_path, e
                );
            }
        }
    }

    extensions
}

fn load_manifest(path: &Path) -> Result<ExtensionManifest, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read manifest: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse manifest: {}", e))
}

fn load_settings_schema(path: &Path) -> Result<serde_json::Value, String> {
    let content = fs::read_to_string(path)
        .map_err(|e| format!("Failed to read settings schema: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse settings schema: {}", e))
}

/// Check if an extension is enabled in the database
pub fn is_extension_enabled(
    db: &rusqlite::Connection,
    ext_id: &str,
    is_builtin: bool,
) -> bool {
    // Query extension_settings for enabled state
    let result: Result<Option<String>, _> = db.query_row(
        "SELECT value FROM extension_settings WHERE extensionId = ? AND key = 'enabled'",
        rusqlite::params![ext_id],
        |row| row.get(0),
    );

    match result {
        Ok(Some(value)) => {
            // Parse JSON boolean
            value.trim() != "false"
        }
        Ok(None) | Err(_) => {
            // Default: builtins enabled, others disabled
            is_builtin
        }
    }
}
