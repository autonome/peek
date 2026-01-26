//! Profile commands - IPC handlers for profile management

use super::CommandResponse;
use crate::profiles::{self, Profile, ProfileSyncConfig};
use crate::state::AppState;
use std::sync::Arc;

#[tauri::command]
pub async fn profiles_list(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CommandResponse<Vec<Profile>>, String> {
    let conn = state.profiles_db.lock().unwrap();
    let list = profiles::list_profiles(&conn);
    Ok(CommandResponse::success(list))
}

#[tauri::command]
pub async fn profiles_create(
    state: tauri::State<'_, Arc<AppState>>,
    name: String,
) -> Result<CommandResponse<Profile>, String> {
    let conn = state.profiles_db.lock().unwrap();
    match profiles::create_profile(&conn, &name, Some(&state.app_data_dir)) {
        Ok(profile) => Ok(CommandResponse::success(profile)),
        Err(e) => Ok(CommandResponse::error(format!(
            "Failed to create profile: {}",
            e
        ))),
    }
}

#[tauri::command]
pub async fn profiles_get(
    state: tauri::State<'_, Arc<AppState>>,
    slug: String,
) -> Result<CommandResponse<Profile>, String> {
    let conn = state.profiles_db.lock().unwrap();
    match profiles::get_profile(&conn, &slug) {
        Some(profile) => Ok(CommandResponse::success(profile)),
        None => Ok(CommandResponse::error(format!(
            "Profile '{}' not found",
            slug
        ))),
    }
}

#[tauri::command]
pub async fn profiles_delete(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<CommandResponse<bool>, String> {
    let conn = state.profiles_db.lock().unwrap();
    match profiles::delete_profile(&conn, &id) {
        Ok(()) => Ok(CommandResponse::success(true)),
        Err(e) => Ok(CommandResponse::error(e)),
    }
}

#[tauri::command]
pub async fn profiles_get_current(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CommandResponse<Profile>, String> {
    let conn = state.profiles_db.lock().unwrap();
    let profile = profiles::get_active_profile(&conn);
    Ok(CommandResponse::success(profile))
}

#[tauri::command]
pub async fn profiles_switch(
    state: tauri::State<'_, Arc<AppState>>,
    slug: String,
) -> Result<CommandResponse<bool>, String> {
    let conn = state.profiles_db.lock().unwrap();
    match profiles::set_active_profile(&conn, &slug) {
        Ok(()) => Ok(CommandResponse::success(true)),
        Err(e) => Ok(CommandResponse::error(e)),
    }
}

#[tauri::command]
pub async fn profiles_enable_sync(
    state: tauri::State<'_, Arc<AppState>>,
    profile_id: String,
    api_key: String,
    server_profile_slug: String,
) -> Result<CommandResponse<bool>, String> {
    let conn = state.profiles_db.lock().unwrap();
    match profiles::enable_sync(&conn, &profile_id, &api_key, &server_profile_slug) {
        Ok(()) => Ok(CommandResponse::success(true)),
        Err(e) => Ok(CommandResponse::error(e)),
    }
}

#[tauri::command]
pub async fn profiles_disable_sync(
    state: tauri::State<'_, Arc<AppState>>,
    profile_id: String,
) -> Result<CommandResponse<bool>, String> {
    let conn = state.profiles_db.lock().unwrap();
    match profiles::disable_sync(&conn, &profile_id) {
        Ok(()) => Ok(CommandResponse::success(true)),
        Err(e) => Ok(CommandResponse::error(e)),
    }
}

#[tauri::command]
pub async fn profiles_get_sync_config(
    state: tauri::State<'_, Arc<AppState>>,
    profile_id: String,
) -> Result<CommandResponse<Option<ProfileSyncConfig>>, String> {
    let conn = state.profiles_db.lock().unwrap();
    let config = profiles::get_sync_config(&conn, &profile_id);
    Ok(CommandResponse::success(config))
}
