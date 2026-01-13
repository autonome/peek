//! Theme management commands

use super::CommandResponse;
use crate::state::AppState;
use crate::theme::{
    get_active_theme_id, get_registered_theme_ids, get_saved_color_scheme, get_theme_path,
    set_active_theme_id, set_color_scheme, set_theme_id, ThemeManifest,
};
use serde::Serialize;
use std::fs;
use std::sync::Arc;
use tauri::{Emitter, Manager};

/// Theme info returned by list command
#[derive(Debug, Serialize)]
pub struct ThemeInfo {
    pub id: String,
    pub name: String,
    pub version: String,
}

/// Theme state returned by get command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ThemeState {
    pub theme_id: String,
    pub color_scheme: String,
    pub is_dark: bool,
    pub effective_scheme: String,
}

/// Get current theme state
#[tauri::command]
pub async fn theme_get(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<ThemeState, String> {
    let db = state.db.lock().unwrap();
    let theme_id = get_active_theme_id();
    let color_scheme = get_saved_color_scheme(&db);

    // Determine effective dark mode
    // For now, assume system means dark (could be improved with actual OS detection)
    let is_dark = color_scheme == "dark" || color_scheme == "system";
    let effective_scheme = if color_scheme == "system" {
        if is_dark { "dark" } else { "light" }.to_string()
    } else {
        color_scheme.clone()
    };

    Ok(ThemeState {
        theme_id,
        color_scheme,
        is_dark,
        effective_scheme,
    })
}

/// Set active theme
#[tauri::command]
pub async fn theme_set_theme(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    theme_id: String,
) -> Result<CommandResponse<String>, String> {
    // Validate theme exists
    if !set_active_theme_id(&theme_id) {
        return Ok(CommandResponse::error(format!("Theme not found: {}", theme_id)));
    }

    // Save to database
    {
        let db = state.db.lock().unwrap();
        if let Err(e) = set_theme_id(&db, &theme_id) {
            return Ok(CommandResponse::error(format!("Failed to save theme: {}", e)));
        }
    }

    // Broadcast to all windows to reload their CSS
    let _ = app.emit("theme:themeChanged", serde_json::json!({ "themeId": theme_id }));

    Ok(CommandResponse::success(theme_id))
}

/// Set color scheme preference (system/light/dark)
#[tauri::command]
pub async fn theme_set_color_scheme(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    color_scheme: String,
) -> Result<CommandResponse<String>, String> {
    if !["system", "light", "dark"].contains(&color_scheme.as_str()) {
        return Ok(CommandResponse::error("Invalid color scheme"));
    }

    // Save to database
    {
        let db = state.db.lock().unwrap();
        if let Err(e) = set_color_scheme(&db, &color_scheme) {
            return Ok(CommandResponse::error(format!("Failed to save color scheme: {}", e)));
        }
    }

    // Broadcast to all windows
    let _ = app.emit("theme:changed", serde_json::json!({ "colorScheme": color_scheme }));

    Ok(CommandResponse::success(color_scheme))
}

/// List available themes
#[tauri::command]
pub async fn theme_list() -> Result<CommandResponse<Vec<ThemeInfo>>, String> {
    let theme_ids = get_registered_theme_ids();
    let mut themes = Vec::new();

    for id in theme_ids {
        if let Some(theme_path) = get_theme_path(&id) {
            let manifest_path = theme_path.join("manifest.json");
            if manifest_path.exists() {
                if let Ok(content) = fs::read_to_string(&manifest_path) {
                    if let Ok(manifest) = serde_json::from_str::<ThemeManifest>(&content) {
                        themes.push(ThemeInfo {
                            id: manifest.id,
                            name: manifest.name.unwrap_or_else(|| id.clone()),
                            version: manifest.version.unwrap_or_else(|| "1.0.0".to_string()),
                        });
                    }
                }
            }
        }
    }

    Ok(CommandResponse::success(themes))
}
