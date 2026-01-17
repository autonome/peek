use chrono::Utc;
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::ffi::CStr;
use std::os::raw::c_char;
use std::path::PathBuf;
use reqwest;
use regex::Regex;

// Item types for unified data model
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
enum ItemType {
    Page,
    Text,
    Tagset,
}

impl ItemType {
    fn as_str(&self) -> &'static str {
        match self {
            ItemType::Page => "page",
            ItemType::Text => "text",
            ItemType::Tagset => "tagset",
        }
    }

    fn from_str(s: &str) -> Option<ItemType> {
        match s {
            "page" => Some(ItemType::Page),
            "text" => Some(ItemType::Text),
            "tagset" => Some(ItemType::Tagset),
            _ => None,
        }
    }
}

// Unified item model
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedItem {
    id: String,
    #[serde(rename = "type")]
    item_type: ItemType,
    url: Option<String>,
    content: Option<String>,
    tags: Vec<String>,
    saved_at: String,
}

// Legacy model for backward compatibility (webhook, etc.)
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedUrl {
    id: String,
    url: String,
    tags: Vec<String>,
    saved_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
}

// Text item for webhook
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedText {
    id: String,
    content: String,
    tags: Vec<String>,
    saved_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
}

// Tagset item for webhook
#[derive(Debug, Clone, Serialize, Deserialize)]
struct SavedTagset {
    id: String,
    tags: Vec<String>,
    saved_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    metadata: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TagStats {
    name: String,
    frequency: u32,
    last_used: String,
    frecency_score: f64,
}

// Webhook payload with all item types
#[derive(Debug, Clone, Serialize, Deserialize)]
struct WebhookPayload {
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    urls: Vec<SavedUrl>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    texts: Vec<SavedText>,
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    tagsets: Vec<SavedTagset>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SyncResult {
    success: bool,
    synced_count: usize,
    message: String,
}

// App Group bridge - just need the container path now
extern "C" {
    fn get_app_group_container_path() -> *const c_char;
    fn get_system_is_dark_mode() -> i32;
}

fn get_db_path() -> Option<PathBuf> {
    unsafe {
        let c_str = get_app_group_container_path();
        if c_str.is_null() {
            println!("[Rust] Failed to get App Group container path");
            return None;
        }
        let path_str = CStr::from_ptr(c_str).to_string_lossy().to_string();
        libc::free(c_str as *mut libc::c_void);
        Some(PathBuf::from(path_str).join("peek.db"))
    }
}

use std::sync::Once;

static DB_INIT: Once = Once::new();

fn ensure_database_initialized() -> Result<(), String> {
    let mut init_result: Result<(), String> = Ok(());

    DB_INIT.call_once(|| {
        let db_path = match get_db_path() {
            Some(p) => p,
            None => {
                init_result = Err("Failed to get database path".to_string());
                return;
            }
        };

        println!("[Rust] Initializing database at: {:?}", db_path);

        let conn = match Connection::open(&db_path) {
            Ok(c) => c,
            Err(e) => {
                init_result = Err(format!("Failed to open database: {}", e));
                return;
            }
        };

        // Enable WAL mode for concurrent access from main app and share extension
        if let Err(e) = conn.execute_batch("PRAGMA journal_mode=WAL;") {
            init_result = Err(format!("Failed to set WAL mode: {}", e));
            return;
        }

        // Check if we need to migrate from old schema (urls table) to new schema (items table)
        let has_urls_table: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='urls'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;

        let has_items_table: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='items'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;

        if has_urls_table && !has_items_table {
            // Migration needed: urls -> items
            println!("[Rust] Migrating database from urls to items schema...");
            if let Err(e) = conn.execute_batch(
                "
                -- Create new items table
                CREATE TABLE items (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL DEFAULT 'page',
                    url TEXT,
                    content TEXT,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                );

                -- Migrate data from urls to items
                INSERT INTO items (id, type, url, created_at, updated_at, deleted_at)
                    SELECT id, 'page', url, created_at, updated_at, deleted_at FROM urls;

                -- Create new item_tags table
                CREATE TABLE item_tags (
                    item_id TEXT NOT NULL,
                    tag_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (item_id, tag_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                );

                -- Migrate data from url_tags to item_tags
                INSERT INTO item_tags (item_id, tag_id, created_at)
                    SELECT url_id, tag_id, created_at FROM url_tags;

                -- Drop old tables
                DROP TABLE url_tags;
                DROP TABLE urls;

                -- Create indexes for new tables
                CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
                CREATE INDEX IF NOT EXISTS idx_items_url ON items(url);
                CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
                ",
            ) {
                init_result = Err(format!("Failed to migrate database: {}", e));
                return;
            }
            println!("[Rust] Database migration completed successfully");
        } else if !has_items_table {
            // Fresh install: create new schema
            if let Err(e) = conn.execute_batch(
                "
                CREATE TABLE IF NOT EXISTS items (
                    id TEXT PRIMARY KEY,
                    type TEXT NOT NULL DEFAULT 'page',
                    url TEXT,
                    content TEXT,
                    metadata TEXT,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    deleted_at TEXT
                );

                CREATE TABLE IF NOT EXISTS tags (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name TEXT NOT NULL UNIQUE,
                    frequency INTEGER NOT NULL DEFAULT 0,
                    last_used TEXT NOT NULL,
                    frecency_score REAL NOT NULL DEFAULT 0.0,
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS item_tags (
                    item_id TEXT NOT NULL,
                    tag_id INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (item_id, tag_id),
                    FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                );

                CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
                CREATE INDEX IF NOT EXISTS idx_items_url ON items(url);
                CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
                CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
                CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecency_score DESC);

                CREATE TABLE IF NOT EXISTS settings (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL
                );
                ",
            ) {
                init_result = Err(format!("Failed to create tables: {}", e));
                return;
            }
        }

        // Add metadata column if it doesn't exist (for existing installs)
        let has_metadata_column: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM pragma_table_info('items') WHERE name='metadata'",
                [],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;

        if !has_metadata_column {
            println!("[Rust] Adding metadata column to items table...");
            if let Err(e) = conn.execute("ALTER TABLE items ADD COLUMN metadata TEXT", []) {
                println!("[Rust] Warning: Failed to add metadata column: {}", e);
                // Not fatal - column may already exist
            }
        }

        // Ensure tags and settings tables exist (for migration case)
        if let Err(e) = conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                frequency INTEGER NOT NULL DEFAULT 0,
                last_used TEXT NOT NULL,
                frecency_score REAL NOT NULL DEFAULT 0.0,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
            CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecency_score DESC);
            ",
        ) {
            init_result = Err(format!("Failed to ensure auxiliary tables: {}", e));
            return;
        }

        println!("[Rust] Database initialized successfully");
    });

    init_result
}

fn get_connection() -> Result<Connection, String> {
    // Ensure tables exist (only runs once)
    ensure_database_initialized()?;

    // Open a fresh connection for thread safety
    let db_path = get_db_path().ok_or("Failed to get database path")?;
    let conn = Connection::open(&db_path).map_err(|e| format!("Failed to open database: {}", e))?;

    // Set WAL mode on this connection too
    conn.execute_batch("PRAGMA journal_mode=WAL;")
        .map_err(|e| format!("Failed to set WAL mode: {}", e))?;

    Ok(conn)
}

// Parse hashtags from text content
fn parse_hashtags(content: &str) -> Vec<String> {
    let re = Regex::new(r"#(\w+)").unwrap();
    re.captures_iter(content)
        .map(|cap| cap[1].to_lowercase())
        .collect()
}

// Calculate frecency score
fn calculate_frecency(frequency: u32, last_used: &str) -> f64 {
    let now = Utc::now();
    let last_used_time = chrono::DateTime::parse_from_rfc3339(last_used)
        .unwrap_or_else(|_| now.into())
        .with_timezone(&Utc);

    let days_since_use = (now - last_used_time).num_days() as f64;
    let decay_factor = 1.0 / (1.0 + days_since_use / 7.0);

    frequency as f64 * 10.0 * decay_factor
}

// Helper to get webhook config
fn get_webhook_config() -> (Option<String>, Option<String>) {
    match get_connection() {
        Ok(conn) => {
            let url = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'webhook_url'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .ok();
            let key = conn
                .query_row(
                    "SELECT value FROM settings WHERE key = 'webhook_api_key'",
                    [],
                    |row| row.get::<_, String>(0),
                )
                .ok();
            (url, key)
        }
        Err(_) => (None, None),
    }
}

// Helper function to push a single URL to webhook (fire and forget)
async fn push_url_to_webhook(saved_url: SavedUrl) {
    let (webhook_url, api_key) = get_webhook_config();

    if let Some(url) = webhook_url {
        if !url.is_empty() {
            println!("[Rust] Pushing URL to webhook: {}", saved_url.url);
            let client = reqwest::Client::new();
            let payload = WebhookPayload {
                urls: vec![saved_url],
                texts: vec![],
                tagsets: vec![],
            };

            let mut request = client.post(&url).json(&payload);

            if let Some(key) = api_key {
                if !key.is_empty() {
                    request = request.header("Authorization", format!("Bearer {}", key));
                }
            }

            match request.send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("[Rust] Webhook push successful");
                    } else {
                        println!("[Rust] Webhook returned error: {}", response.status());
                    }
                }
                Err(e) => {
                    println!("[Rust] Failed to push to webhook: {}", e);
                }
            }
        }
    }
}

// Helper function to push a single text to webhook (fire and forget)
async fn push_text_to_webhook(saved_text: SavedText) {
    let (webhook_url, api_key) = get_webhook_config();

    if let Some(url) = webhook_url {
        if !url.is_empty() {
            println!("[Rust] Pushing text to webhook");
            let client = reqwest::Client::new();
            let payload = WebhookPayload {
                urls: vec![],
                texts: vec![saved_text],
                tagsets: vec![],
            };

            let mut request = client.post(&url).json(&payload);

            if let Some(key) = api_key {
                if !key.is_empty() {
                    request = request.header("Authorization", format!("Bearer {}", key));
                }
            }

            match request.send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("[Rust] Webhook push successful");
                    } else {
                        println!("[Rust] Webhook returned error: {}", response.status());
                    }
                }
                Err(e) => {
                    println!("[Rust] Failed to push to webhook: {}", e);
                }
            }
        }
    }
}

// Helper function to push a single tagset to webhook (fire and forget)
async fn push_tagset_to_webhook(saved_tagset: SavedTagset) {
    let (webhook_url, api_key) = get_webhook_config();

    if let Some(url) = webhook_url {
        if !url.is_empty() {
            println!("[Rust] Pushing tagset to webhook");
            let client = reqwest::Client::new();
            let payload = WebhookPayload {
                urls: vec![],
                texts: vec![],
                tagsets: vec![saved_tagset],
            };

            let mut request = client.post(&url).json(&payload);

            if let Some(key) = api_key {
                if !key.is_empty() {
                    request = request.header("Authorization", format!("Bearer {}", key));
                }
            }

            match request.send().await {
                Ok(response) => {
                    if response.status().is_success() {
                        println!("[Rust] Webhook push successful");
                    } else {
                        println!("[Rust] Webhook returned error: {}", response.status());
                    }
                }
                Err(e) => {
                    println!("[Rust] Failed to push to webhook: {}", e);
                }
            }
        }
    }
}

// Commands
#[tauri::command]
fn get_shared_url() -> Result<Option<String>, String> {
    // Deprecated - kept for compatibility
    Ok(None)
}

#[tauri::command]
async fn save_url(url: String, tags: Vec<String>, metadata: Option<serde_json::Value>) -> Result<(), String> {
    println!("[Rust] save_url called with url: {}, tags: {:?}, metadata: {:?}", url, tags, metadata);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let metadata_json = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());

    // Check if URL already exists (as a page type)
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM items WHERE type = 'page' AND url = ? AND deleted_at IS NULL",
            params![&url],
            |row| row.get(0),
        )
        .ok();

    let item_id = if let Some(existing) = existing_id {
        // Update existing item (update metadata if provided)
        if metadata_json.is_some() {
            conn.execute(
                "UPDATE items SET updated_at = ?, metadata = ? WHERE id = ?",
                params![&now, &metadata_json, &existing],
            )
            .map_err(|e| format!("Failed to update item: {}", e))?;
        } else {
            conn.execute(
                "UPDATE items SET updated_at = ? WHERE id = ?",
                params![&now, &existing],
            )
            .map_err(|e| format!("Failed to update item: {}", e))?;
        }

        // Remove old tag associations
        conn.execute("DELETE FROM item_tags WHERE item_id = ?", params![&existing])
            .map_err(|e| format!("Failed to remove old tags: {}", e))?;

        existing
    } else {
        // Insert new page item
        conn.execute(
            "INSERT INTO items (id, type, url, metadata, created_at, updated_at) VALUES (?, 'page', ?, ?, ?, ?)",
            params![&id, &url, &metadata_json, &now, &now],
        )
        .map_err(|e| format!("Failed to insert item: {}", e))?;

        id
    };

    // Add tags
    for tag_name in &tags {
        // Get or create tag
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(id) => {
                // Update existing tag stats
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                id
            }
            Err(_) => {
                // Create new tag
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        // Create item-tag association
        conn.execute(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&item_id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Page saved successfully");

    // Push to webhook (fire and forget - don't block on it)
    let saved_url = SavedUrl {
        id: item_id,
        url,
        tags,
        saved_at: now,
        metadata,
    };
    tauri::async_runtime::spawn(async move {
        push_url_to_webhook(saved_url).await;
    });

    Ok(())
}

/// Extract domain from URL, removing www. prefix if present
fn extract_domain(url: &str) -> Option<String> {
    url::Url::parse(url)
        .ok()
        .and_then(|u| u.host_str().map(|h| {
            if h.starts_with("www.") {
                h[4..].to_string()
            } else {
                h.to_string()
            }
        }))
}

#[tauri::command]
async fn get_tags_by_frecency() -> Result<Vec<TagStats>, String> {
    let conn = get_connection()?;

    let mut stmt = conn
        .prepare("SELECT name, frequency, last_used, frecency_score FROM tags ORDER BY frecency_score DESC")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let tags: Vec<TagStats> = stmt
        .query_map([], |row| {
            Ok(TagStats {
                name: row.get(0)?,
                frequency: row.get(1)?,
                last_used: row.get(2)?,
                frecency_score: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    Ok(tags)
}

/// Get tags sorted by frecency with domain affinity boost
/// Tags used on URLs from the same domain get a 2x score multiplier
#[tauri::command]
async fn get_tags_by_frecency_for_url(url: String) -> Result<Vec<TagStats>, String> {
    let domain = match extract_domain(&url) {
        Some(d) => d,
        None => return get_tags_by_frecency().await, // Fall back to regular frecency
    };

    let conn = get_connection()?;

    // Get all tags with their IDs
    let mut stmt = conn
        .prepare("SELECT id, name, frequency, last_used, frecency_score FROM tags")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let tags_with_ids: Vec<(i64, TagStats)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                TagStats {
                    name: row.get(1)?,
                    frequency: row.get(2)?,
                    last_used: row.get(3)?,
                    frecency_score: row.get(4)?,
                },
            ))
        })
        .map_err(|e| format!("Failed to query tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Get tag IDs used on URLs with the same domain
    let domain_pattern = format!("%://{}/%", domain);
    let domain_pattern_root = format!("%://{}", domain);
    let www_domain_pattern = format!("%://www.{}/%", domain);
    let www_domain_pattern_root = format!("%://www.{}", domain);

    let mut domain_stmt = conn
        .prepare(
            "SELECT DISTINCT it.tag_id
             FROM item_tags it
             JOIN items i ON it.item_id = i.id
             WHERE i.deleted_at IS NULL AND i.type = 'page'
               AND (i.url LIKE ?1 OR i.url LIKE ?2 OR i.url LIKE ?3 OR i.url LIKE ?4)",
        )
        .map_err(|e| format!("Failed to prepare domain query: {}", e))?;

    let domain_tag_ids: std::collections::HashSet<i64> = domain_stmt
        .query_map(
            params![&domain_pattern, &domain_pattern_root, &www_domain_pattern, &www_domain_pattern_root],
            |row| row.get(0),
        )
        .map_err(|e| format!("Failed to query domain tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Apply 2x multiplier to tags used on same-domain URLs and sort
    let mut boosted_tags: Vec<TagStats> = tags_with_ids
        .into_iter()
        .map(|(id, mut tag)| {
            if domain_tag_ids.contains(&id) {
                tag.frecency_score *= 2.0;
            }
            tag
        })
        .collect();

    boosted_tags.sort_by(|a, b| b.frecency_score.partial_cmp(&a.frecency_score).unwrap_or(std::cmp::Ordering::Equal));

    Ok(boosted_tags)
}

/// Get saved pages (URLs) - backward compatible, returns only page type items
#[tauri::command]
async fn get_saved_urls() -> Result<Vec<SavedUrl>, String> {
    let conn = get_connection()?;

    // Get all non-deleted pages (type='page')
    let mut stmt = conn
        .prepare(
            "SELECT id, url, created_at, metadata FROM items WHERE type = 'page' AND deleted_at IS NULL ORDER BY COALESCE(updated_at, created_at) DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let url_rows: Vec<(String, String, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .map_err(|e| format!("Failed to query pages: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    // Get tags for each item
    let mut urls: Vec<SavedUrl> = Vec::new();
    for (id, url, created_at, metadata_json) in url_rows {
        let mut tag_stmt = conn
            .prepare(
                "SELECT t.name FROM tags t
                 JOIN item_tags it ON t.id = it.tag_id
                 WHERE it.item_id = ?
                 ORDER BY t.name",
            )
            .map_err(|e| format!("Failed to prepare tag query: {}", e))?;

        let tags: Vec<String> = tag_stmt
            .query_map(params![&id], |row| row.get(0))
            .map_err(|e| format!("Failed to query tags for item: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        let metadata = metadata_json.and_then(|s| serde_json::from_str(&s).ok());

        urls.push(SavedUrl {
            id,
            url,
            tags,
            saved_at: created_at,
            metadata,
        });
    }

    Ok(urls)
}

/// Delete any item by ID (works for pages, texts, tagsets)
#[tauri::command]
async fn delete_url(id: String) -> Result<(), String> {
    println!("[Rust] delete_url/delete_item called for id: {}", id);

    let conn = get_connection()?;

    // Delete tag associations first
    conn.execute("DELETE FROM item_tags WHERE item_id = ?", params![&id])
        .map_err(|e| format!("Failed to delete item tags: {}", e))?;

    // Hard delete the item
    conn.execute("DELETE FROM items WHERE id = ?", params![&id])
        .map_err(|e| format!("Failed to delete item: {}", e))?;

    println!("[Rust] Item deleted successfully");
    Ok(())
}

/// Update a page (URL) item - backward compatible
#[tauri::command]
async fn update_url(id: String, url: String, tags: Vec<String>) -> Result<(), String> {
    println!("[Rust] update_url called for id: {}, url: {}, tags: {:?}", id, url, tags);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Verify item exists and is a page
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM items WHERE id = ? AND type = 'page' AND deleted_at IS NULL",
            params![&id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !exists {
        return Err("Page not found".to_string());
    }

    // Update URL value and timestamp
    conn.execute(
        "UPDATE items SET url = ?, updated_at = ? WHERE id = ?",
        params![&url, &now, &id],
    )
    .map_err(|e| format!("Failed to update item: {}", e))?;

    // Get existing tags for this item
    let mut existing_tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?",
        )
        .map_err(|e| format!("Failed to prepare existing tags query: {}", e))?;

    let existing_tags: std::collections::HashSet<String> = existing_tag_stmt
        .query_map(params![&id], |row| row.get(0))
        .map_err(|e| format!("Failed to query existing tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let new_tags_set: std::collections::HashSet<String> = tags.iter().cloned().collect();

    // Determine which tags are being added vs removed
    let tags_to_add: Vec<&String> = new_tags_set.difference(&existing_tags).collect();
    let tags_to_remove: Vec<&String> = existing_tags.difference(&new_tags_set).collect();

    // Remove only the tags that were actually removed
    for tag_name in &tags_to_remove {
        conn.execute(
            "DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
            params![&id, tag_name],
        )
        .map_err(|e| format!("Failed to remove tag association: {}", e))?;
    }

    // Add only the tags that are new to this item
    for tag_name in &tags_to_add {
        // Get or create tag
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                // Update existing tag stats
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                // Create new tag
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        // Create item-tag association
        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Page updated successfully");

    // Push to webhook (fire and forget)
    let saved_url = SavedUrl {
        id,
        url,
        tags,
        saved_at: now,
        metadata: None,
    };
    tauri::async_runtime::spawn(async move {
        push_url_to_webhook(saved_url).await;
    });

    Ok(())
}

/// Update tags for any item (legacy function - kept for backward compatibility)
#[tauri::command]
async fn update_url_tags(id: String, tags: Vec<String>) -> Result<(), String> {
    println!("[Rust] update_url_tags called for id: {}, tags: {:?}", id, tags);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Verify item exists
    let item_info: Option<(String, Option<String>)> = conn
        .query_row(
            "SELECT type, url FROM items WHERE id = ? AND deleted_at IS NULL",
            params![&id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .ok();

    let (item_type, url_opt) = match item_info {
        Some(info) => info,
        None => return Err("Item not found".to_string()),
    };

    // Get existing tags for this item
    let mut existing_tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?",
        )
        .map_err(|e| format!("Failed to prepare existing tags query: {}", e))?;

    let existing_tags: std::collections::HashSet<String> = existing_tag_stmt
        .query_map(params![&id], |row| row.get(0))
        .map_err(|e| format!("Failed to query existing tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let new_tags_set: std::collections::HashSet<String> = tags.iter().cloned().collect();

    // Determine which tags are being added vs removed
    let tags_to_add: Vec<&String> = new_tags_set.difference(&existing_tags).collect();
    let tags_to_remove: Vec<&String> = existing_tags.difference(&new_tags_set).collect();

    // Update item's updated_at timestamp
    conn.execute(
        "UPDATE items SET updated_at = ? WHERE id = ?",
        params![&now, &id],
    )
    .map_err(|e| format!("Failed to update item: {}", e))?;

    // Remove only the tags that were actually removed
    for tag_name in &tags_to_remove {
        conn.execute(
            "DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
            params![&id, tag_name],
        )
        .map_err(|e| format!("Failed to remove tag association: {}", e))?;
    }

    // Add only the tags that are new to this item
    for tag_name in &tags_to_add {
        // Get or create tag
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                // Update existing tag stats
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                // Create new tag
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        // Create item-tag association
        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Item tags updated successfully");

    // Push to webhook (fire and forget) - only for page types
    if item_type == "page" {
        if let Some(url) = url_opt {
            let saved_url = SavedUrl {
                id,
                url,
                tags,
                saved_at: now,
                metadata: None,
            };
            tauri::async_runtime::spawn(async move {
                push_url_to_webhook(saved_url).await;
            });
        }
    }

    Ok(())
}

/// Save a text item with hashtags auto-parsed as tags
#[tauri::command]
async fn save_text(content: String, extra_tags: Option<Vec<String>>, metadata: Option<serde_json::Value>) -> Result<(), String> {
    println!("[Rust] save_text called with content: {}", &content[..content.len().min(50)]);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let metadata_json = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());

    // Parse hashtags from content and merge with extra tags
    let mut tags = parse_hashtags(&content);
    if let Some(extra) = extra_tags {
        for tag in extra {
            let normalized = tag.trim().to_lowercase();
            if !normalized.is_empty() && !tags.contains(&normalized) {
                tags.push(normalized);
            }
        }
    }
    println!("[Rust] Final tags (parsed + extra): {:?}", tags);

    // Insert text item
    conn.execute(
        "INSERT INTO items (id, type, content, metadata, created_at, updated_at) VALUES (?, 'text', ?, ?, ?, ?)",
        params![&id, &content, &metadata_json, &now, &now],
    )
    .map_err(|e| format!("Failed to insert text item: {}", e))?;

    // Add tags
    for tag_name in &tags {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Text saved successfully");

    // Push to webhook (fire and forget)
    let saved_text = SavedText {
        id,
        content,
        tags,
        saved_at: now,
        metadata,
    };
    tauri::async_runtime::spawn(async move {
        push_text_to_webhook(saved_text).await;
    });

    Ok(())
}

/// Save a tagset (tags only, no content)
#[tauri::command]
async fn save_tagset(tags: Vec<String>, metadata: Option<serde_json::Value>) -> Result<(), String> {
    println!("[Rust] save_tagset called with tags: {:?}", tags);

    if tags.is_empty() {
        return Err("At least one tag is required for a tagset".to_string());
    }

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();
    let id = uuid::Uuid::new_v4().to_string();
    let metadata_json = metadata.as_ref().map(|m| serde_json::to_string(m).unwrap_or_default());

    // Insert tagset item
    conn.execute(
        "INSERT INTO items (id, type, metadata, created_at, updated_at) VALUES (?, 'tagset', ?, ?, ?)",
        params![&id, &metadata_json, &now, &now],
    )
    .map_err(|e| format!("Failed to insert tagset item: {}", e))?;

    // Add tags
    for tag_name in &tags {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT OR IGNORE INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Tagset saved successfully");

    // Push to webhook (fire and forget)
    let saved_tagset = SavedTagset {
        id,
        tags,
        saved_at: now,
        metadata,
    };
    tauri::async_runtime::spawn(async move {
        push_tagset_to_webhook(saved_tagset).await;
    });

    Ok(())
}

/// Get all saved text items
#[tauri::command]
async fn get_saved_texts() -> Result<Vec<SavedText>, String> {
    let conn = get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, content, created_at, metadata FROM items WHERE type = 'text' AND deleted_at IS NULL ORDER BY COALESCE(updated_at, created_at) DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows: Vec<(String, String, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)))
        .map_err(|e| format!("Failed to query texts: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut texts: Vec<SavedText> = Vec::new();
    for (id, content, created_at, metadata_json) in rows {
        let mut tag_stmt = conn
            .prepare(
                "SELECT t.name FROM tags t
                 JOIN item_tags it ON t.id = it.tag_id
                 WHERE it.item_id = ?
                 ORDER BY t.name",
            )
            .map_err(|e| format!("Failed to prepare tag query: {}", e))?;

        let tags: Vec<String> = tag_stmt
            .query_map(params![&id], |row| row.get(0))
            .map_err(|e| format!("Failed to query tags: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        let metadata = metadata_json.and_then(|s| serde_json::from_str(&s).ok());

        texts.push(SavedText {
            id,
            content,
            tags,
            saved_at: created_at,
            metadata,
        });
    }

    Ok(texts)
}

/// Get all saved tagsets
#[tauri::command]
async fn get_saved_tagsets() -> Result<Vec<SavedTagset>, String> {
    let conn = get_connection()?;

    let mut stmt = conn
        .prepare(
            "SELECT id, created_at, metadata FROM items WHERE type = 'tagset' AND deleted_at IS NULL ORDER BY COALESCE(updated_at, created_at) DESC",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let rows: Vec<(String, String, Option<String>)> = stmt
        .query_map([], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)))
        .map_err(|e| format!("Failed to query tagsets: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let mut tagsets: Vec<SavedTagset> = Vec::new();
    for (id, created_at, metadata_json) in rows {
        let mut tag_stmt = conn
            .prepare(
                "SELECT t.name FROM tags t
                 JOIN item_tags it ON t.id = it.tag_id
                 WHERE it.item_id = ?
                 ORDER BY t.name",
            )
            .map_err(|e| format!("Failed to prepare tag query: {}", e))?;

        let tags: Vec<String> = tag_stmt
            .query_map(params![&id], |row| row.get(0))
            .map_err(|e| format!("Failed to query tags: {}", e))?
            .filter_map(|r| r.ok())
            .collect();

        let metadata = metadata_json.and_then(|s| serde_json::from_str(&s).ok());

        tagsets.push(SavedTagset {
            id,
            tags,
            saved_at: created_at,
            metadata,
        });
    }

    Ok(tagsets)
}

/// Update a text item
#[tauri::command]
async fn update_text(id: String, content: String) -> Result<(), String> {
    println!("[Rust] update_text called for id: {}", id);

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Verify item exists and is a text type
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM items WHERE id = ? AND type = 'text' AND deleted_at IS NULL",
            params![&id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !exists {
        return Err("Text not found".to_string());
    }

    // Update content and timestamp
    conn.execute(
        "UPDATE items SET content = ?, updated_at = ? WHERE id = ?",
        params![&content, &now, &id],
    )
    .map_err(|e| format!("Failed to update text: {}", e))?;

    // Re-parse hashtags and update tags
    let new_tags = parse_hashtags(&content);

    // Get existing tags
    let mut existing_tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?",
        )
        .map_err(|e| format!("Failed to prepare existing tags query: {}", e))?;

    let existing_tags: std::collections::HashSet<String> = existing_tag_stmt
        .query_map(params![&id], |row| row.get(0))
        .map_err(|e| format!("Failed to query existing tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let new_tags_set: std::collections::HashSet<String> = new_tags.iter().cloned().collect();
    let tags_to_add: Vec<&String> = new_tags_set.difference(&existing_tags).collect();
    let tags_to_remove: Vec<&String> = existing_tags.difference(&new_tags_set).collect();

    // Remove old tags
    for tag_name in &tags_to_remove {
        conn.execute(
            "DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
            params![&id, tag_name],
        )
        .map_err(|e| format!("Failed to remove tag: {}", e))?;
    }

    // Add new tags
    for tag_name in &tags_to_add {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Text updated successfully");

    // Push to webhook
    let saved_text = SavedText {
        id,
        content,
        tags: new_tags,
        saved_at: now,
        metadata: None,
    };
    tauri::async_runtime::spawn(async move {
        push_text_to_webhook(saved_text).await;
    });

    Ok(())
}

/// Update a tagset's tags
#[tauri::command]
async fn update_tagset(id: String, tags: Vec<String>) -> Result<(), String> {
    println!("[Rust] update_tagset called for id: {}, tags: {:?}", id, tags);

    if tags.is_empty() {
        return Err("At least one tag is required for a tagset".to_string());
    }

    let conn = get_connection()?;
    let now = Utc::now().to_rfc3339();

    // Verify item exists and is a tagset type
    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM items WHERE id = ? AND type = 'tagset' AND deleted_at IS NULL",
            params![&id],
            |_| Ok(true),
        )
        .unwrap_or(false);

    if !exists {
        return Err("Tagset not found".to_string());
    }

    // Update timestamp
    conn.execute(
        "UPDATE items SET updated_at = ? WHERE id = ?",
        params![&now, &id],
    )
    .map_err(|e| format!("Failed to update tagset: {}", e))?;

    // Get existing tags
    let mut existing_tag_stmt = conn
        .prepare(
            "SELECT t.name FROM tags t
             JOIN item_tags it ON t.id = it.tag_id
             WHERE it.item_id = ?",
        )
        .map_err(|e| format!("Failed to prepare existing tags query: {}", e))?;

    let existing_tags: std::collections::HashSet<String> = existing_tag_stmt
        .query_map(params![&id], |row| row.get(0))
        .map_err(|e| format!("Failed to query existing tags: {}", e))?
        .filter_map(|r| r.ok())
        .collect();

    let new_tags_set: std::collections::HashSet<String> = tags.iter().cloned().collect();
    let tags_to_add: Vec<&String> = new_tags_set.difference(&existing_tags).collect();
    let tags_to_remove: Vec<&String> = existing_tags.difference(&new_tags_set).collect();

    // Remove old tags
    for tag_name in &tags_to_remove {
        conn.execute(
            "DELETE FROM item_tags WHERE item_id = ? AND tag_id = (SELECT id FROM tags WHERE name = ?)",
            params![&id, tag_name],
        )
        .map_err(|e| format!("Failed to remove tag: {}", e))?;
    }

    // Add new tags
    for tag_name in &tags_to_add {
        let tag_id: i64 = match conn.query_row(
            "SELECT id FROM tags WHERE name = ?",
            params![tag_name],
            |row| row.get(0),
        ) {
            Ok(existing_id) => {
                let frequency: u32 = conn
                    .query_row(
                        "SELECT frequency FROM tags WHERE id = ?",
                        params![existing_id],
                        |row| row.get(0),
                    )
                    .unwrap_or(0);

                let new_frequency = frequency + 1;
                let frecency = calculate_frecency(new_frequency, &now);

                conn.execute(
                    "UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ? WHERE id = ?",
                    params![new_frequency, &now, frecency, &now, existing_id],
                )
                .map_err(|e| format!("Failed to update tag: {}", e))?;

                existing_id
            }
            Err(_) => {
                let frecency = calculate_frecency(1, &now);
                conn.execute(
                    "INSERT INTO tags (name, frequency, last_used, frecency_score, created_at, updated_at) VALUES (?, 1, ?, ?, ?, ?)",
                    params![tag_name, &now, frecency, &now, &now],
                )
                .map_err(|e| format!("Failed to insert tag: {}", e))?;

                conn.last_insert_rowid()
            }
        };

        conn.execute(
            "INSERT INTO item_tags (item_id, tag_id, created_at) VALUES (?, ?, ?)",
            params![&id, tag_id, &now],
        )
        .map_err(|e| format!("Failed to link tag: {}", e))?;
    }

    println!("[Rust] Tagset updated successfully");

    // Push to webhook
    let saved_tagset = SavedTagset {
        id,
        tags,
        saved_at: now,
        metadata: None,
    };
    tauri::async_runtime::spawn(async move {
        push_tagset_to_webhook(saved_tagset).await;
    });

    Ok(())
}

#[tauri::command]
fn is_dark_mode() -> bool {
    unsafe { get_system_is_dark_mode() != 0 }
}

#[tauri::command]
async fn get_webhook_url() -> Result<Option<String>, String> {
    let conn = get_connection()?;

    let url: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webhook_url'",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(url)
}

#[tauri::command]
async fn get_webhook_api_key() -> Result<Option<String>, String> {
    let conn = get_connection()?;

    let key: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webhook_api_key'",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(key)
}

#[tauri::command]
async fn set_webhook_api_key(key: String) -> Result<(), String> {
    println!("[Rust] set_webhook_api_key called");
    let conn = get_connection()?;

    if key.is_empty() {
        conn.execute("DELETE FROM settings WHERE key = 'webhook_api_key'", [])
            .map_err(|e| format!("Failed to delete API key: {}", e))?;
    } else {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('webhook_api_key', ?)",
            params![&key],
        )
        .map_err(|e| format!("Failed to save API key: {}", e))?;
    }

    println!("[Rust] API key saved successfully");
    Ok(())
}

#[tauri::command]
async fn set_webhook_url(url: String) -> Result<(), String> {
    println!("[Rust] set_webhook_url called with url: {}", url);
    let conn = get_connection()?;

    if url.is_empty() {
        conn.execute("DELETE FROM settings WHERE key = 'webhook_url'", [])
            .map_err(|e| format!("Failed to delete webhook URL: {}", e))?;
    } else {
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('webhook_url', ?)",
            params![&url],
        )
        .map_err(|e| format!("Failed to save webhook URL: {}", e))?;
    }

    println!("[Rust] Webhook URL saved successfully");
    Ok(())
}

#[tauri::command]
async fn sync_to_webhook() -> Result<SyncResult, String> {
    println!("[Rust] sync_to_webhook called");

    // Get webhook URL and API key
    let conn = get_connection()?;
    let webhook_url: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webhook_url'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "No webhook URL configured".to_string())?;

    if webhook_url.is_empty() {
        return Err("No webhook URL configured".to_string());
    }

    let api_key: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webhook_api_key'",
            [],
            |row| row.get(0),
        )
        .ok();

    // Get all items (reuse existing logic)
    drop(conn); // Close connection before async calls
    let urls = get_saved_urls().await?;
    let texts = get_saved_texts().await?;
    let tagsets = get_saved_tagsets().await?;

    let total_count = urls.len() + texts.len() + tagsets.len();

    if total_count == 0 {
        return Ok(SyncResult {
            success: true,
            synced_count: 0,
            message: "No items to sync".to_string(),
        });
    }

    // Create payload with all item types
    let payload = WebhookPayload { urls, texts, tagsets };

    // Send to webhook
    let client = reqwest::Client::new();
    let mut request = client.post(&webhook_url).json(&payload);

    // Add Authorization header if API key is configured
    if let Some(key) = api_key {
        if !key.is_empty() {
            request = request.header("Authorization", format!("Bearer {}", key));
        }
    }

    let response = request
        .send()
        .await
        .map_err(|e| format!("Failed to send webhook request: {}", e))?;

    if response.status().is_success() {
        // Update last sync time
        let conn = get_connection()?;
        let now = Utc::now().to_rfc3339();
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES ('last_sync', ?)",
            params![&now],
        )
        .ok();

        println!("[Rust] Webhook sync successful, synced {} items", total_count);
        Ok(SyncResult {
            success: true,
            synced_count: total_count,
            message: format!("Successfully synced {} items", total_count),
        })
    } else {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        Err(format!("Webhook returned error {}: {}", status, body))
    }
}

#[tauri::command]
fn get_last_sync() -> Result<Option<String>, String> {
    let conn = get_connection()?;
    let last_sync: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();
    Ok(last_sync)
}

#[tauri::command]
async fn auto_sync_if_needed() -> Result<Option<SyncResult>, String> {
    // Check if webhook URL is configured
    let conn = get_connection()?;
    let webhook_url: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'webhook_url'",
            [],
            |row| row.get(0),
        )
        .ok();

    if webhook_url.is_none() || webhook_url.as_ref().map(|s| s.trim().is_empty()).unwrap_or(true) {
        return Ok(None); // No webhook configured, nothing to do
    }

    // Check last sync time
    let last_sync: Option<String> = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'last_sync'",
            [],
            |row| row.get(0),
        )
        .ok();

    let should_sync = match last_sync {
        None => true, // Never synced
        Some(last_sync_str) => {
            if let Ok(last_sync_time) = chrono::DateTime::parse_from_rfc3339(&last_sync_str) {
                let now = Utc::now();
                let hours_since_sync = (now - last_sync_time.with_timezone(&Utc)).num_hours();
                hours_since_sync >= 24
            } else {
                true // Invalid date, sync anyway
            }
        }
    };

    drop(conn); // Close connection before async call

    if should_sync {
        println!("[Rust] Auto-sync: syncing (>24h since last sync)");
        match sync_to_webhook().await {
            Ok(result) => Ok(Some(result)),
            Err(e) => {
                println!("[Rust] Auto-sync failed: {}", e);
                Ok(None) // Don't propagate error, just skip
            }
        }
    } else {
        println!("[Rust] Auto-sync: skipping (synced within 24h)");
        Ok(None)
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            // Page (URL) commands
            save_url,
            get_saved_urls,
            update_url,
            update_url_tags,
            delete_url,
            // Text commands
            save_text,
            get_saved_texts,
            update_text,
            // Tagset commands
            save_tagset,
            get_saved_tagsets,
            update_tagset,
            // Tag commands
            get_tags_by_frecency,
            get_tags_by_frecency_for_url,
            // Settings and sync
            is_dark_mode,
            get_webhook_url,
            set_webhook_url,
            get_webhook_api_key,
            set_webhook_api_key,
            sync_to_webhook,
            get_last_sync,
            auto_sync_if_needed,
            // Legacy/deprecated
            get_shared_url
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
