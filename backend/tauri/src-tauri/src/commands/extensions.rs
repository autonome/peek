//! Extension management commands

use super::CommandResponse;
use crate::extensions::{discover_extensions, ExtensionManifest};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use tauri_plugin_dialog::DialogExt;

/// Result from folder picker
#[derive(Debug, Serialize)]
pub struct PickFolderResult {
    pub path: String,
}

/// Validation result - matches Electron format
#[derive(Debug, Serialize)]
pub struct ValidateFolderResult {
    pub manifest: ExtensionManifest,
    pub path: String,
}

/// Extension data from database
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionData {
    pub id: String,
    pub path: Option<String>,
    pub enabled: bool,
    pub builtin: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub manifest: Option<ExtensionManifest>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_error_at: Option<i64>,
}

/// Pick a folder using native dialog
#[tauri::command]
pub async fn extension_pick_folder(
    app: tauri::AppHandle,
) -> Result<CommandResponse<PickFolderResult>, String> {
    use tauri_plugin_dialog::FileDialogBuilder;

    let (tx, rx) = std::sync::mpsc::channel();

    app.dialog()
        .file()
        .pick_folder(move |folder_path| {
            let _ = tx.send(folder_path);
        });

    match rx.recv() {
        Ok(Some(path)) => Ok(CommandResponse::success(PickFolderResult {
            path: path.to_string(),
        })),
        Ok(None) => Ok(CommandResponse {
            success: true,
            data: None,
            error: Some("Canceled".to_string()),
        }),
        Err(_) => Ok(CommandResponse::error("Dialog error")),
    }
}

/// Validate an extension folder - matches Electron behavior
#[tauri::command]
pub async fn extension_validate_folder(
    folder_path: String,
) -> Result<CommandResponse<ValidateFolderResult>, String> {
    let path = PathBuf::from(&folder_path);
    let manifest_path = path.join("manifest.json");

    if !manifest_path.exists() {
        return Ok(CommandResponse::error("No manifest.json found in folder"));
    }

    let content = match fs::read_to_string(&manifest_path) {
        Ok(c) => c,
        Err(e) => {
            return Ok(CommandResponse::error(format!("Failed to read manifest: {}", e)));
        }
    };

    match serde_json::from_str::<ExtensionManifest>(&content) {
        Ok(manifest) => {
            // Validate required fields
            if manifest.id.is_none() && manifest.shortname.is_none() && manifest.name.is_none() {
                return Ok(CommandResponse::error("Manifest must have id, shortname, or name"));
            }

            // Check for background.html
            let background_path = path.join("background.html");
            if !background_path.exists() {
                return Ok(CommandResponse::error("No background.html found in folder"));
            }

            Ok(CommandResponse::success(ValidateFolderResult {
                manifest,
                path: folder_path,
            }))
        }
        Err(e) => Ok(CommandResponse::error(format!("Invalid JSON: {}", e))),
    }
}

/// Add an extension to the database
#[tauri::command]
pub async fn extension_add(
    state: tauri::State<'_, Arc<AppState>>,
    folder_path: String,
    manifest: Option<ExtensionManifest>,
    enabled: bool,
    last_error: Option<String>,
) -> Result<CommandResponse<ExtensionData>, String> {
    let id = manifest
        .as_ref()
        .and_then(|m| m.id.clone().or_else(|| m.shortname.clone()))
        .unwrap_or_else(|| {
            PathBuf::from(&folder_path)
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_else(|| uuid::Uuid::new_v4().to_string())
        });

    let db = state.db.lock().unwrap();

    // Extract manifest fields
    let name = manifest.as_ref().and_then(|m| m.name.clone()).unwrap_or_else(|| id.clone());
    let description = manifest.as_ref().and_then(|m| m.description.clone()).unwrap_or_default();
    let version = manifest.as_ref().and_then(|m| m.version.clone()).unwrap_or_else(|| "1.0.0".to_string());
    let background = manifest.as_ref().and_then(|m| m.background.clone()).unwrap_or_else(|| "background.html".to_string());
    let now = chrono::Utc::now().timestamp_millis();
    let error_text = last_error.clone().unwrap_or_default();
    let error_at = if last_error.is_some() { now } else { 0 };

    // Insert into extensions table
    let result = db.execute(
        "INSERT OR REPLACE INTO extensions (id, name, description, version, path, backgroundUrl, builtin, enabled, status, installedAt, updatedAt, lastError, lastErrorAt) VALUES (?, ?, ?, ?, ?, ?, 0, ?, 'installed', ?, ?, ?, ?)",
        rusqlite::params![
            id,
            name,
            description,
            version,
            folder_path,
            background,
            if enabled { 1 } else { 0 },
            now,
            now,
            error_text,
            error_at
        ],
    );

    match result {
        Ok(_) => {
            println!(
                "[tauri:ext] Added extension: {} from {}",
                id, folder_path
            );
            Ok(CommandResponse::success(ExtensionData {
                id,
                path: Some(folder_path),
                enabled,
                builtin: false,
                manifest,
                last_error: if error_text.is_empty() { None } else { Some(error_text) },
                last_error_at: if error_at > 0 { Some(error_at) } else { None },
            }))
        }
        Err(e) => Ok(CommandResponse::error(format!(
            "Failed to add extension: {}",
            e
        ))),
    }
}

/// Remove an extension from the database
#[tauri::command]
pub async fn extension_remove(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();

    let result = db.execute("DELETE FROM extensions WHERE id = ?", rusqlite::params![id]);

    match result {
        Ok(rows) => {
            if rows > 0 {
                println!("[tauri:ext] Removed extension: {}", id);
                Ok(CommandResponse::success(true))
            } else {
                Ok(CommandResponse::error("Extension not found"))
            }
        }
        Err(e) => Ok(CommandResponse::error(format!(
            "Failed to remove extension: {}",
            e
        ))),
    }
}

/// Update extension data
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtensionUpdates {
    pub enabled: Option<i32>,
    pub path: Option<String>,
    pub status: Option<String>,
    pub last_error: Option<String>,
    pub last_error_at: Option<i64>,
}

#[tauri::command]
pub async fn extension_update(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
    updates: ExtensionUpdates,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();

    // Build dynamic update
    let mut set_clauses = Vec::new();
    let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

    if let Some(enabled) = updates.enabled {
        set_clauses.push("enabled = ?");
        params.push(Box::new(enabled));
    }

    if let Some(path) = updates.path {
        set_clauses.push("path = ?");
        params.push(Box::new(path));
    }

    if let Some(status) = updates.status {
        set_clauses.push("status = ?");
        params.push(Box::new(status));
    }

    if let Some(last_error) = updates.last_error {
        set_clauses.push("lastError = ?");
        params.push(Box::new(last_error));
    }

    if let Some(last_error_at) = updates.last_error_at {
        set_clauses.push("lastErrorAt = ?");
        params.push(Box::new(last_error_at));
    }

    if set_clauses.is_empty() {
        return Ok(CommandResponse::success(true));
    }

    // Always update updatedAt
    set_clauses.push("updatedAt = ?");
    params.push(Box::new(chrono::Utc::now().timestamp_millis()));

    let sql = format!(
        "UPDATE extensions SET {} WHERE id = ?",
        set_clauses.join(", ")
    );
    params.push(Box::new(id.clone()));

    let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    match db.execute(&sql, param_refs.as_slice()) {
        Ok(_) => {
            println!("[tauri:ext] Updated extension: {}", id);
            Ok(CommandResponse::success(true))
        }
        Err(e) => Ok(CommandResponse::error(format!(
            "Failed to update extension: {}",
            e
        ))),
    }
}

/// Get all extensions from database
#[tauri::command]
pub async fn extension_get_all(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CommandResponse<Vec<ExtensionData>>, String> {
    let db = state.db.lock().unwrap();

    let mut stmt = db
        .prepare("SELECT id, name, description, version, path, backgroundUrl, builtin, enabled, lastError, lastErrorAt FROM extensions")
        .map_err(|e| format!("Query error: {}", e))?;

    let extensions = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let name: Option<String> = row.get(1)?;
            let description: Option<String> = row.get(2)?;
            let version: Option<String> = row.get(3)?;
            let path: Option<String> = row.get(4)?;
            let background: Option<String> = row.get(5)?;
            let builtin: i32 = row.get(6)?;
            let enabled: i32 = row.get(7)?;
            let last_error: Option<String> = row.get(8)?;
            let last_error_at: Option<i64> = row.get(9)?;

            // Reconstruct manifest from stored fields
            let manifest = Some(ExtensionManifest {
                id: Some(id.clone()),
                shortname: None,
                name,
                description,
                version,
                background,
                settings_schema: None,
                builtin: builtin == 1,
                schemas: None,
                storage_keys: None,
                defaults: None,
            });

            // Only return lastError if it's not empty
            let error = last_error.filter(|e| !e.is_empty());

            Ok(ExtensionData {
                id,
                path,
                enabled: enabled == 1,
                builtin: builtin == 1,
                manifest,
                last_error: error,
                last_error_at,
            })
        })
        .map_err(|e| format!("Query error: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(CommandResponse::success(extensions))
}

/// Get single extension
#[tauri::command]
pub async fn extension_get(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<CommandResponse<ExtensionData>, String> {
    let db = state.db.lock().unwrap();

    let result = db.query_row(
        "SELECT id, name, description, version, path, backgroundUrl, builtin, enabled, lastError, lastErrorAt FROM extensions WHERE id = ?",
        rusqlite::params![id],
        |row| {
            let id: String = row.get(0)?;
            let name: Option<String> = row.get(1)?;
            let description: Option<String> = row.get(2)?;
            let version: Option<String> = row.get(3)?;
            let path: Option<String> = row.get(4)?;
            let background: Option<String> = row.get(5)?;
            let builtin: i32 = row.get(6)?;
            let enabled: i32 = row.get(7)?;
            let last_error: Option<String> = row.get(8)?;
            let last_error_at: Option<i64> = row.get(9)?;

            let manifest = Some(ExtensionManifest {
                id: Some(id.clone()),
                shortname: None,
                name,
                description,
                version,
                background,
                settings_schema: None,
                builtin: builtin == 1,
                schemas: None,
                storage_keys: None,
                defaults: None,
            });

            // Only return lastError if it's not empty
            let error = last_error.filter(|e| !e.is_empty());

            Ok(ExtensionData {
                id,
                path,
                enabled: enabled == 1,
                builtin: builtin == 1,
                manifest,
                last_error: error,
                last_error_at,
            })
        },
    );

    match result {
        Ok(ext) => Ok(CommandResponse::success(ext)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(CommandResponse::error("Not found")),
        Err(e) => Ok(CommandResponse::error(format!("Query error: {}", e))),
    }
}
