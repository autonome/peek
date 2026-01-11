//! Peek Tauri Backend
//!
//! This is the Tauri backend for Peek, providing window management,
//! SQLite datastore, and custom protocol handling.

mod commands;
mod datastore;
mod extensions;
mod protocol;
mod state;

use state::AppState;
use std::sync::Arc;
use tauri::{ActivationPolicy, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

/// The preload script that provides window.app API
/// This is injected into all windows to match Electron's preload behavior
pub const PRELOAD_SCRIPT: &str = include_str!("../../preload.js");

/// Initialize and run the Tauri application
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Initialize global shortcut plugin with a handler that emits events
            // This must be done in setup, not with .plugin(), to properly handle all shortcuts
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

                let app_handle = app.handle().clone();
                app.handle().plugin(
                    tauri_plugin_global_shortcut::Builder::new()
                        .with_handler(move |app, shortcut, event| {
                            if event.state == ShortcutState::Pressed {
                                // Get the shortcut as a string for lookup
                                let shortcut_str = shortcut.to_string();

                                // Look up the original shortcut name from state
                                if let Some(state) = app.try_state::<Arc<AppState>>() {
                                    if let Some(info) = state.find_shortcut(&shortcut_str) {
                                        // Check for quit shortcut
                                        if info.original.to_lowercase() == "option+q" || info.original.to_lowercase() == "alt+q" {
                                            println!("[tauri:shortcut] Quit shortcut triggered, exiting...");
                                            app.exit(0);
                                            return;
                                        }

                                        // Check for ESC shortcut - close focused window
                                        if info.original.to_lowercase() == "escape" {
                                            println!("[tauri:shortcut] ESC triggered, closing focused window...");
                                            // Find the focused window by iterating through all webview windows
                                            for (label, window) in app.webview_windows() {
                                                if window.is_focused().unwrap_or(false) {
                                                    // Don't close the main background window or extension backgrounds
                                                    if label != "main" && !label.starts_with("ext_") {
                                                        println!("[tauri:shortcut] Closing focused window: {}", label);
                                                        let _ = window.close();
                                                    } else {
                                                        println!("[tauri:shortcut] Skipping background window: {}", label);
                                                    }
                                                    break;
                                                }
                                            }
                                            return;
                                        }

                                        // Emit with original name, replacing + with _ for valid event name
                                        let safe_name = info.original.replace('+', "_");
                                        let event_name = format!("shortcut:{}", safe_name);

                                        println!(
                                            "[tauri:shortcut] Triggered: {} (original: {}) - emitting: {}",
                                            shortcut_str, info.original, event_name
                                        );

                                        if let Err(e) = app.emit(
                                            &event_name,
                                            serde_json::json!({
                                                "shortcut": info.original,
                                                "source": info.source
                                            }),
                                        ) {
                                            println!("[tauri:shortcut] Emit failed: {}", e);
                                        }
                                    } else {
                                        println!(
                                            "[tauri:shortcut] No mapping found for: {}",
                                            shortcut_str
                                        );
                                    }
                                }
                            }
                        })
                        .build(),
                )?;

            }

            // Check for headless mode (for testing)
            // HEADLESS=1 means headless, empty or unset means visible
            let headless = std::env::var("HEADLESS").map(|v| !v.is_empty()).unwrap_or(false);
            if headless {
                println!("[tauri] Running in HEADLESS mode - no visible windows");
                // Prevent app from appearing in Dock and stealing focus
                #[cfg(target_os = "macos")]
                app.set_activation_policy(ActivationPolicy::Accessory);
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
            let state_arc = Arc::new(state);
            app.manage(state_arc.clone());

            // Register system shortcuts at startup
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;

                // Quit shortcut (Option+Q)
                let quit_shortcut = "Alt+Q";
                if let Ok(parsed) = quit_shortcut.parse::<tauri_plugin_global_shortcut::Shortcut>() {
                    if app.global_shortcut().register(parsed.clone()).is_ok() {
                        let tauri_key = parsed.to_string();
                        state_arc.register_shortcut("Option+q", &tauri_key, "system");
                        println!("[tauri] Registered quit shortcut: Option+Q (key: {})", tauri_key);
                    }
                }

                // ESC shortcut to close focused window
                let esc_shortcut = "Escape";
                if let Ok(parsed) = esc_shortcut.parse::<tauri_plugin_global_shortcut::Shortcut>() {
                    if app.global_shortcut().register(parsed.clone()).is_ok() {
                        let tauri_key = parsed.to_string();
                        state_arc.register_shortcut("Escape", &tauri_key, "system");
                        println!("[tauri] Registered ESC shortcut for closing windows (key: {})", tauri_key);
                    }
                }
            }

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

            // Discover and load extensions
            let extensions_dir = if cfg!(debug_assertions) {
                let manifest_dir =
                    std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
                std::path::PathBuf::from(manifest_dir)
                    .join("../../..")
                    .join("extensions")
            } else {
                app.path()
                    .resource_dir()
                    .expect("Failed to get resource dir")
                    .join("extensions")
            };

            let discovered = extensions::discover_extensions(&extensions_dir);
            println!("[tauri] Discovered {} extensions", discovered.len());

            // Get state for checking enabled status
            let state = app.state::<Arc<AppState>>();

            for ext in discovered {
                let is_enabled = {
                    let db = state.db.lock().unwrap();
                    extensions::is_extension_enabled(&db, &ext.id, ext.manifest.builtin)
                };

                if !is_enabled {
                    println!("[tauri:ext] Skipping disabled extension: {}", ext.id);
                    continue;
                }

                // Create extension background window
                let background = ext.manifest.background.as_deref().unwrap_or("background.html");
                let ext_url = format!("peek://ext/{}/{}", ext.id, background);

                println!("[tauri:ext] Loading extension: {} from {}", ext.id, ext_url);

                let ext_url_parsed = WebviewUrl::CustomProtocol(
                    ext_url.parse().expect("Invalid extension URL"),
                );

                let label = format!("ext_{}", ext.id);
                let window_result = WebviewWindowBuilder::new(app, &label, ext_url_parsed)
                    .title(&format!("Extension: {}", ext.manifest.name.as_deref().unwrap_or(&ext.id)))
                    .inner_size(800.0, 600.0)
                    .visible(false)
                    .initialization_script(PRELOAD_SCRIPT)
                    .build();

                if window_result.is_ok() {
                    // Register the extension in state
                    state.register_extension(&ext.id, ext.manifest.clone(), &label);
                }
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
            commands::datastore::datastore_get_tags_by_frecency,
            commands::datastore::datastore_get_addresses_by_tag,
            commands::datastore::datastore_get_untagged_addresses,
            commands::datastore::datastore_get_table,
            commands::datastore::datastore_set_row,
            commands::datastore::datastore_get_stats,
            // Utility commands
            commands::log_message,
            // Command palette
            commands::commands_register,
            commands::commands_unregister,
            commands::commands_get_all,
            // Extensions
            commands::extensions_list,
            // App control
            commands::app_quit,
            // Shortcuts
            commands::shortcut_register,
            commands::shortcut_unregister,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
