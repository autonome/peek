//! Peek Tauri Backend
//!
//! This is the Tauri backend for Peek, providing window management,
//! SQLite datastore, and custom protocol handling.

mod commands;
mod datastore;
mod protocol;
mod state;

use state::AppState;
use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// The preload script that provides window.app API
/// This is injected into all windows to match Electron's preload behavior
pub const PRELOAD_SCRIPT: &str = include_str!("../../preload.js");

/// Initialize and run the Tauri application
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Check for headless mode (for testing)
            let headless = std::env::var("HEADLESS").is_ok();
            if headless {
                println!("[tauri] Running in HEADLESS mode - no visible windows");
            }

            // Determine profile based on environment
            let profile = std::env::var("PROFILE").unwrap_or_else(|_| {
                if cfg!(debug_assertions) {
                    "dev".to_string()
                } else {
                    "default".to_string()
                }
            });

            // Set up data directory
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");
            let profile_dir = app_data_dir.join(&profile);
            std::fs::create_dir_all(&profile_dir).expect("Failed to create profile directory");

            // Initialize database
            let db_path = profile_dir.join("datastore.sqlite");
            println!("[tauri] Initializing database at: {:?}", db_path);

            let db = datastore::init_database(&db_path).expect("Failed to initialize database");

            // Create app state
            let state = AppState::new(db, profile, profile_dir, headless);
            app.manage(Arc::new(state));

            // Create main window programmatically with preload script injection
            let main_url = WebviewUrl::CustomProtocol(
                "peek://app/background.html"
                    .parse()
                    .expect("Invalid main URL"),
            );

            let main_window = WebviewWindowBuilder::new(app, "main", main_url)
                .title("Peek (Tauri)")
                .inner_size(800.0, 600.0)
                .visible(false)
                .initialization_script(PRELOAD_SCRIPT)
                .build()
                .expect("Failed to create main window");

            // DevTools can be opened via keyboard shortcut or menu
            // Set PEEK_DEVTOOLS=1 to auto-open devtools on startup
            #[cfg(debug_assertions)]
            if std::env::var("PEEK_DEVTOOLS").is_ok() {
                main_window.open_devtools();
                println!("[tauri] DevTools opened for main window");
            }

            println!("[tauri] App setup complete");

            Ok(())
        })
        .register_asynchronous_uri_scheme_protocol("peek", protocol::handle_peek_protocol)
        .invoke_handler(tauri::generate_handler![
            // Window commands
            commands::window::window_open,
            commands::window::window_close,
            commands::window::window_hide,
            commands::window::window_show,
            commands::window::window_focus,
            commands::window::window_list,
            // Datastore commands
            commands::datastore::datastore_add_address,
            commands::datastore::datastore_get_address,
            commands::datastore::datastore_update_address,
            commands::datastore::datastore_query_addresses,
            commands::datastore::datastore_add_visit,
            commands::datastore::datastore_query_visits,
            commands::datastore::datastore_get_or_create_tag,
            commands::datastore::datastore_tag_address,
            commands::datastore::datastore_untag_address,
            commands::datastore::datastore_get_address_tags,
            commands::datastore::datastore_get_table,
            commands::datastore::datastore_set_row,
            commands::datastore::datastore_get_stats,
            // Utility commands
            commands::log_message,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
