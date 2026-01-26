//! Tauri command handlers
//!
//! These commands mirror the Electron IPC handlers in backend/electron/ipc.ts

pub mod datastore;
pub mod extensions;
pub mod sync;
pub mod theme;
pub mod window;

use serde::Serialize;

/// Standard response format matching Electron's { success, data?, error? }
#[derive(Debug, Serialize)]
pub struct CommandResponse<T> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T> CommandResponse<T> {
    pub fn success(data: T) -> Self {
        Self {
            success: true,
            data: Some(data),
            error: None,
        }
    }

    pub fn error(message: impl Into<String>) -> Self {
        Self {
            success: false,
            data: None,
            error: Some(message.into()),
        }
    }
}

use crate::state::{AppState, LoadedExtension, RegisteredCommand};
use std::sync::Arc;
use tauri::{AppHandle, Emitter};

/// Log message command - forwards renderer logs to stdout
#[tauri::command]
pub fn log_message(source: String, args: Vec<serde_json::Value>) {
    let formatted_args: Vec<String> = args
        .iter()
        .map(|v| match v {
            serde_json::Value::String(s) => s.clone(),
            _ => v.to_string(),
        })
        .collect();

    println!("[{}] {}", source, formatted_args.join(" "));
}

/// Register a command from a renderer
#[tauri::command]
pub async fn commands_register(
    state: tauri::State<'_, Arc<AppState>>,
    name: String,
    description: String,
    source: String,
) -> Result<CommandResponse<bool>, String> {
    state.register_command(&name, &description, &source);
    println!("[tauri:cmd] Registered command: {} from {}", name, source);
    Ok(CommandResponse::success(true))
}

/// Unregister a command
#[tauri::command]
pub async fn commands_unregister(
    state: tauri::State<'_, Arc<AppState>>,
    name: String,
) -> Result<CommandResponse<bool>, String> {
    state.unregister_command(&name);
    println!("[tauri:cmd] Unregistered command: {}", name);
    Ok(CommandResponse::success(true))
}

/// Get all registered commands
#[tauri::command]
pub async fn commands_get_all(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<Vec<RegisteredCommand>, String> {
    Ok(state.get_all_commands())
}

/// List all loaded extensions
#[tauri::command]
pub async fn extensions_list(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CommandResponse<Vec<LoadedExtension>>, String> {
    let extensions = state.list_extensions();
    Ok(CommandResponse::success(extensions))
}

/// Quit the application
#[tauri::command]
pub async fn app_quit(app: AppHandle) -> Result<(), String> {
    println!("[tauri] Quit requested");
    app.exit(0);
    Ok(())
}

/// Restart the application
#[tauri::command]
pub async fn app_restart(app: AppHandle) -> Result<(), String> {
    println!("[tauri] Restart requested");
    app.restart();
    Ok(())
}

/// Register a global shortcut (desktop only)
#[cfg(desktop)]
#[tauri::command]
pub async fn shortcut_register(
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    shortcut: String,
    source: String,
) -> Result<CommandResponse<bool>, String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    // Convert Electron-style shortcuts to Tauri format
    let tauri_shortcut = shortcut
        .replace("CommandOrControl", "CmdOrCtrl")
        .replace("Command", "Cmd")
        .replace("Control", "Ctrl")
        .replace("Option", "Alt");

    println!(
        "[tauri:shortcut] Registering: {} -> {} from {}",
        shortcut, tauri_shortcut, source
    );

    let parsed: Shortcut = match tauri_shortcut.parse() {
        Ok(s) => s,
        Err(e) => {
            println!("[tauri:shortcut] Failed to parse {}: {}", tauri_shortcut, e);
            return Ok(CommandResponse::error(format!("Invalid shortcut: {}", e)));
        }
    };

    // Register the shortcut with Tauri
    if let Err(e) = app.global_shortcut().register(parsed.clone()) {
        println!("[tauri:shortcut] Failed to register {}: {}", shortcut, e);
        return Ok(CommandResponse::error(format!("Failed to register: {}", e)));
    }

    // Store the mapping so the global handler can look it up
    // Use the parsed shortcut's string representation as the key
    let tauri_key = parsed.to_string();
    state.register_shortcut(&shortcut, &tauri_key, &source);

    println!("[tauri:shortcut] Registered: {} (key: {})", shortcut, tauri_key);
    Ok(CommandResponse::success(true))
}

/// Register a global shortcut - mobile stub (no global shortcuts on mobile)
#[cfg(mobile)]
#[tauri::command]
pub async fn shortcut_register(
    _app: AppHandle,
    _state: tauri::State<'_, Arc<AppState>>,
    _shortcut: String,
    _source: String,
) -> Result<CommandResponse<bool>, String> {
    // Global shortcuts not supported on mobile
    Ok(CommandResponse::success(true))
}

/// Unregister a global shortcut (desktop only)
#[cfg(desktop)]
#[tauri::command]
pub async fn shortcut_unregister(
    app: AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    shortcut: String,
) -> Result<CommandResponse<bool>, String> {
    use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut};

    let tauri_shortcut = shortcut
        .replace("CommandOrControl", "CmdOrCtrl")
        .replace("Command", "Cmd")
        .replace("Control", "Ctrl")
        .replace("Option", "Alt");

    let parsed: Shortcut = match tauri_shortcut.parse() {
        Ok(s) => s,
        Err(e) => {
            return Ok(CommandResponse::error(format!("Invalid shortcut: {}", e)));
        }
    };

    let tauri_key = parsed.to_string();

    match app.global_shortcut().unregister(parsed) {
        Ok(_) => {
            state.unregister_shortcut(&tauri_key);
            println!("[tauri:shortcut] Unregistered: {}", shortcut);
            Ok(CommandResponse::success(true))
        }
        Err(e) => {
            println!("[tauri:shortcut] Failed to unregister {}: {}", shortcut, e);
            Ok(CommandResponse::error(format!("Failed to unregister: {}", e)))
        }
    }
}

/// Unregister a global shortcut - mobile stub
#[cfg(mobile)]
#[tauri::command]
pub async fn shortcut_unregister(
    _app: AppHandle,
    _state: tauri::State<'_, Arc<AppState>>,
    _shortcut: String,
) -> Result<CommandResponse<bool>, String> {
    // Global shortcuts not supported on mobile
    Ok(CommandResponse::success(true))
}
