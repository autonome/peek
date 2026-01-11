//! Application state management

use crate::extensions::ExtensionManifest;
use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;

/// Window information stored in registry
#[derive(Debug, Clone)]
pub struct WindowInfo {
    pub label: String,
    pub source: String,
    pub url: String,
    pub created_at: i64,
}

/// Command registered by an extension or feature
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegisteredCommand {
    pub name: String,
    pub description: String,
    pub source: String,
}

/// Loaded extension info
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LoadedExtension {
    pub id: String,
    pub manifest: ExtensionManifest,
    pub window_label: String,
}

/// Registered shortcut info
#[derive(Debug, Clone)]
pub struct RegisteredShortcut {
    /// Original shortcut string from JS (e.g., "Option+Space")
    pub original: String,
    /// Tauri-compatible shortcut string (e.g., "Alt+Space")
    pub tauri_format: String,
    /// Source window that registered it
    pub source: String,
}

/// Application state shared across all commands
pub struct AppState {
    /// SQLite database connection (mutex for thread safety)
    pub db: Mutex<Connection>,

    /// Current profile name (dev, default, etc.)
    pub profile: String,

    /// Profile data directory
    pub profile_dir: PathBuf,

    /// Window registry - tracks all open windows
    pub windows: Mutex<HashMap<String, WindowInfo>>,

    /// Headless mode - no visible windows (for testing)
    pub headless: bool,

    /// Registered commands from extensions/features
    pub commands: Mutex<HashMap<String, RegisteredCommand>>,

    /// Loaded extensions
    pub extensions: Mutex<HashMap<String, LoadedExtension>>,

    /// Registered global shortcuts - maps tauri_format to shortcut info
    pub shortcuts: Mutex<HashMap<String, RegisteredShortcut>>,
}

impl AppState {
    pub fn new(db: Connection, profile: String, profile_dir: PathBuf, headless: bool) -> Self {
        Self {
            db: Mutex::new(db),
            profile,
            profile_dir,
            windows: Mutex::new(HashMap::new()),
            headless,
            commands: Mutex::new(HashMap::new()),
            extensions: Mutex::new(HashMap::new()),
            shortcuts: Mutex::new(HashMap::new()),
        }
    }

    /// Register a shortcut mapping
    pub fn register_shortcut(&self, original: &str, tauri_format: &str, source: &str) {
        let mut shortcuts = self.shortcuts.lock().unwrap();
        shortcuts.insert(
            tauri_format.to_string(),
            RegisteredShortcut {
                original: original.to_string(),
                tauri_format: tauri_format.to_string(),
                source: source.to_string(),
            },
        );
    }

    /// Unregister a shortcut
    pub fn unregister_shortcut(&self, tauri_format: &str) {
        let mut shortcuts = self.shortcuts.lock().unwrap();
        shortcuts.remove(tauri_format);
    }

    /// Find shortcut by tauri format, returns original name
    pub fn find_shortcut(&self, tauri_format: &str) -> Option<RegisteredShortcut> {
        let shortcuts = self.shortcuts.lock().unwrap();
        shortcuts.get(tauri_format).cloned()
    }

    /// Register a loaded extension
    pub fn register_extension(&self, id: &str, manifest: ExtensionManifest, window_label: &str) {
        let mut extensions = self.extensions.lock().unwrap();
        extensions.insert(
            id.to_string(),
            LoadedExtension {
                id: id.to_string(),
                manifest,
                window_label: window_label.to_string(),
            },
        );
    }

    /// Get all loaded extensions
    pub fn list_extensions(&self) -> Vec<LoadedExtension> {
        let extensions = self.extensions.lock().unwrap();
        extensions.values().cloned().collect()
    }

    /// Register a command
    pub fn register_command(&self, name: &str, description: &str, source: &str) {
        let mut commands = self.commands.lock().unwrap();
        commands.insert(
            name.to_string(),
            RegisteredCommand {
                name: name.to_string(),
                description: description.to_string(),
                source: source.to_string(),
            },
        );
    }

    /// Unregister a command
    pub fn unregister_command(&self, name: &str) {
        let mut commands = self.commands.lock().unwrap();
        commands.remove(name);
    }

    /// Get all registered commands
    pub fn get_all_commands(&self) -> Vec<RegisteredCommand> {
        let commands = self.commands.lock().unwrap();
        commands.values().cloned().collect()
    }

    /// Register a window in the registry
    pub fn register_window(&self, label: &str, source: &str, url: &str) {
        let mut windows = self.windows.lock().unwrap();
        windows.insert(
            label.to_string(),
            WindowInfo {
                label: label.to_string(),
                source: source.to_string(),
                url: url.to_string(),
                created_at: chrono::Utc::now().timestamp_millis(),
            },
        );
    }

    /// Unregister a window from the registry
    pub fn unregister_window(&self, label: &str) {
        let mut windows = self.windows.lock().unwrap();
        windows.remove(label);
    }

    /// Get all registered windows
    pub fn list_windows(&self) -> Vec<WindowInfo> {
        let windows = self.windows.lock().unwrap();
        windows.values().cloned().collect()
    }
}
