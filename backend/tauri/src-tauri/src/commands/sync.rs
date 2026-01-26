//! Sync commands - IPC handlers for sync operations

use super::CommandResponse;
use crate::state::AppState;
use crate::sync::{self, SyncConfig, SyncResult, SyncStatus};
use std::sync::Arc;

#[tauri::command]
pub async fn sync_get_config(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CommandResponse<SyncConfig>, String> {
    let db = state.db.lock().unwrap();
    let pdb = state.profiles_db.lock().unwrap();
    let config = sync::get_sync_config(&db, &pdb);
    Ok(CommandResponse::success(config))
}

#[tauri::command]
pub async fn sync_set_config(
    state: tauri::State<'_, Arc<AppState>>,
    config: SyncConfig,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();
    let pdb = state.profiles_db.lock().unwrap();
    match sync::set_sync_config(&db, &pdb, &config) {
        Ok(()) => Ok(CommandResponse::success(true)),
        Err(e) => Ok(CommandResponse::error(format!(
            "Failed to save sync config: {}",
            e
        ))),
    }
}

#[tauri::command]
pub async fn sync_pull(
    state: tauri::State<'_, Arc<AppState>>,
    options: Option<serde_json::Value>,
) -> Result<CommandResponse<sync::PullResult>, String> {
    // Extract config while holding the locks, then release before async work
    let (server_url, api_key, since) = {
        let db = state.db.lock().unwrap();
        let pdb = state.profiles_db.lock().unwrap();
        let config = sync::get_sync_config(&db, &pdb);
        let since = options
            .as_ref()
            .and_then(|o| o.get("since"))
            .and_then(|v| v.as_i64());
        (config.server_url, config.api_key, since)
    };
    // Locks released here

    if api_key.is_empty() {
        return Ok(CommandResponse::error("Sync not configured: no API key"));
    }

    // Pass the Arc<Mutex<Connection>>s for async-safe DB access
    let db_arc = state.db_arc();
    let pdb_arc = state.profiles_db_arc();
    match sync::pull_from_server(&db_arc, &pdb_arc, &server_url, &api_key, since).await {
        Ok(result) => Ok(CommandResponse::success(result)),
        Err(e) => Ok(CommandResponse::error(format!("Pull failed: {}", e))),
    }
}

#[tauri::command]
pub async fn sync_push(
    state: tauri::State<'_, Arc<AppState>>,
    options: Option<serde_json::Value>,
) -> Result<CommandResponse<sync::PushResult>, String> {
    // Extract config while holding the locks, then release before async work
    let (server_url, api_key, last_sync_time) = {
        let db = state.db.lock().unwrap();
        let pdb = state.profiles_db.lock().unwrap();
        let config = sync::get_sync_config(&db, &pdb);
        let last_sync_time = options
            .as_ref()
            .and_then(|o| o.get("lastSyncTime"))
            .and_then(|v| v.as_i64())
            .unwrap_or(config.last_sync_time);
        (config.server_url, config.api_key, last_sync_time)
    };
    // Locks released here

    if api_key.is_empty() {
        return Ok(CommandResponse::error("Sync not configured: no API key"));
    }

    let db_arc = state.db_arc();
    let pdb_arc = state.profiles_db_arc();
    match sync::push_to_server(&db_arc, &pdb_arc, &server_url, &api_key, last_sync_time).await {
        Ok(result) => Ok(CommandResponse::success(result)),
        Err(e) => Ok(CommandResponse::error(format!("Push failed: {}", e))),
    }
}

#[tauri::command]
pub async fn sync_full(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CommandResponse<SyncResult>, String> {
    let db_arc = state.db_arc();
    let pdb_arc = state.profiles_db_arc();
    match sync::sync_all(&db_arc, &pdb_arc).await {
        Ok(result) => Ok(CommandResponse::success(result)),
        Err(e) => Ok(CommandResponse::error(format!("Sync failed: {}", e))),
    }
}

#[tauri::command]
pub async fn sync_status(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CommandResponse<SyncStatus>, String> {
    let db = state.db.lock().unwrap();
    let pdb = state.profiles_db.lock().unwrap();
    let status = sync::get_sync_status(&db, &pdb);
    Ok(CommandResponse::success(status))
}
