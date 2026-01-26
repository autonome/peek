//! Peek Tauri Backend
//!
//! This is the Tauri backend for Peek, providing window management,
//! SQLite datastore, and custom protocol handling.

mod commands;
mod datastore;
mod extensions;
mod protocol;
mod state;
mod sync;
mod theme;

use state::AppState;
use std::sync::Arc;
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
#[cfg(target_os = "macos")]
use tauri::ActivationPolicy;

// Note: Tauri doesn't have backgroundColor support like Electron.
// The white flash prevention is handled through CSS in the frontend.
// Theme CSS with dark background colors will help mitigate this.

/// The Peek API implementation script
/// Provides window.app API to all peek:// pages
/// See docs/PEEK-API.md for the complete API reference
pub const PEEK_API_SCRIPT: &str = include_str!("../../preload.js");

/// Initialize and run the Tauri application
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
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

                                        // Emit with original name, sanitizing for valid event name
                                        // Only alphanumeric, '-', '/', ':', '_' are allowed
                                        let safe_name: String = info.original.chars().map(|c| {
                                            if c.is_alphanumeric() || c == '-' || c == '/' || c == ':' || c == '_' {
                                                c
                                            } else {
                                                '_'
                                            }
                                        }).collect();
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

                // NOTE: ESC is handled locally by preload.js keyup listener, not as a global shortcut.
                // Global ESC would capture it system-wide even when Peek windows aren't focused.
            }

            // Create main window programmatically with preload script injection
            let main_url = WebviewUrl::CustomProtocol(
                "peek://app/background.html"
                    .parse()
                    .expect("Invalid main URL"),
            );

            let mut main_builder = WebviewWindowBuilder::new(app, "main", main_url)
                .initialization_script(PEEK_API_SCRIPT);

            // Desktop-only window options
            #[cfg(desktop)]
            {
                main_builder = main_builder
                    .inner_size(800.0, 600.0)
                    .title("Peek (Tauri)")
                    .visible(false);

                // In headless mode, prevent windows from being focusable
                if headless {
                    main_builder = main_builder.focused(false);
                }
            }

            let main_window = main_builder
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
            // Check for development mode (running from source) vs bundled app
            let extensions_dir = find_extensions_dir(app)?;

            fn find_extensions_dir(app: &tauri::App) -> Result<std::path::PathBuf, Box<dyn std::error::Error>> {
                // Try CARGO_MANIFEST_DIR first (set when running via cargo)
                if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
                    let dev_path = std::path::PathBuf::from(manifest_dir)
                        .join("../../..")
                        .join("extensions");
                    if dev_path.exists() {
                        println!("[tauri] Using dev extensions path (CARGO_MANIFEST_DIR): {:?}", dev_path);
                        return Ok(dev_path);
                    }
                }

                // No CARGO_MANIFEST_DIR - check if we're running from target/ directory
                // (common when running compiled binary directly during development)
                if let Ok(exe_path) = std::env::current_exe() {
                    // Check if exe is in .../target/{release,debug}/...
                    let exe_str = exe_path.to_string_lossy();
                    if exe_str.contains("/target/release/") || exe_str.contains("/target/debug/") {
                        // Navigate up from target/{release,debug} to project root
                        // Path: project/backend/tauri/src-tauri/target/{release,debug}/peek-tauri
                        if let Some(target_profile) = exe_path.parent() {
                            if let Some(target) = target_profile.parent() {
                                if let Some(src_tauri) = target.parent() {
                                    if let Some(tauri_dir) = src_tauri.parent() {
                                        if let Some(backend_dir) = tauri_dir.parent() {
                                            if let Some(project_root) = backend_dir.parent() {
                                                let dev_path = project_root.join("extensions");
                                                if dev_path.exists() {
                                                    println!("[tauri] Using dev extensions path (exe path): {:?}", dev_path);
                                                    return Ok(dev_path);
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }

                // Fallback to resource dir for bundled app
                Ok(app.path()
                    .resource_dir()
                    .expect("Failed to get resource dir")
                    .join("extensions"))
            }

            let discovered = extensions::discover_extensions(&extensions_dir);
            println!("[tauri] Discovered {} extensions", discovered.len());

            // Discover themes from themes/ directory (same pattern as extensions)
            let themes_dir = extensions_dir.parent()
                .map(|p| p.join("themes"))
                .unwrap_or_else(|| extensions_dir.join("../themes"));

            let discovered_themes = theme::discover_themes(&themes_dir);
            println!("[tauri] Discovered {} themes", discovered_themes.len());

            // Restore saved theme preference (must be after themes are discovered)
            {
                let db = state_arc.db.lock().unwrap();
                theme::restore_saved_theme(&db);
            }

            // Get state for checking enabled status
            let state = app.state::<Arc<AppState>>();

            // Helper to create extension window
            let create_extension_window = |app: &tauri::App, ext: &extensions::DiscoveredExtension, state: &Arc<AppState>, headless: bool| -> bool {
                let background = ext.manifest.background.as_deref().unwrap_or("background.html");
                let ext_url = format!("peek://ext/{}/{}", ext.id, background);

                println!("[tauri:ext] Loading extension: {} from {}", ext.id, ext_url);

                let ext_url_parsed = WebviewUrl::CustomProtocol(
                    ext_url.parse().expect("Invalid extension URL"),
                );

                let label = format!("ext_{}", ext.id);
                let mut ext_builder = WebviewWindowBuilder::new(app, &label, ext_url_parsed)
                    .initialization_script(PEEK_API_SCRIPT);

                // Desktop-only window options
                #[cfg(desktop)]
                {
                    ext_builder = ext_builder
                        .inner_size(800.0, 600.0)
                        .title(&format!("Extension: {}", ext.manifest.name.as_deref().unwrap_or(&ext.id)))
                        .visible(false);

                    // In headless mode, prevent windows from being focusable
                    if headless {
                        ext_builder = ext_builder.focused(false);
                    }
                }

                let window_result = ext_builder.build();

                if window_result.is_ok() {
                    // Register the extension in state
                    state.register_extension(&ext.id, ext.manifest.clone(), &label);
                    true
                } else {
                    false
                }
            };

            // Phase 1: Early - emit startup phase event
            let _ = app.emit("pubsub:ext:startup:phase", serde_json::json!({
                "source": "system",
                "scope": 3,
                "data": { "phase": "early" }
            }));

            // Separate cmd extension from others for priority loading
            let (cmd_ext, other_exts): (Vec<_>, Vec<_>) = discovered
                .into_iter()
                .partition(|ext| ext.id == "cmd");

            // Load cmd extension first (it's the command registry)
            for ext in &cmd_ext {
                let is_enabled = {
                    let db = state.db.lock().unwrap();
                    extensions::is_extension_enabled(&db, &ext.id, ext.manifest.builtin)
                };

                if is_enabled {
                    create_extension_window(app, ext, &state_arc, headless);
                } else {
                    println!("[tauri:ext] Skipping disabled extension: {}", ext.id);
                }
            }

            // Phase 2: Commands - other extensions can now register commands
            let _ = app.emit("pubsub:ext:startup:phase", serde_json::json!({
                "source": "system",
                "scope": 3,
                "data": { "phase": "commands" }
            }));

            // Load other extensions
            // Note: In Rust/Tauri, we load sequentially since window creation is synchronous
            // but this is still much faster than Electron's approach
            for ext in &other_exts {
                let is_enabled = {
                    let db = state.db.lock().unwrap();
                    extensions::is_extension_enabled(&db, &ext.id, ext.manifest.builtin)
                };

                if !is_enabled {
                    println!("[tauri:ext] Skipping disabled extension: {}", ext.id);
                    continue;
                }

                create_extension_window(app, ext, &state_arc, headless);
            }

            // Phase 3: UI ready
            let _ = app.emit("pubsub:ext:startup:phase", serde_json::json!({
                "source": "system",
                "scope": 3,
                "data": { "phase": "ui" }
            }));

            // Phase 4: Complete
            let _ = app.emit("pubsub:ext:startup:phase", serde_json::json!({
                "source": "system",
                "scope": 3,
                "data": { "phase": "complete" }
            }));

            // Emit ext:all-loaded event
            let loaded_count = state.extensions.lock().unwrap().len();
            let _ = app.emit("pubsub:ext:all-loaded", serde_json::json!({
                "source": "system",
                "scope": 3,
                "data": { "count": loaded_count }
            }));

            println!("[tauri] App setup complete - {} extensions loaded", loaded_count);

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
            commands::datastore::datastore_get_row,
            commands::datastore::datastore_set_row,
            commands::datastore::datastore_get_stats,
            // Item commands (mobile-style lightweight content)
            commands::datastore::datastore_add_item,
            commands::datastore::datastore_get_item,
            commands::datastore::datastore_update_item,
            commands::datastore::datastore_delete_item,
            commands::datastore::datastore_hard_delete_item,
            commands::datastore::datastore_query_items,
            commands::datastore::datastore_tag_item,
            commands::datastore::datastore_untag_item,
            commands::datastore::datastore_get_item_tags,
            commands::datastore::datastore_get_items_by_tag,
            // Utility commands
            commands::log_message,
            // Command palette
            commands::commands_register,
            commands::commands_unregister,
            commands::commands_get_all,
            // Extensions - list running
            commands::extensions_list,
            // Extension management
            commands::extensions::extension_pick_folder,
            commands::extensions::extension_validate_folder,
            commands::extensions::extension_add,
            commands::extensions::extension_remove,
            commands::extensions::extension_update,
            commands::extensions::extension_get_all,
            commands::extensions::extension_get,
            commands::extensions::extension_load,
            commands::extensions::extension_unload,
            commands::extensions::extension_reload,
            // App control
            commands::app_quit,
            commands::app_restart,
            // Shortcuts
            commands::shortcut_register,
            commands::shortcut_unregister,
            // Theme
            commands::theme::theme_get,
            commands::theme::theme_set_theme,
            commands::theme::theme_set_color_scheme,
            commands::theme::theme_list,
            // Sync
            commands::sync::sync_get_config,
            commands::sync::sync_set_config,
            commands::sync::sync_pull,
            commands::sync::sync_push,
            commands::sync::sync_full,
            commands::sync::sync_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
