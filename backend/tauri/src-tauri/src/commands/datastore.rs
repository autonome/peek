//! Datastore commands - IPC handlers for SQLite operations

use super::CommandResponse;
use crate::datastore::{
    self, Address, AddressFilter, AddressOptions, AddressTag, DatastoreStats, Tag, Visit,
    VisitFilter, VisitOptions, Item, ItemTag, ItemOptions, ItemFilter,
};
use crate::state::AppState;
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

// ==================== Address Commands ====================

#[derive(Debug, Serialize)]
pub struct AddAddressResult {
    pub id: String,
}

#[tauri::command]
pub async fn datastore_add_address(
    state: tauri::State<'_, Arc<AppState>>,
    uri: String,
    options: Option<AddressOptions>,
) -> Result<CommandResponse<AddAddressResult>, String> {
    let db = state.db.lock().unwrap();
    let options = options.unwrap_or_default();

    match datastore::add_address(&db, &uri, &options) {
        Ok(id) => Ok(CommandResponse::success(AddAddressResult { id })),
        Err(e) => Ok(CommandResponse::error(format!("Failed to add address: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_address(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<CommandResponse<Option<Address>>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_address(&db, &id) {
        Ok(addr) => Ok(CommandResponse::success(addr)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get address: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_update_address(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
    updates: HashMap<String, serde_json::Value>,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();

    match datastore::update_address(&db, &id, &updates) {
        Ok(updated) => Ok(CommandResponse::success(updated)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to update address: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_query_addresses(
    state: tauri::State<'_, Arc<AppState>>,
    filter: Option<AddressFilter>,
) -> Result<CommandResponse<Vec<Address>>, String> {
    let db = state.db.lock().unwrap();
    let filter = filter.unwrap_or_default();

    match datastore::query_addresses(&db, &filter) {
        Ok(addresses) => Ok(CommandResponse::success(addresses)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to query addresses: {}", e))),
    }
}

// ==================== Visit Commands ====================

#[derive(Debug, Serialize)]
pub struct AddVisitResult {
    pub id: String,
}

#[tauri::command]
pub async fn datastore_add_visit(
    state: tauri::State<'_, Arc<AppState>>,
    address_id: String,
    options: Option<VisitOptions>,
) -> Result<CommandResponse<AddVisitResult>, String> {
    let db = state.db.lock().unwrap();
    let options = options.unwrap_or_default();

    match datastore::add_visit(&db, &address_id, &options) {
        Ok(id) => Ok(CommandResponse::success(AddVisitResult { id })),
        Err(e) => Ok(CommandResponse::error(format!("Failed to add visit: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_query_visits(
    state: tauri::State<'_, Arc<AppState>>,
    filter: Option<VisitFilter>,
) -> Result<CommandResponse<Vec<Visit>>, String> {
    let db = state.db.lock().unwrap();
    let filter = filter.unwrap_or_default();

    match datastore::query_visits(&db, &filter) {
        Ok(visits) => Ok(CommandResponse::success(visits)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to query visits: {}", e))),
    }
}

// ==================== Tag Commands ====================

#[derive(Debug, Serialize)]
pub struct GetOrCreateTagResult {
    pub tag: Tag,
    pub created: bool,
}

#[tauri::command]
pub async fn datastore_get_or_create_tag(
    state: tauri::State<'_, Arc<AppState>>,
    name: String,
) -> Result<CommandResponse<GetOrCreateTagResult>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_or_create_tag(&db, &name) {
        Ok((tag, created)) => Ok(CommandResponse::success(GetOrCreateTagResult { tag, created })),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get/create tag: {}", e))),
    }
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagAddressResult {
    pub link: AddressTag,
    pub already_exists: bool,
}

#[tauri::command]
pub async fn datastore_tag_address(
    state: tauri::State<'_, Arc<AppState>>,
    address_id: String,
    tag_id: String,
) -> Result<CommandResponse<TagAddressResult>, String> {
    let db = state.db.lock().unwrap();

    match datastore::tag_address(&db, &address_id, &tag_id) {
        Ok((link, already_exists)) => Ok(CommandResponse::success(TagAddressResult { link, already_exists })),
        Err(e) => Ok(CommandResponse::error(format!("Failed to tag address: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_untag_address(
    state: tauri::State<'_, Arc<AppState>>,
    address_id: String,
    tag_id: String,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();

    match datastore::untag_address(&db, &address_id, &tag_id) {
        Ok(removed) => Ok(CommandResponse::success(removed)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to untag address: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_address_tags(
    state: tauri::State<'_, Arc<AppState>>,
    address_id: String,
) -> Result<CommandResponse<Vec<Tag>>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_address_tags(&db, &address_id) {
        Ok(tags) => Ok(CommandResponse::success(tags)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get address tags: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_tags_by_frecency(
    state: tauri::State<'_, Arc<AppState>>,
    limit: Option<i64>,
) -> Result<CommandResponse<Vec<Tag>>, String> {
    let db = state.db.lock().unwrap();
    let limit = limit.unwrap_or(50);

    match datastore::get_tags_by_frecency(&db, limit) {
        Ok(tags) => Ok(CommandResponse::success(tags)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get tags: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_addresses_by_tag(
    state: tauri::State<'_, Arc<AppState>>,
    tag_id: String,
) -> Result<CommandResponse<Vec<Address>>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_addresses_by_tag(&db, &tag_id) {
        Ok(addresses) => Ok(CommandResponse::success(addresses)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get addresses: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_untagged_addresses(
    state: tauri::State<'_, Arc<AppState>>,
    limit: Option<i64>,
) -> Result<CommandResponse<Vec<Address>>, String> {
    let db = state.db.lock().unwrap();
    let limit = limit.unwrap_or(100);

    match datastore::get_untagged_addresses(&db, limit) {
        Ok(addresses) => Ok(CommandResponse::success(addresses)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get addresses: {}", e))),
    }
}

// ==================== Generic Table Commands ====================

#[tauri::command]
pub async fn datastore_get_table(
    state: tauri::State<'_, Arc<AppState>>,
    table_name: String,
) -> Result<CommandResponse<HashMap<String, HashMap<String, serde_json::Value>>>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_table(&db, &table_name) {
        Ok(table) => Ok(CommandResponse::success(table)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get table: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_row(
    state: tauri::State<'_, Arc<AppState>>,
    table_name: String,
    row_id: String,
) -> Result<CommandResponse<Option<HashMap<String, serde_json::Value>>>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_row(&db, &table_name, &row_id) {
        Ok(row) => Ok(CommandResponse::success(row)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get row: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_set_row(
    state: tauri::State<'_, Arc<AppState>>,
    table_name: String,
    row_id: String,
    row_data: HashMap<String, serde_json::Value>,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();

    match datastore::set_row(&db, &table_name, &row_id, &row_data) {
        Ok(()) => Ok(CommandResponse::success(true)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to set row: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_stats(
    state: tauri::State<'_, Arc<AppState>>,
) -> Result<CommandResponse<DatastoreStats>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_stats(&db) {
        Ok(stats) => Ok(CommandResponse::success(stats)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get stats: {}", e))),
    }
}

// ==================== Item Commands (mobile-style lightweight content) ====================

#[derive(Debug, Serialize)]
pub struct AddItemResult {
    pub id: String,
}

#[tauri::command]
pub async fn datastore_add_item(
    state: tauri::State<'_, Arc<AppState>>,
    r#type: String,
    options: Option<ItemOptions>,
) -> Result<CommandResponse<AddItemResult>, String> {
    let db = state.db.lock().unwrap();
    let options = options.unwrap_or_default();

    match datastore::add_item(&db, &r#type, &options) {
        Ok(id) => Ok(CommandResponse::success(AddItemResult { id })),
        Err(e) => Ok(CommandResponse::error(format!("Failed to add item: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_item(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<CommandResponse<Option<Item>>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_item(&db, &id) {
        Ok(item) => Ok(CommandResponse::success(item)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get item: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_update_item(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
    options: ItemOptions,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();

    match datastore::update_item(&db, &id, &options) {
        Ok(updated) => Ok(CommandResponse::success(updated)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to update item: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_delete_item(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();

    match datastore::delete_item(&db, &id) {
        Ok(deleted) => Ok(CommandResponse::success(deleted)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to delete item: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_hard_delete_item(
    state: tauri::State<'_, Arc<AppState>>,
    id: String,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();

    match datastore::hard_delete_item(&db, &id) {
        Ok(deleted) => Ok(CommandResponse::success(deleted)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to hard delete item: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_query_items(
    state: tauri::State<'_, Arc<AppState>>,
    filter: Option<ItemFilter>,
) -> Result<CommandResponse<Vec<Item>>, String> {
    let db = state.db.lock().unwrap();
    let filter = filter.unwrap_or_default();

    match datastore::query_items(&db, &filter) {
        Ok(items) => Ok(CommandResponse::success(items)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to query items: {}", e))),
    }
}

// ==================== Item-Tag Commands ====================

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TagItemResult {
    pub link: ItemTag,
    pub already_exists: bool,
}

#[tauri::command]
pub async fn datastore_tag_item(
    state: tauri::State<'_, Arc<AppState>>,
    item_id: String,
    tag_id: String,
) -> Result<CommandResponse<TagItemResult>, String> {
    let db = state.db.lock().unwrap();

    match datastore::tag_item(&db, &item_id, &tag_id) {
        Ok((link, already_exists)) => Ok(CommandResponse::success(TagItemResult { link, already_exists })),
        Err(e) => Ok(CommandResponse::error(format!("Failed to tag item: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_untag_item(
    state: tauri::State<'_, Arc<AppState>>,
    item_id: String,
    tag_id: String,
) -> Result<CommandResponse<bool>, String> {
    let db = state.db.lock().unwrap();

    match datastore::untag_item(&db, &item_id, &tag_id) {
        Ok(removed) => Ok(CommandResponse::success(removed)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to untag item: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_item_tags(
    state: tauri::State<'_, Arc<AppState>>,
    item_id: String,
) -> Result<CommandResponse<Vec<Tag>>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_item_tags(&db, &item_id) {
        Ok(tags) => Ok(CommandResponse::success(tags)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get item tags: {}", e))),
    }
}

#[tauri::command]
pub async fn datastore_get_items_by_tag(
    state: tauri::State<'_, Arc<AppState>>,
    tag_id: String,
) -> Result<CommandResponse<Vec<Item>>, String> {
    let db = state.db.lock().unwrap();

    match datastore::get_items_by_tag(&db, &tag_id) {
        Ok(items) => Ok(CommandResponse::success(items)),
        Err(e) => Ok(CommandResponse::error(format!("Failed to get items: {}", e))),
    }
}
