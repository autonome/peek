//! Custom peek:// protocol handler
//!
//! Handles routing for:
//! - peek://app/... → Application files
//! - peek://ext/{id}/... → Extension files
//! - peek://extensions/... → Extension infrastructure

use std::borrow::Cow;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use tauri::http::{Request, Response};
use tauri::{Manager, UriSchemeContext, UriSchemeResponder};

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
        "system" => {
            // System URLs are virtual, return empty response
            Ok(Response::builder()
                .status(200)
                .header("Content-Type", "text/html")
                .body(Cow::Borrowed(b"" as &[u8]))
                .unwrap())
        }
        _ => Err(format!("Unknown host: {}", host)),
    }
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

/// Get the resource directory based on build mode
fn get_resource_dir<R: tauri::Runtime>(
    ctx: &UriSchemeContext<'_, R>,
) -> Result<PathBuf, String> {
    // In development, use the project root
    // In production, use the resource directory
    if cfg!(debug_assertions) {
        // Development: go up from src-tauri to project root
        let manifest_dir =
            std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
        let manifest_path = PathBuf::from(manifest_dir);

        // Go up from backend/tauri/src-tauri to project root
        Ok(manifest_path
            .join("../../..")
            .canonicalize()
            .unwrap_or(manifest_path))
    } else {
        // Production: use Tauri's resource directory
        ctx.app_handle()
            .path()
            .resource_dir()
            .map_err(|e| format!("Failed to get resource dir: {}", e))
    }
}

/// Serve a file from the filesystem
fn serve_file(path: &Path) -> Result<Response<Cow<'static, [u8]>>, String> {
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

    Ok(Response::builder()
        .status(200)
        .header("Content-Type", &mime_type)
        .header("Access-Control-Allow-Origin", "*")
        .body(Cow::Owned(content))
        .unwrap())
}
