//! Window management commands

use super::CommandResponse;
use crate::state::AppState;
use crate::PEEK_API_SCRIPT;
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder};

/// Window open options - matches Electron's window options
#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowOpenOptions {
    pub key: Option<String>,
    pub width: Option<f64>,
    pub height: Option<f64>,
    pub x: Option<f64>,
    pub y: Option<f64>,
    pub title: Option<String>,
    pub modal: Option<bool>,
    pub transparent: Option<bool>,
    pub decorations: Option<bool>,
    pub frame: Option<bool>,      // Electron's frame option (false = no titlebar/menubar)
    pub always_on_top: Option<bool>,
    pub visible: Option<bool>,
    pub resizable: Option<bool>,
    pub keep_live: Option<bool>,
    pub center: Option<bool>,
}

/// Window info returned by list command
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowListItem {
    pub id: String,
    pub label: String,
    pub url: String,
    pub source: String,
    pub visible: bool,
    pub focused: bool,
}

/// Result of window_open command
#[derive(Debug, Serialize)]
pub struct WindowOpenResult {
    pub id: String,
}

/// Open a new window
#[tauri::command]
pub async fn window_open(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    source: String,
    url: String,
    options: Option<WindowOpenOptions>,
) -> Result<CommandResponse<WindowOpenResult>, String> {
    println!("[tauri:window] window_open called: url={}, source={}", url, source);
    let options = options.unwrap_or_default();

    // Generate window label - must only contain alphanumeric, -, /, :, _
    let raw_label = options
        .key
        .clone()
        .unwrap_or_else(|| format!("window_{}", uuid::Uuid::new_v4()));

    // Sanitize label: replace invalid characters with underscores
    let label: String = raw_label
        .chars()
        .map(|c| {
            if c.is_alphanumeric() || c == '-' || c == '/' || c == ':' || c == '_' {
                c
            } else {
                '_'
            }
        })
        .collect();

    println!("[tauri:window] Using label: {}", label);

    // Check if window with this key already exists and reuse it
    if let Some(existing) = app.get_webview_window(&label) {
        // Window exists - only show and focus if not in headless mode
        if !state.headless {
            let _ = existing.show();
            let _ = existing.set_focus();
        }

        return Ok(CommandResponse::success(WindowOpenResult { id: label }));
    }

    // Parse URL for Tauri
    let webview_url = if url.starts_with("peek://") {
        WebviewUrl::CustomProtocol(url.parse().map_err(|e| format!("Invalid URL: {}", e))?)
    } else if url.starts_with("http://") || url.starts_with("https://") {
        WebviewUrl::External(url.parse().map_err(|e| format!("Invalid URL: {}", e))?)
    } else {
        WebviewUrl::CustomProtocol(format!("peek://app/{}", url).parse().unwrap())
    };

    // Check headless mode - force windows to be hidden
    let visible = if state.headless {
        println!("[tauri:window] HEADLESS mode - forcing visible=false");
        false
    } else {
        options.visible.unwrap_or(true)
    };
    println!("[tauri:window] Creating window with visible={}", visible);

    // Create window builder with preload script injection
    let mut builder = WebviewWindowBuilder::new(&app, &label, webview_url.clone())
        .title(options.title.as_deref().unwrap_or("Peek"))
        .inner_size(
            options.width.unwrap_or(800.0),
            options.height.unwrap_or(600.0),
        )
        .resizable(options.resizable.unwrap_or(true))
        .visible(visible)
        .initialization_script(PEEK_API_SCRIPT);

    // Apply optional settings
    if let (Some(x), Some(y)) = (options.x, options.y) {
        builder = builder.position(x, y);
    }

    // Handle decorations - frame:false in Electron means no decorations
    let has_decorations = match (options.decorations, options.frame) {
        (Some(d), _) => d,           // Explicit decorations takes precedence
        (None, Some(f)) => f,        // frame:false means decorations:false
        (None, None) => true,        // Default to having decorations
    };
    builder = builder.decorations(has_decorations);

    // Note: transparent windows require macos-private-api feature on macOS
    // Skipping for now as it prevents App Store submission

    if options.always_on_top.unwrap_or(false) {
        builder = builder.always_on_top(true);
    }

    if options.center.unwrap_or(false) {
        builder = builder.center();
    }

    // Build the window
    let window = builder
        .build()
        .map_err(|e| format!("Failed to create window: {}", e))?;

    println!("[tauri:window] Window created: label={}", label);

    // In headless mode, explicitly hide the window after creation
    // (belt and suspenders - visible(false) should work but being extra safe)
    if state.headless {
        let _ = window.hide();
        println!("[tauri:window] Explicitly hiding window in headless mode");
    }

    // Register in state
    let url_str = match webview_url {
        WebviewUrl::CustomProtocol(u) => u.to_string(),
        WebviewUrl::External(u) => u.to_string(),
        _ => url.clone(),
    };
    state.register_window(&label, &source, &url_str);

    // Set up close handler to unregister window
    let state_clone = state.inner().clone();
    let label_clone = label.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::Destroyed = event {
            state_clone.unregister_window(&label_clone);
        }
    });

    Ok(CommandResponse::success(WindowOpenResult { id: label }))
}

/// Close a window
#[tauri::command]
pub async fn window_close(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    id: Option<String>,
) -> Result<CommandResponse<bool>, String> {
    let label = id.unwrap_or_else(|| "main".to_string());

    if let Some(window) = app.get_webview_window(&label) {
        let _ = window.close();
        state.unregister_window(&label);
        Ok(CommandResponse::success(true))
    } else {
        Ok(CommandResponse::error(format!(
            "Window not found: {}",
            label
        )))
    }
}

/// Hide a window
#[tauri::command]
pub async fn window_hide(
    app: tauri::AppHandle,
    id: Option<String>,
) -> Result<CommandResponse<bool>, String> {
    let label = id.unwrap_or_else(|| "main".to_string());

    if let Some(window) = app.get_webview_window(&label) {
        window
            .hide()
            .map_err(|e| format!("Failed to hide: {}", e))?;
        Ok(CommandResponse::success(true))
    } else {
        Ok(CommandResponse::error(format!(
            "Window not found: {}",
            label
        )))
    }
}

/// Show a window
#[tauri::command]
pub async fn window_show(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    id: Option<String>,
) -> Result<CommandResponse<bool>, String> {
    // In headless mode, don't show any windows
    if state.headless {
        return Ok(CommandResponse::success(true));
    }

    let label = id.unwrap_or_else(|| "main".to_string());

    if let Some(window) = app.get_webview_window(&label) {
        window
            .show()
            .map_err(|e| format!("Failed to show: {}", e))?;
        Ok(CommandResponse::success(true))
    } else {
        Ok(CommandResponse::error(format!(
            "Window not found: {}",
            label
        )))
    }
}

/// Focus a window
#[tauri::command]
pub async fn window_focus(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
    id: Option<String>,
) -> Result<CommandResponse<bool>, String> {
    let label = id.unwrap_or_else(|| "main".to_string());

    if let Some(window) = app.get_webview_window(&label) {
        // Only show window if not in headless mode
        if !state.headless {
            window
                .show()
                .map_err(|e| format!("Failed to show: {}", e))?;
            window
                .set_focus()
                .map_err(|e| format!("Failed to focus: {}", e))?;
        }
        Ok(CommandResponse::success(true))
    } else {
        Ok(CommandResponse::error(format!(
            "Window not found: {}",
            label
        )))
    }
}

/// List all windows
#[tauri::command]
pub async fn window_list(
    app: tauri::AppHandle,
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CommandResponse<Vec<WindowListItem>>, String> {
    let registered = state.list_windows();

    let windows: Vec<WindowListItem> = registered
        .into_iter()
        .filter_map(|info| {
            app.get_webview_window(&info.label).map(|win| WindowListItem {
                id: info.label.clone(),
                label: info.label,
                url: info.url,
                source: info.source,
                visible: win.is_visible().unwrap_or(false),
                focused: win.is_focused().unwrap_or(false),
            })
        })
        .collect();

    Ok(CommandResponse::success(windows))
}
