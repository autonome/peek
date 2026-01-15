//! Custom peek:// protocol handler
//!
//! Handles routing for:
//! - peek://app/... → Application files
//! - peek://ext/{id}/... → Extension files (legacy)
//! - peek://{ext-id}/... → Extension files with per-extension origin (e.g., peek://cmd/, peek://groups/)
//! - peek://extensions/... → Extension infrastructure
//! - peek://theme/... → Current theme files
//! - peek://theme/{themeId}/... → Specific theme files

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{Request, Response};
use tauri::{Manager, UriSchemeContext, UriSchemeResponder};

use crate::theme::{get_active_theme_id, get_theme_path};

lazy_static::lazy_static! {
    /// Maps extension IDs to their filesystem paths for custom (non-bundled) extensions
    pub static ref EXTENSION_PATHS: Mutex<HashMap<String, String>> = Mutex::new(HashMap::new());
}

/// Handle peek:// protocol requests
pub fn handle_peek_protocol<R: tauri::Runtime>(
    ctx: UriSchemeContext<'_, R>,
    request: Request<Vec<u8>>,
    responder: UriSchemeResponder,
) {
    let uri = request.uri();
    let uri_str = uri.to_string();

    println!("[tauri:protocol] Handling request: {}", uri_str);

    // Parse the URL and serve
    let response = match parse_and_serve(&ctx, &uri_str) {
        Ok(resp) => resp,
        Err(e) => {
            eprintln!("[tauri:protocol] Error: {}", e);
            Response::builder()
                .status(500)
                .header("Content-Type", "text/plain")
                .body(Cow::Owned(format!("Error: {}", e).into_bytes()))
                .unwrap()
        }
    };

    responder.respond(response);
}

fn parse_and_serve<R: tauri::Runtime>(
    ctx: &UriSchemeContext<'_, R>,
    uri: &str,
) -> Result<Response<Cow<'static, [u8]>>, String> {
    // Parse the URI: peek://host/path
    let uri = uri.strip_prefix("peek://").ok_or("Invalid peek:// URL")?;

    let (host, path) = match uri.find('/') {
        Some(idx) => (&uri[..idx], &uri[idx + 1..]),
        None => (uri, ""),
    };

    // Strip query string and fragment from path for file lookup
    let clean_path = path
        .split('?')
        .next()
        .unwrap_or(path)
        .split('#')
        .next()
        .unwrap_or(path);

    match host {
        "app" => serve_app_file(ctx, clean_path),
        "ext" => serve_extension_file(ctx, clean_path),
        "extensions" => serve_extensions_file(ctx, clean_path),
        "tauri" => serve_tauri_file(ctx, clean_path),
        "theme" => serve_theme_file(clean_path),
        "system" => {
            // System URLs are virtual, return empty response
            Ok(Response::builder()
                .status(200)
                .header("Content-Type", "text/html")
                .body(Cow::Borrowed(b"" as &[u8]))
                .unwrap())
        }
        _ => {
            // Check if host is a per-extension origin (e.g., peek://cmd/, peek://groups/)
            // This provides unique origins for each extension for better isolation
            if let Some(result) = try_serve_per_extension_host(ctx, host, clean_path) {
                result
            } else {
                Err(format!("Unknown host: {}", host))
            }
        }
    }
}

/// Try to serve files for a per-extension host (e.g., peek://cmd/, peek://groups/)
/// Returns None if the host is not a recognized extension ID
fn try_serve_per_extension_host<R: tauri::Runtime>(
    ctx: &UriSchemeContext<'_, R>,
    ext_id: &str,
    path: &str,
) -> Option<Result<Response<Cow<'static, [u8]>>, String>> {
    // Check if this is a custom extension with a registered path
    let ext_base_path = {
        let paths = EXTENSION_PATHS.lock().unwrap();
        if let Some(custom_path) = paths.get(ext_id) {
            Some(PathBuf::from(custom_path))
        } else {
            // Check if it's a bundled extension
            let resource_dir = match get_resource_dir(ctx) {
                Ok(dir) => dir,
                Err(e) => return Some(Err(e)),
            };
            let bundled_path = resource_dir.join("extensions").join(ext_id);
            if bundled_path.exists() {
                Some(bundled_path)
            } else {
                None
            }
        }
    };

    let ext_base_path = ext_base_path?;

    // Default to background.html if no path specified
    let ext_path = if path.is_empty() {
        "background.html"
    } else {
        path
    };

    // Security: Prevent path traversal
    let requested_path = ext_base_path.join(ext_path);
    let canonical_base = match ext_base_path.canonicalize() {
        Ok(p) => p,
        Err(e) => return Some(Err(format!("Extension not found: {} ({})", ext_id, e))),
    };
    let canonical_path = match requested_path.canonicalize() {
        Ok(p) => p,
        Err(e) => return Some(Err(format!("File not found: {} ({})", ext_path, e))),
    };

    if !canonical_path.starts_with(&canonical_base) {
        return Some(Err("Forbidden: Path traversal attempt".to_string()));
    }

    Some(serve_file(&canonical_path))
}

/// Serve files from the app/ directory
fn serve_app_file<R: tauri::Runtime>(
    ctx: &UriSchemeContext<'_, R>,
    path: &str,
) -> Result<Response<Cow<'static, [u8]>>, String> {
    // Get the resource directory (where the app files are bundled)
    let resource_dir = get_resource_dir(ctx)?;

    // Handle node_modules specially
    let file_path = if path.starts_with("node_modules/") {
        resource_dir.join(path)
    } else {
        resource_dir.join("app").join(path)
    };

    serve_file(&file_path)
}

/// Serve extension files from peek://ext/{ext_id}/path
fn serve_extension_file<R: tauri::Runtime>(
    ctx: &UriSchemeContext<'_, R>,
    path: &str,
) -> Result<Response<Cow<'static, [u8]>>, String> {
    // Parse extension ID from path: {ext_id}/{rest}
    let (ext_id, ext_path) = match path.find('/') {
        Some(idx) => (&path[..idx], &path[idx + 1..]),
        None => (path, "index.html"),
    };

    let ext_path = if ext_path.is_empty() {
        "index.html"
    } else {
        ext_path
    };

    // Check if this is a custom extension with a registered path
    let ext_base_path = {
        let paths = EXTENSION_PATHS.lock().unwrap();
        if let Some(custom_path) = paths.get(ext_id) {
            PathBuf::from(custom_path)
        } else {
            // Fall back to bundled extensions directory
            let resource_dir = get_resource_dir(ctx)?;
            resource_dir.join("extensions").join(ext_id)
        }
    };

    // Security: Prevent path traversal
    let requested_path = ext_base_path.join(ext_path);
    let canonical_base = ext_base_path
        .canonicalize()
        .map_err(|e| format!("Extension not found: {} ({})", ext_id, e))?;
    let canonical_path = requested_path
        .canonicalize()
        .map_err(|e| format!("File not found: {} ({})", ext_path, e))?;

    if !canonical_path.starts_with(&canonical_base) {
        return Err("Forbidden: Path traversal attempt".to_string());
    }

    serve_file(&canonical_path)
}

/// Serve extension infrastructure files
fn serve_extensions_file<R: tauri::Runtime>(
    ctx: &UriSchemeContext<'_, R>,
    path: &str,
) -> Result<Response<Cow<'static, [u8]>>, String> {
    let resource_dir = get_resource_dir(ctx)?;
    let file_path = resource_dir.join("extensions").join(path);
    serve_file(&file_path)
}

/// Serve Tauri backend files from peek://tauri/...
/// This keeps backend-specific code out of the app/ directory
fn serve_tauri_file<R: tauri::Runtime>(
    ctx: &UriSchemeContext<'_, R>,
    path: &str,
) -> Result<Response<Cow<'static, [u8]>>, String> {
    let resource_dir = get_resource_dir(ctx)?;
    let file_path = resource_dir.join("backend").join("tauri").join(path);
    serve_file(&file_path)
}

/// Serve theme files from peek://theme/... or peek://theme/{themeId}/...
fn serve_theme_file(path: &str) -> Result<Response<Cow<'static, [u8]>>, String> {
    let parts: Vec<&str> = path.split('/').collect();

    // Determine theme ID and file path
    let (theme_id, theme_path) = if !parts.is_empty() && get_theme_path(parts[0]).is_some() {
        // peek://theme/{themeId}/{path} - specific theme
        let theme_path = if parts.len() > 1 {
            parts[1..].join("/")
        } else {
            "variables.css".to_string()
        };
        (parts[0].to_string(), theme_path)
    } else {
        // peek://theme/{path} - active theme
        let theme_path = if path.is_empty() {
            "variables.css".to_string()
        } else {
            path.to_string()
        };
        (get_active_theme_id(), theme_path)
    };

    let theme_base_path = match get_theme_path(&theme_id) {
        Some(p) => p,
        None => {
            println!("[tauri:protocol] Theme not found: {}", theme_id);
            return Ok(Response::builder()
                .status(404)
                .header("Content-Type", "text/plain")
                .body(Cow::Borrowed(b"Theme not found" as &[u8]))
                .unwrap());
        }
    };

    let file_path = theme_base_path.join(&theme_path);

    // Security: Prevent path traversal
    let canonical_base = match theme_base_path.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            return Err(format!("Theme base path error: {}", e));
        }
    };
    let canonical_path = match file_path.canonicalize() {
        Ok(p) => p,
        Err(e) => {
            return Ok(Response::builder()
                .status(404)
                .header("Content-Type", "text/plain")
                .body(Cow::Owned(format!("File not found: {}", e).into_bytes()))
                .unwrap());
        }
    };

    if !canonical_path.starts_with(&canonical_base) {
        return Err("Forbidden: Path traversal attempt".to_string());
    }

    // For CSS and font files, add no-cache headers to ensure theme changes take effect
    let is_cacheable = theme_path.ends_with(".css")
        || theme_path.ends_with(".woff2")
        || theme_path.ends_with(".woff");

    serve_file_with_cache(&canonical_path, !is_cacheable)
}

/// Get the resource directory based on build mode
fn get_resource_dir<R: tauri::Runtime>(
    ctx: &UriSchemeContext<'_, R>,
) -> Result<PathBuf, String> {
    // Try CARGO_MANIFEST_DIR first (set when running via cargo)
    if let Ok(manifest_dir) = std::env::var("CARGO_MANIFEST_DIR") {
        let dev_path = PathBuf::from(manifest_dir)
            .join("../../..")
            .canonicalize()
            .map_err(|e| format!("Failed to canonicalize: {}", e))?;
        if dev_path.join("app").exists() {
            return Ok(dev_path);
        }
    }

    // Check if we're running from target/ directory (compiled binary)
    if let Ok(exe_path) = std::env::current_exe() {
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
                                    if project_root.join("app").exists() {
                                        return Ok(project_root.to_path_buf());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    // Production: use Tauri's resource directory
    ctx.app_handle()
        .path()
        .resource_dir()
        .map_err(|e| format!("Failed to get resource dir: {}", e))
}

/// Serve a file from the filesystem
fn serve_file(path: &Path) -> Result<Response<Cow<'static, [u8]>>, String> {
    serve_file_with_cache(path, true)
}

/// Serve a file from the filesystem with optional caching
fn serve_file_with_cache(path: &Path, allow_cache: bool) -> Result<Response<Cow<'static, [u8]>>, String> {
    // Check if file exists
    if !path.exists() {
        return Ok(Response::builder()
            .status(404)
            .header("Content-Type", "text/plain")
            .body(Cow::Borrowed(b"Not Found" as &[u8]))
            .unwrap());
    }

    // If it's a directory, try index.html
    let file_path = if path.is_dir() {
        path.join("index.html")
    } else {
        path.to_path_buf()
    };

    if !file_path.exists() {
        return Ok(Response::builder()
            .status(404)
            .header("Content-Type", "text/plain")
            .body(Cow::Borrowed(b"Not Found" as &[u8]))
            .unwrap());
    }

    // Read the file
    let content =
        std::fs::read(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;

    // Determine MIME type
    let mime_type = mime_guess::from_path(&file_path)
        .first_or_octet_stream()
        .to_string();

    let mut builder = Response::builder()
        .status(200)
        .header("Content-Type", &mime_type)
        .header("Access-Control-Allow-Origin", "*");

    // Add no-cache headers if caching is disabled
    if !allow_cache {
        builder = builder
            .header("Cache-Control", "no-store, no-cache, must-revalidate")
            .header("Pragma", "no-cache")
            .header("Expires", "0");
    }

    Ok(builder.body(Cow::Owned(content)).unwrap())
}
