//! Application state management

use rusqlite::Connection;
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
}

impl AppState {
    pub fn new(db: Connection, profile: String, profile_dir: PathBuf, headless: bool) -> Self {
        Self {
            db: Mutex::new(db),
            profile,
            profile_dir,
            windows: Mutex::new(HashMap::new()),
            headless,
        }
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
