//! Tauri command handlers
//!
//! These commands mirror the Electron IPC handlers in backend/electron/ipc.ts

pub mod datastore;
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
