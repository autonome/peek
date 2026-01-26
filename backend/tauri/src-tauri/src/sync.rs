//! Sync module - bidirectional sync between desktop app and server
//!
//! Ports backend/electron/sync.ts to Rust.
//! Uses the unified item types (url, text, tagset, image) across all platforms.
//!
//! Sync Protocol:
//! - Pull: GET /items (or /items/since/:timestamp for incremental)
//! - Push: POST /items for each local item
//! - Conflict resolution: last-write-wins based on updatedAt
//!
//! Note: rusqlite::Connection is not Send/Sync, so all async functions that need
//! DB access accept Arc<Mutex<Connection>> and lock/unlock around await points.

use crate::datastore::{
    self, is_sync_disabled_due_to_version, Item, ItemOptions, DATASTORE_VERSION, PROTOCOL_VERSION,
};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncConfig {
    pub server_url: String,
    pub api_key: String,
    pub last_sync_time: i64,
    pub auto_sync: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SyncResult {
    pub pulled: i64,
    pub pushed: i64,
    pub conflicts: i64,
    pub last_sync_time: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PullResult {
    pub pulled: i64,
    pub conflicts: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushResult {
    pub pushed: i64,
    pub failed: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncStatus {
    pub configured: bool,
    pub last_sync_time: i64,
    pub pending_count: i64,
}

/// Server item format (matches server JSON)
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerItem {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub content: Option<String>,
    pub tags: Vec<String>,
    pub metadata: Option<serde_json::Value>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
struct ServerPullResponse {
    items: Vec<ServerItem>,
}

#[derive(Debug, Deserialize)]
struct ServerPushResponse {
    id: String,
    #[allow(dead_code)]
    created: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PushBody {
    #[serde(rename = "type")]
    item_type: String,
    content: Option<String>,
    tags: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
    sync_id: String,
}

/// Data extracted from an item for pushing (avoids holding Connection across await)
struct ItemPushData {
    id: String,
    body: PushBody,
}

// ==================== Settings Storage ====================

const DEFAULT_SERVER_URL: &str = "https://peek-node.up.railway.app";

/// Get sync configuration from extension_settings
pub fn get_sync_config(conn: &Connection) -> SyncConfig {
    let server_url = get_setting(conn, "sync", "serverUrl")
        .and_then(|v| serde_json::from_str::<String>(&v).ok())
        .unwrap_or_else(|| {
            std::env::var("SYNC_SERVER_URL").unwrap_or_else(|_| DEFAULT_SERVER_URL.to_string())
        });

    let api_key = get_setting(conn, "sync", "apiKey")
        .and_then(|v| serde_json::from_str::<String>(&v).ok())
        .unwrap_or_default();

    let last_sync_time = get_setting(conn, "sync", "lastSyncTime")
        .and_then(|v| v.parse::<i64>().ok())
        .unwrap_or(0);

    let auto_sync = get_setting(conn, "sync", "autoSync")
        .and_then(|v| serde_json::from_str::<bool>(&v).ok())
        .unwrap_or(false);

    SyncConfig {
        server_url,
        api_key,
        last_sync_time,
        auto_sync,
    }
}

/// Save sync configuration to extension_settings
pub fn set_sync_config(conn: &Connection, config: &SyncConfig) -> rusqlite::Result<()> {
    if !config.server_url.is_empty() {
        set_setting(
            conn,
            "sync",
            "serverUrl",
            &serde_json::to_string(&config.server_url).unwrap_or_default(),
        )?;
    }
    if !config.api_key.is_empty() {
        set_setting(
            conn,
            "sync",
            "apiKey",
            &serde_json::to_string(&config.api_key).unwrap_or_default(),
        )?;
    }
    if config.last_sync_time > 0 {
        set_setting(
            conn,
            "sync",
            "lastSyncTime",
            &config.last_sync_time.to_string(),
        )?;
    }
    set_setting(
        conn,
        "sync",
        "autoSync",
        &serde_json::to_string(&config.auto_sync).unwrap_or_default(),
    )?;
    Ok(())
}

/// Get a setting value from extension_settings
fn get_setting(conn: &Connection, extension_id: &str, key: &str) -> Option<String> {
    conn.query_row(
        "SELECT value FROM extension_settings WHERE extensionId = ?1 AND key = ?2",
        params![extension_id, key],
        |row| row.get(0),
    )
    .ok()
}

/// Set a setting value in extension_settings
fn set_setting(
    conn: &Connection,
    extension_id: &str,
    key: &str,
    value: &str,
) -> rusqlite::Result<()> {
    let id = format!("{}-{}", extension_id, key);
    let timestamp = datastore::now();
    conn.execute(
        "INSERT OR REPLACE INTO extension_settings (id, extensionId, key, value, updatedAt) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![id, extension_id, key, value, timestamp],
    )?;
    Ok(())
}

// ==================== Timestamp Conversion ====================

/// Convert Unix milliseconds to ISO 8601 string
fn to_iso_string(unix_ms: i64) -> String {
    let secs = unix_ms / 1000;
    let nanos = ((unix_ms % 1000) * 1_000_000) as u32;
    let dt = chrono::DateTime::from_timestamp(secs, nanos)
        .unwrap_or_else(|| chrono::DateTime::from_timestamp(0, 0).unwrap());
    dt.format("%Y-%m-%dT%H:%M:%S%.3fZ").to_string()
}

/// Convert ISO 8601 string to Unix milliseconds
fn from_iso_string(iso: &str) -> i64 {
    chrono::DateTime::parse_from_rfc3339(iso)
        .or_else(|_| chrono::DateTime::parse_from_str(iso, "%Y-%m-%dT%H:%M:%S%.fZ"))
        .map(|dt| dt.timestamp_millis())
        .unwrap_or(0)
}

// ==================== Server API Helpers ====================

/// Make an authenticated request to the sync server
async fn server_fetch<T: serde::de::DeserializeOwned>(
    client: &reqwest::Client,
    server_url: &str,
    api_key: &str,
    path: &str,
    method: &str,
    body: Option<&PushBody>,
) -> Result<T, String> {
    let url = format!("{}{}", server_url.trim_end_matches('/'), path);

    let mut request = match method {
        "POST" => client.post(&url),
        "PUT" => client.put(&url),
        _ => client.get(&url),
    };

    request = request
        .header("Authorization", format!("Bearer {}", api_key))
        .header("Content-Type", "application/json")
        .header("X-Peek-Datastore-Version", DATASTORE_VERSION.to_string())
        .header("X-Peek-Protocol-Version", PROTOCOL_VERSION.to_string())
        .header("X-Peek-Client", "desktop-tauri");

    if let Some(body) = body {
        request = request.json(body);
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Network error: {}", e))?;

    if !response.status().is_success() {
        let status = response.status().as_u16();
        let error_text = response.text().await.unwrap_or_default();
        return Err(format!("Server error {}: {}", status, error_text));
    }

    // Check server version headers
    let headers = response.headers();
    if let Some(server_ds) = headers.get("X-Peek-Datastore-Version") {
        if let Ok(server_ds_str) = server_ds.to_str() {
            if let Ok(server_ds_num) = server_ds_str.parse::<i64>() {
                if server_ds_num != DATASTORE_VERSION {
                    return Err(format!(
                        "Datastore version mismatch: server={}, client={}. Please update your app.",
                        server_ds_num, DATASTORE_VERSION
                    ));
                }
            }
        }
    }

    if let Some(server_proto) = headers.get("X-Peek-Protocol-Version") {
        if let Ok(server_proto_str) = server_proto.to_str() {
            if let Ok(server_proto_num) = server_proto_str.parse::<i64>() {
                if server_proto_num != PROTOCOL_VERSION {
                    return Err(format!(
                        "Protocol version mismatch: server={}, client={}. Please update your app.",
                        server_proto_num, PROTOCOL_VERSION
                    ));
                }
            }
        }
    }

    response
        .json::<T>()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))
}

// ==================== Pull (Server -> Desktop) ====================

/// Pull items from server and merge into local database.
/// Accepts Arc<Mutex<Connection>> to safely lock/unlock around async boundaries.
pub async fn pull_from_server(
    db: &Arc<Mutex<Connection>>,
    server_url: &str,
    api_key: &str,
    since: Option<i64>,
) -> Result<PullResult, String> {
    if is_sync_disabled_due_to_version() {
        return Err("Sync disabled due to datastore version mismatch".to_string());
    }

    println!(
        "[sync] Pulling from server... {}",
        if let Some(s) = since {
            format!("since {}", to_iso_string(s))
        } else {
            "full".to_string()
        }
    );

    let client = reqwest::Client::new();

    let mut path = String::from("/items");
    if let Some(since_ts) = since {
        if since_ts > 0 {
            path = format!("/items/since/{}", to_iso_string(since_ts));
        }
    }

    // Async HTTP call - no DB lock held
    let response: ServerPullResponse =
        server_fetch(&client, server_url, api_key, &path, "GET", None).await?;

    println!("[sync] Received {} items from server", response.items.len());

    // Now merge items into DB (synchronous, under lock)
    let conn = db.lock().unwrap();
    let mut pulled: i64 = 0;
    let mut conflicts: i64 = 0;

    for server_item in &response.items {
        match merge_server_item(&conn, server_item) {
            Ok(result) => match result.as_str() {
                "pulled" => pulled += 1,
                "conflict" => conflicts += 1,
                _ => {}
            },
            Err(e) => {
                println!("[sync] Error merging item {}: {}", server_item.id, e);
            }
        }
    }
    drop(conn);

    println!(
        "[sync] Pull complete: {} pulled, {} conflicts",
        pulled, conflicts
    );

    Ok(PullResult { pulled, conflicts })
}

/// Merge a single server item into the local database
fn merge_server_item(conn: &Connection, server_item: &ServerItem) -> Result<String, String> {
    // Find local item by syncId matching server id
    let local_item: Option<Item> = conn
        .query_row(
            "SELECT id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived, syncedAt, visitCount, lastVisitAt FROM items WHERE syncId = ?1 AND deletedAt = 0",
            params![server_item.id],
            |row| {
                Ok(Item {
                    id: row.get(0)?,
                    item_type: row.get(1)?,
                    content: row.get(2)?,
                    mime_type: row.get(3)?,
                    metadata: row.get(4)?,
                    sync_id: row.get(5)?,
                    sync_source: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    deleted_at: row.get(9)?,
                    starred: row.get(10)?,
                    archived: row.get(11)?,
                    synced_at: row.get(12)?,
                    visit_count: row.get(13)?,
                    last_visit_at: row.get(14)?,
                })
            },
        )
        .ok();

    let server_updated_at = from_iso_string(&server_item.updated_at);

    if local_item.is_none() {
        // Item doesn't exist locally - insert it
        let options = ItemOptions {
            content: server_item.content.clone(),
            metadata: server_item
                .metadata
                .as_ref()
                .map(|m| serde_json::to_string(m).unwrap_or_else(|_| "{}".to_string())),
            sync_id: Some(server_item.id.clone()),
            sync_source: Some("server".to_string()),
            ..Default::default()
        };

        let local_id = datastore::add_item(conn, &server_item.item_type, &options)
            .map_err(|e| format!("Failed to add item: {}", e))?;

        // Update timestamps to match server
        let now_ts = datastore::now();
        let server_created_at = from_iso_string(&server_item.created_at);
        conn.execute(
            "UPDATE items SET createdAt = ?1, updatedAt = ?2, syncedAt = ?3 WHERE id = ?4",
            params![server_created_at, server_updated_at, now_ts, local_id],
        )
        .map_err(|e| format!("Failed to update timestamps: {}", e))?;

        // Add tags
        sync_tags_to_item(conn, &local_id, &server_item.tags);

        return Ok("pulled".to_string());
    }

    let local = local_item.unwrap();

    // Item exists - check timestamps for conflict resolution
    if server_updated_at > local.updated_at {
        // Server is newer - update local
        let options = ItemOptions {
            content: server_item.content.clone(),
            metadata: server_item
                .metadata
                .as_ref()
                .map(|m| serde_json::to_string(m).unwrap_or_else(|_| "{}".to_string())),
            ..Default::default()
        };

        datastore::update_item(conn, &local.id, &options)
            .map_err(|e| format!("Failed to update item: {}", e))?;

        // Update timestamps
        let now_ts = datastore::now();
        conn.execute(
            "UPDATE items SET updatedAt = ?1, syncedAt = ?2 WHERE id = ?3",
            params![server_updated_at, now_ts, local.id],
        )
        .map_err(|e| format!("Failed to update timestamps: {}", e))?;

        // Update tags
        sync_tags_to_item(conn, &local.id, &server_item.tags);

        return Ok("pulled".to_string());
    }

    if local.updated_at > server_updated_at {
        // Local is newer - conflict, local wins
        return Ok("conflict".to_string());
    }

    // Same timestamp - skip
    Ok("skipped".to_string())
}

/// Sync tags from server to a local item
fn sync_tags_to_item(conn: &Connection, item_id: &str, tag_names: &[String]) {
    // Remove existing tags for this item
    let _ = conn.execute("DELETE FROM item_tags WHERE itemId = ?1", params![item_id]);

    // Add new tags
    for tag_name in tag_names {
        if let Ok((tag, _)) = datastore::get_or_create_tag(conn, tag_name) {
            let _ = datastore::tag_item(conn, item_id, &tag.id);
        }
    }
}

// ==================== Push (Desktop -> Server) ====================

/// Query items that need to be pushed (synchronous, called under lock)
fn query_items_to_push(conn: &Connection, last_sync_time: i64) -> Result<Vec<ItemPushData>, String> {
    let items: Vec<Item> = if last_sync_time > 0 {
        // Incremental: items modified locally after their last sync, or never synced
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived, syncedAt, visitCount, lastVisitAt FROM items WHERE deletedAt = 0 AND (syncSource = '' OR (syncedAt > 0 AND updatedAt > syncedAt))",
            )
            .map_err(|e| format!("Query error: {}", e))?;
        let result: Vec<Item> = stmt
            .query_map([], |row| {
                Ok(Item {
                    id: row.get(0)?,
                    item_type: row.get(1)?,
                    content: row.get(2)?,
                    mime_type: row.get(3)?,
                    metadata: row.get(4)?,
                    sync_id: row.get(5)?,
                    sync_source: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    deleted_at: row.get(9)?,
                    starred: row.get(10)?,
                    archived: row.get(11)?,
                    synced_at: row.get(12)?,
                    visit_count: row.get(13)?,
                    last_visit_at: row.get(14)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
        result
    } else {
        // Full: all items that haven't been synced
        let mut stmt = conn
            .prepare(
                "SELECT id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived, syncedAt, visitCount, lastVisitAt FROM items WHERE deletedAt = 0 AND syncSource = ''",
            )
            .map_err(|e| format!("Query error: {}", e))?;
        let result: Vec<Item> = stmt
            .query_map([], |row| {
                Ok(Item {
                    id: row.get(0)?,
                    item_type: row.get(1)?,
                    content: row.get(2)?,
                    mime_type: row.get(3)?,
                    metadata: row.get(4)?,
                    sync_id: row.get(5)?,
                    sync_source: row.get(6)?,
                    created_at: row.get(7)?,
                    updated_at: row.get(8)?,
                    deleted_at: row.get(9)?,
                    starred: row.get(10)?,
                    archived: row.get(11)?,
                    synced_at: row.get(12)?,
                    visit_count: row.get(13)?,
                    last_visit_at: row.get(14)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?
            .filter_map(|r| r.ok())
            .collect();
        result
    };

    // Build push data for each item (includes tags lookup)
    let mut push_data = Vec::new();
    for item in &items {
        let tags = datastore::get_item_tags(conn, &item.id)
            .map_err(|e| format!("Failed to get tags: {}", e))?;
        let tag_names: Vec<String> = tags.iter().map(|t| t.name.clone()).collect();

        let metadata: Option<serde_json::Value> =
            if !item.metadata.is_empty() && item.metadata != "{}" {
                serde_json::from_str(&item.metadata).ok()
            } else {
                None
            };

        push_data.push(ItemPushData {
            id: item.id.clone(),
            body: PushBody {
                item_type: item.item_type.clone(),
                content: item.content.clone(),
                tags: tag_names,
                metadata,
                sync_id: if item.sync_id.is_empty() {
                    item.id.clone()
                } else {
                    item.sync_id.clone()
                },
            },
        });
    }

    Ok(push_data)
}

/// Push unsynced local items to server.
/// Accepts Arc<Mutex<Connection>> to safely lock/unlock around async boundaries.
pub async fn push_to_server(
    db: &Arc<Mutex<Connection>>,
    server_url: &str,
    api_key: &str,
    last_sync_time: i64,
) -> Result<PushResult, String> {
    if is_sync_disabled_due_to_version() {
        return Err("Sync disabled due to datastore version mismatch".to_string());
    }

    println!(
        "[sync] Pushing to server... {}",
        if last_sync_time > 0 {
            format!("since {}", to_iso_string(last_sync_time))
        } else {
            "all unsynced".to_string()
        }
    );

    // Phase 1: Read items from DB (under lock)
    let push_items = {
        let conn = db.lock().unwrap();
        query_items_to_push(&conn, last_sync_time)?
    };
    // Lock is dropped here

    println!("[sync] Found {} items to push", push_items.len());

    let client = reqwest::Client::new();
    let mut pushed: i64 = 0;
    let mut failed: i64 = 0;

    // Phase 2: Push each item via HTTP (no lock held)
    // Then update DB after each successful push
    for item_data in &push_items {
        let path = "/items";
        match server_fetch::<ServerPushResponse>(
            &client,
            server_url,
            api_key,
            path,
            "POST",
            Some(&item_data.body),
        )
        .await
        {
            Ok(response) => {
                // Phase 3: Update local item with sync info (under lock)
                let conn = db.lock().unwrap();
                let now_ts = datastore::now();
                if let Err(e) = conn.execute(
                    "UPDATE items SET syncId = ?1, syncSource = 'server', syncedAt = ?2 WHERE id = ?3",
                    params![response.id, now_ts, item_data.id],
                ) {
                    println!(
                        "[sync] Failed to update sync info for {}: {}",
                        item_data.id, e
                    );
                    failed += 1;
                } else {
                    pushed += 1;
                }
                drop(conn);
            }
            Err(e) => {
                println!("[sync] Failed to push item {}: {}", item_data.id, e);
                failed += 1;
            }
        }
    }

    println!("[sync] Push complete: {} pushed, {} failed", pushed, failed);

    Ok(PushResult { pushed, failed })
}

// ==================== Full Bidirectional Sync ====================

/// Perform a full bidirectional sync.
/// Accepts Arc<Mutex<Connection>> to safely lock/unlock around async boundaries.
pub async fn sync_all(db: &Arc<Mutex<Connection>>) -> Result<SyncResult, String> {
    let (config, start_time) = {
        let conn = db.lock().unwrap();
        let config = get_sync_config(&conn);
        let start_time = datastore::now();
        (config, start_time)
    };

    if config.api_key.is_empty() {
        return Err("Sync not configured: no API key".to_string());
    }

    println!("[sync] Starting full sync...");

    // Pull first (to get any server changes)
    let pull_result = pull_from_server(
        db,
        &config.server_url,
        &config.api_key,
        if config.last_sync_time > 0 {
            Some(config.last_sync_time)
        } else {
            None
        },
    )
    .await?;

    // Then push local changes
    let push_result =
        push_to_server(db, &config.server_url, &config.api_key, config.last_sync_time).await?;

    // Update last sync time (under lock)
    {
        let conn = db.lock().unwrap();
        set_setting(&conn, "sync", "lastSyncTime", &start_time.to_string())
            .map_err(|e| format!("Failed to update lastSyncTime: {}", e))?;
    }

    println!(
        "[sync] Sync complete: {} pulled, {} pushed, {} conflicts",
        pull_result.pulled, push_result.pushed, pull_result.conflicts
    );

    Ok(SyncResult {
        pulled: pull_result.pulled,
        pushed: push_result.pushed,
        conflicts: pull_result.conflicts,
        last_sync_time: start_time,
    })
}

// ==================== Status ====================

/// Get current sync status
pub fn get_sync_status(conn: &Connection) -> SyncStatus {
    let config = get_sync_config(conn);

    // Count items that need to be synced
    let pending_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM items WHERE deletedAt = 0 AND (syncSource = '' OR (syncedAt > 0 AND updatedAt > syncedAt))",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    SyncStatus {
        configured: !config.server_url.is_empty() && !config.api_key.is_empty(),
        last_sync_time: config.last_sync_time,
        pending_count,
    }
}
