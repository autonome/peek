//! SQLite datastore implementation
//!
//! Mirrors the Electron backend's datastore.ts functionality using rusqlite.

use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use url::Url;

/// SQL schema - matches Electron backend exactly
const CREATE_TABLE_STATEMENTS: &str = r#"
  CREATE TABLE IF NOT EXISTS addresses (
    id TEXT PRIMARY KEY,
    uri TEXT NOT NULL,
    protocol TEXT DEFAULT 'https',
    domain TEXT,
    path TEXT DEFAULT '',
    title TEXT DEFAULT '',
    mimeType TEXT DEFAULT 'text/html',
    favicon TEXT DEFAULT '',
    description TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    updatedAt INTEGER,
    lastVisitAt INTEGER DEFAULT 0,
    visitCount INTEGER DEFAULT 0,
    starred INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_addresses_uri ON addresses(uri);
  CREATE INDEX IF NOT EXISTS idx_addresses_domain ON addresses(domain);
  CREATE INDEX IF NOT EXISTS idx_addresses_protocol ON addresses(protocol);
  CREATE INDEX IF NOT EXISTS idx_addresses_lastVisitAt ON addresses(lastVisitAt);
  CREATE INDEX IF NOT EXISTS idx_addresses_visitCount ON addresses(visitCount);
  CREATE INDEX IF NOT EXISTS idx_addresses_starred ON addresses(starred);

  CREATE TABLE IF NOT EXISTS visits (
    id TEXT PRIMARY KEY,
    addressId TEXT,
    timestamp INTEGER,
    duration INTEGER DEFAULT 0,
    source TEXT DEFAULT 'direct',
    sourceId TEXT DEFAULT '',
    windowType TEXT DEFAULT 'main',
    metadata TEXT DEFAULT '{}',
    scrollDepth INTEGER DEFAULT 0,
    interacted INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_visits_addressId ON visits(addressId);
  CREATE INDEX IF NOT EXISTS idx_visits_timestamp ON visits(timestamp);
  CREATE INDEX IF NOT EXISTS idx_visits_source ON visits(source);

  CREATE TABLE IF NOT EXISTS content (
    id TEXT PRIMARY KEY,
    title TEXT DEFAULT 'Untitled',
    content TEXT DEFAULT '',
    mimeType TEXT DEFAULT 'text/plain',
    contentType TEXT DEFAULT 'plain',
    language TEXT DEFAULT '',
    encoding TEXT DEFAULT 'utf-8',
    tags TEXT DEFAULT '',
    addressRefs TEXT DEFAULT '',
    parentId TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    updatedAt INTEGER,
    syncPath TEXT DEFAULT '',
    synced INTEGER DEFAULT 0,
    starred INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_content_contentType ON content(contentType);
  CREATE INDEX IF NOT EXISTS idx_content_mimeType ON content(mimeType);
  CREATE INDEX IF NOT EXISTS idx_content_synced ON content(synced);
  CREATE INDEX IF NOT EXISTS idx_content_updatedAt ON content(updatedAt);

  CREATE TABLE IF NOT EXISTS tags (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT,
    color TEXT DEFAULT '#999999',
    parentId TEXT DEFAULT '',
    description TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    updatedAt INTEGER,
    frequency INTEGER DEFAULT 0,
    lastUsedAt INTEGER DEFAULT 0,
    frecencyScore INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
  CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
  CREATE INDEX IF NOT EXISTS idx_tags_parentId ON tags(parentId);
  CREATE INDEX IF NOT EXISTS idx_tags_frecencyScore ON tags(frecencyScore);

  CREATE TABLE IF NOT EXISTS address_tags (
    id TEXT PRIMARY KEY,
    addressId TEXT NOT NULL,
    tagId TEXT NOT NULL,
    createdAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_address_tags_addressId ON address_tags(addressId);
  CREATE INDEX IF NOT EXISTS idx_address_tags_tagId ON address_tags(tagId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_address_tags_unique ON address_tags(addressId, tagId);

  CREATE TABLE IF NOT EXISTS blobs (
    id TEXT PRIMARY KEY,
    filename TEXT,
    mimeType TEXT,
    mediaType TEXT,
    size INTEGER,
    hash TEXT,
    extension TEXT,
    path TEXT,
    addressId TEXT DEFAULT '',
    contentId TEXT DEFAULT '',
    tags TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    width INTEGER DEFAULT 0,
    height INTEGER DEFAULT 0,
    duration INTEGER DEFAULT 0,
    thumbnail TEXT DEFAULT ''
  );
  CREATE INDEX IF NOT EXISTS idx_blobs_mediaType ON blobs(mediaType);
  CREATE INDEX IF NOT EXISTS idx_blobs_mimeType ON blobs(mimeType);
  CREATE INDEX IF NOT EXISTS idx_blobs_addressId ON blobs(addressId);
  CREATE INDEX IF NOT EXISTS idx_blobs_contentId ON blobs(contentId);

  CREATE TABLE IF NOT EXISTS scripts_data (
    id TEXT PRIMARY KEY,
    scriptId TEXT,
    scriptName TEXT,
    addressId TEXT,
    selector TEXT,
    content TEXT,
    contentType TEXT DEFAULT 'text',
    metadata TEXT DEFAULT '{}',
    extractedAt INTEGER,
    previousValue TEXT DEFAULT '',
    changed INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_scripts_data_scriptId ON scripts_data(scriptId);
  CREATE INDEX IF NOT EXISTS idx_scripts_data_addressId ON scripts_data(addressId);
  CREATE INDEX IF NOT EXISTS idx_scripts_data_changed ON scripts_data(changed);

  CREATE TABLE IF NOT EXISTS feeds (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT DEFAULT '',
    type TEXT,
    query TEXT DEFAULT '',
    schedule TEXT DEFAULT '',
    source TEXT DEFAULT 'internal',
    tags TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    createdAt INTEGER,
    updatedAt INTEGER,
    lastFetchedAt INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1
  );
  CREATE INDEX IF NOT EXISTS idx_feeds_type ON feeds(type);
  CREATE INDEX IF NOT EXISTS idx_feeds_enabled ON feeds(enabled);

  CREATE TABLE IF NOT EXISTS extensions (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT DEFAULT '',
    version TEXT DEFAULT '1.0.0',
    path TEXT,
    backgroundUrl TEXT DEFAULT '',
    settingsUrl TEXT DEFAULT '',
    iconPath TEXT DEFAULT '',
    builtin INTEGER DEFAULT 0,
    enabled INTEGER DEFAULT 1,
    status TEXT DEFAULT 'installed',
    installedAt INTEGER,
    updatedAt INTEGER,
    lastErrorAt INTEGER DEFAULT 0,
    lastError TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}'
  );
  CREATE INDEX IF NOT EXISTS idx_extensions_enabled ON extensions(enabled);
  CREATE INDEX IF NOT EXISTS idx_extensions_status ON extensions(status);
  CREATE INDEX IF NOT EXISTS idx_extensions_builtin ON extensions(builtin);

  CREATE TABLE IF NOT EXISTS extension_settings (
    id TEXT PRIMARY KEY,
    extensionId TEXT NOT NULL,
    key TEXT NOT NULL,
    value TEXT,
    updatedAt INTEGER
  );
  CREATE INDEX IF NOT EXISTS idx_extension_settings_extensionId ON extension_settings(extensionId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_extension_settings_unique ON extension_settings(extensionId, key);

  CREATE TABLE IF NOT EXISTS migrations (
    id TEXT PRIMARY KEY,
    status TEXT DEFAULT 'pending',
    completedAt INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK(type IN ('note', 'tagset', 'image')),
    content TEXT,
    mimeType TEXT DEFAULT '',
    metadata TEXT DEFAULT '{}',
    syncId TEXT DEFAULT '',
    syncSource TEXT DEFAULT '',
    createdAt INTEGER NOT NULL,
    updatedAt INTEGER NOT NULL,
    deletedAt INTEGER DEFAULT 0,
    starred INTEGER DEFAULT 0,
    archived INTEGER DEFAULT 0
  );
  CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
  CREATE INDEX IF NOT EXISTS idx_items_syncId ON items(syncId);
  CREATE INDEX IF NOT EXISTS idx_items_deletedAt ON items(deletedAt);
  CREATE INDEX IF NOT EXISTS idx_items_createdAt ON items(createdAt DESC);
  CREATE INDEX IF NOT EXISTS idx_items_starred ON items(starred);

  CREATE TABLE IF NOT EXISTS item_tags (
    id TEXT PRIMARY KEY,
    itemId TEXT NOT NULL,
    tagId TEXT NOT NULL,
    createdAt INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_item_tags_itemId ON item_tags(itemId);
  CREATE INDEX IF NOT EXISTS idx_item_tags_tagId ON item_tags(tagId);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_item_tags_unique ON item_tags(itemId, tagId);
"#;

// ==================== Types ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Address {
    pub id: String,
    pub uri: String,
    pub protocol: String,
    pub domain: Option<String>,
    pub path: String,
    pub title: String,
    pub mime_type: String,
    pub favicon: String,
    pub description: String,
    pub tags: String,
    pub metadata: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub last_visit_at: i64,
    pub visit_count: i64,
    pub starred: i64,
    pub archived: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Visit {
    pub id: String,
    pub address_id: String,
    pub timestamp: i64,
    pub duration: i64,
    pub source: String,
    pub source_id: String,
    pub window_type: String,
    pub metadata: String,
    pub scroll_depth: i64,
    pub interacted: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub slug: Option<String>,
    pub color: String,
    pub parent_id: String,
    pub description: String,
    pub metadata: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub frequency: i64,
    pub last_used_at: i64,
    pub frecency_score: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressTag {
    pub id: String,
    pub address_id: String,
    pub tag_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DatastoreStats {
    pub total_addresses: i64,
    pub total_visits: i64,
    pub avg_visit_duration: f64,
    pub total_content: i64,
    pub synced_content: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressOptions {
    pub protocol: Option<String>,
    pub domain: Option<String>,
    pub path: Option<String>,
    pub title: Option<String>,
    pub mime_type: Option<String>,
    pub favicon: Option<String>,
    pub description: Option<String>,
    pub tags: Option<String>,
    pub metadata: Option<String>,
    pub last_visit_at: Option<i64>,
    pub visit_count: Option<i64>,
    pub starred: Option<i64>,
    pub archived: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddressFilter {
    pub domain: Option<String>,
    pub protocol: Option<String>,
    pub starred: Option<i64>,
    pub tag: Option<String>,
    pub sort_by: Option<String>,
    pub limit: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisitOptions {
    pub timestamp: Option<i64>,
    pub duration: Option<i64>,
    pub source: Option<String>,
    pub source_id: Option<String>,
    pub window_type: Option<String>,
    pub metadata: Option<String>,
    pub scroll_depth: Option<i64>,
    pub interacted: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VisitFilter {
    pub address_id: Option<String>,
    pub source: Option<String>,
    pub since: Option<i64>,
    pub limit: Option<i64>,
}

// ==================== Item Types (mobile-style lightweight content) ====================

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Item {
    pub id: String,
    #[serde(rename = "type")]
    pub item_type: String,
    pub content: Option<String>,
    pub mime_type: String,
    pub metadata: String,
    pub sync_id: String,
    pub sync_source: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub deleted_at: i64,
    pub starred: i64,
    pub archived: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemTag {
    pub id: String,
    pub item_id: String,
    pub tag_id: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemOptions {
    pub content: Option<String>,
    pub mime_type: Option<String>,
    pub metadata: Option<String>,
    pub sync_id: Option<String>,
    pub sync_source: Option<String>,
    pub starred: Option<i64>,
    pub archived: Option<i64>,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ItemFilter {
    #[serde(rename = "type")]
    pub item_type: Option<String>,
    pub starred: Option<i64>,
    pub archived: Option<i64>,
    pub include_deleted: Option<bool>,
    pub limit: Option<i64>,
    pub sort_by: Option<String>,
}

// ==================== Helpers ====================

pub fn generate_id(prefix: &str) -> String {
    format!(
        "{}_{}_{}",
        prefix,
        chrono::Utc::now().timestamp_millis(),
        uuid::Uuid::new_v4().to_string().split('-').next().unwrap()
    )
}

pub fn now() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

pub fn parse_url(uri: &str) -> (String, String, String) {
    match Url::parse(uri) {
        Ok(url) => (
            url.scheme().to_string(),
            url.host_str().unwrap_or(uri).to_string(),
            format!(
                "{}{}{}",
                url.path(),
                url.query().map(|q| format!("?{}", q)).unwrap_or_default(),
                url.fragment()
                    .map(|f| format!("#{}", f))
                    .unwrap_or_default()
            ),
        ),
        Err(_) => ("unknown".to_string(), uri.to_string(), String::new()),
    }
}

pub fn normalize_url(uri: &str) -> String {
    match Url::parse(uri) {
        Ok(mut url) => {
            // Remove trailing slash from path (except for root)
            let path = url.path().to_string();
            if path != "/" && path.ends_with('/') {
                url.set_path(&path[..path.len() - 1]);
            }

            // Remove default ports
            if (url.scheme() == "http" && url.port() == Some(80))
                || (url.scheme() == "https" && url.port() == Some(443))
            {
                let _ = url.set_port(None);
            }

            url.to_string()
        }
        Err(_) => uri.to_string(),
    }
}

pub fn calculate_frecency(frequency: i64, last_used_at: i64) -> i64 {
    let current_time = now();
    let days_since_use = (current_time - last_used_at) as f64 / (1000.0 * 60.0 * 60.0 * 24.0);
    let decay_factor = 1.0 / (1.0 + days_since_use / 7.0);
    (frequency as f64 * 10.0 * decay_factor).round() as i64
}

// ==================== Database Initialization ====================

pub fn init_database(db_path: &Path) -> Result<Connection> {
    let conn = Connection::open(db_path)?;

    // Enable WAL mode for better concurrent access
    conn.pragma_update(None, "journal_mode", "WAL")?;

    // Execute schema
    conn.execute_batch(CREATE_TABLE_STATEMENTS)?;

    println!("[tauri] Database initialized successfully");
    Ok(conn)
}

// ==================== Address Operations ====================

pub fn add_address(conn: &Connection, uri: &str, options: &AddressOptions) -> Result<String> {
    let normalized_uri = normalize_url(uri);
    let (protocol, domain, path) = parse_url(&normalized_uri);
    let address_id = generate_id("addr");
    let timestamp = now();

    conn.execute(
        r#"INSERT INTO addresses
           (id, uri, protocol, domain, path, title, mimeType, favicon, description, tags, metadata, createdAt, updatedAt, lastVisitAt, visitCount, starred, archived)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, ?16, ?17)"#,
        params![
            address_id,
            normalized_uri,
            options.protocol.as_deref().unwrap_or(&protocol),
            options.domain.as_deref().unwrap_or(&domain),
            options.path.as_deref().unwrap_or(&path),
            options.title.as_deref().unwrap_or(""),
            options.mime_type.as_deref().unwrap_or("text/html"),
            options.favicon.as_deref().unwrap_or(""),
            options.description.as_deref().unwrap_or(""),
            options.tags.as_deref().unwrap_or(""),
            options.metadata.as_deref().unwrap_or("{}"),
            timestamp,
            timestamp,
            options.last_visit_at.unwrap_or(0),
            options.visit_count.unwrap_or(0),
            options.starred.unwrap_or(0),
            options.archived.unwrap_or(0),
        ],
    )?;

    Ok(address_id)
}

pub fn get_address(conn: &Connection, id: &str) -> Result<Option<Address>> {
    let mut stmt = conn.prepare(
        "SELECT id, uri, protocol, domain, path, title, mimeType, favicon, description, tags, metadata, createdAt, updatedAt, lastVisitAt, visitCount, starred, archived FROM addresses WHERE id = ?1",
    )?;

    let result = stmt.query_row(params![id], |row| {
        Ok(Address {
            id: row.get(0)?,
            uri: row.get(1)?,
            protocol: row.get(2)?,
            domain: row.get(3)?,
            path: row.get(4)?,
            title: row.get(5)?,
            mime_type: row.get(6)?,
            favicon: row.get(7)?,
            description: row.get(8)?,
            tags: row.get(9)?,
            metadata: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            last_visit_at: row.get(13)?,
            visit_count: row.get(14)?,
            starred: row.get(15)?,
            archived: row.get(16)?,
        })
    });

    match result {
        Ok(addr) => Ok(Some(addr)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn update_address(
    conn: &Connection,
    id: &str,
    updates: &HashMap<String, serde_json::Value>,
) -> Result<bool> {
    if updates.is_empty() {
        return Ok(false);
    }

    let mut set_clauses = vec!["updatedAt = ?1".to_string()];
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(now())];
    let mut param_idx = 2;

    for (key, value) in updates {
        set_clauses.push(format!("{} = ?{}", key, param_idx));
        match value {
            serde_json::Value::String(s) => params_vec.push(Box::new(s.clone())),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    params_vec.push(Box::new(i));
                } else if let Some(f) = n.as_f64() {
                    params_vec.push(Box::new(f));
                }
            }
            _ => params_vec.push(Box::new(value.to_string())),
        }
        param_idx += 1;
    }

    let sql = format!(
        "UPDATE addresses SET {} WHERE id = ?{}",
        set_clauses.join(", "),
        param_idx
    );
    params_vec.push(Box::new(id.to_string()));

    let params_ref: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let rows = conn.execute(&sql, params_ref.as_slice())?;

    Ok(rows > 0)
}

pub fn query_addresses(conn: &Connection, filter: &AddressFilter) -> Result<Vec<Address>> {
    let mut sql = "SELECT id, uri, protocol, domain, path, title, mimeType, favicon, description, tags, metadata, createdAt, updatedAt, lastVisitAt, visitCount, starred, archived FROM addresses WHERE 1=1".to_string();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![];

    if let Some(domain) = &filter.domain {
        sql.push_str(&format!(" AND domain = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(domain.clone()));
    }
    if let Some(protocol) = &filter.protocol {
        sql.push_str(&format!(" AND protocol = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(protocol.clone()));
    }
    if let Some(starred) = filter.starred {
        sql.push_str(&format!(" AND starred = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(starred));
    }
    if let Some(tag) = &filter.tag {
        sql.push_str(&format!(" AND tags LIKE ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(format!("%{}%", tag)));
    }

    let sort = match filter.sort_by.as_deref() {
        Some("lastVisit") => "lastVisitAt DESC",
        Some("visitCount") => "visitCount DESC",
        Some("created") => "createdAt DESC",
        _ => "updatedAt DESC",
    };
    sql.push_str(&format!(" ORDER BY {}", sort));

    if let Some(limit) = filter.limit {
        sql.push_str(&format!(" LIMIT {}", limit));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;

    let addresses = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(Address {
            id: row.get(0)?,
            uri: row.get(1)?,
            protocol: row.get(2)?,
            domain: row.get(3)?,
            path: row.get(4)?,
            title: row.get(5)?,
            mime_type: row.get(6)?,
            favicon: row.get(7)?,
            description: row.get(8)?,
            tags: row.get(9)?,
            metadata: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            last_visit_at: row.get(13)?,
            visit_count: row.get(14)?,
            starred: row.get(15)?,
            archived: row.get(16)?,
        })
    })?;

    addresses.collect()
}

// ==================== Visit Operations ====================

pub fn add_visit(conn: &Connection, address_id: &str, options: &VisitOptions) -> Result<String> {
    let visit_id = generate_id("visit");
    let timestamp = options.timestamp.unwrap_or_else(now);

    conn.execute(
        r#"INSERT INTO visits (id, addressId, timestamp, duration, source, sourceId, windowType, metadata, scrollDepth, interacted)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)"#,
        params![
            visit_id,
            address_id,
            timestamp,
            options.duration.unwrap_or(0),
            options.source.as_deref().unwrap_or("direct"),
            options.source_id.as_deref().unwrap_or(""),
            options.window_type.as_deref().unwrap_or("main"),
            options.metadata.as_deref().unwrap_or("{}"),
            options.scroll_depth.unwrap_or(0),
            options.interacted.unwrap_or(0),
        ],
    )?;

    // Update address visit stats
    conn.execute(
        "UPDATE addresses SET lastVisitAt = ?1, visitCount = visitCount + 1, updatedAt = ?1 WHERE id = ?2",
        params![timestamp, address_id],
    )?;

    Ok(visit_id)
}

pub fn query_visits(conn: &Connection, filter: &VisitFilter) -> Result<Vec<Visit>> {
    let mut sql = "SELECT id, addressId, timestamp, duration, source, sourceId, windowType, metadata, scrollDepth, interacted FROM visits WHERE 1=1".to_string();
    let mut params_vec: Vec<Box<dyn rusqlite::ToSql>> = vec![];

    if let Some(address_id) = &filter.address_id {
        sql.push_str(&format!(" AND addressId = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(address_id.clone()));
    }
    if let Some(source) = &filter.source {
        sql.push_str(&format!(" AND source = ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(source.clone()));
    }
    if let Some(since) = filter.since {
        sql.push_str(&format!(" AND timestamp >= ?{}", params_vec.len() + 1));
        params_vec.push(Box::new(since));
    }

    sql.push_str(" ORDER BY timestamp DESC");

    if let Some(limit) = filter.limit {
        sql.push_str(&format!(" LIMIT {}", limit));
    }

    let params_ref: Vec<&dyn rusqlite::ToSql> = params_vec.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;

    let visits = stmt.query_map(params_ref.as_slice(), |row| {
        Ok(Visit {
            id: row.get(0)?,
            address_id: row.get(1)?,
            timestamp: row.get(2)?,
            duration: row.get(3)?,
            source: row.get(4)?,
            source_id: row.get(5)?,
            window_type: row.get(6)?,
            metadata: row.get(7)?,
            scroll_depth: row.get(8)?,
            interacted: row.get(9)?,
        })
    })?;

    visits.collect()
}

// ==================== Tag Operations ====================

pub fn get_or_create_tag(conn: &Connection, name: &str) -> Result<(Tag, bool)> {
    let slug = name.to_lowercase().trim().replace(' ', "-");
    let timestamp = now();

    // Check if tag exists
    let mut stmt =
        conn.prepare("SELECT id, name, slug, color, parentId, description, metadata, createdAt, updatedAt, frequency, lastUsedAt, frecencyScore FROM tags WHERE LOWER(name) = LOWER(?1)")?;

    let existing = stmt.query_row(params![name], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            slug: row.get(2)?,
            color: row.get(3)?,
            parent_id: row.get(4)?,
            description: row.get(5)?,
            metadata: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            frequency: row.get(9)?,
            last_used_at: row.get(10)?,
            frecency_score: row.get(11)?,
        })
    });

    match existing {
        Ok(tag) => Ok((tag, false)),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let tag_id = generate_id("tag");
            conn.execute(
                r#"INSERT INTO tags (id, name, slug, color, parentId, description, metadata, createdAt, updatedAt, frequency, lastUsedAt, frecencyScore)
                   VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)"#,
                params![
                    tag_id,
                    name.trim(),
                    slug,
                    "#999999",
                    "",
                    "",
                    "{}",
                    timestamp,
                    timestamp,
                    0,
                    0,
                    0
                ],
            )?;

            let tag = Tag {
                id: tag_id,
                name: name.trim().to_string(),
                slug: Some(slug),
                color: "#999999".to_string(),
                parent_id: String::new(),
                description: String::new(),
                metadata: "{}".to_string(),
                created_at: timestamp,
                updated_at: timestamp,
                frequency: 0,
                last_used_at: 0,
                frecency_score: 0,
            };
            Ok((tag, true))
        }
        Err(e) => Err(e),
    }
}

pub fn tag_address(conn: &Connection, address_id: &str, tag_id: &str) -> Result<(AddressTag, bool)> {
    let timestamp = now();

    // Check if link already exists
    let mut stmt = conn.prepare(
        "SELECT id, addressId, tagId, createdAt FROM address_tags WHERE addressId = ?1 AND tagId = ?2",
    )?;

    let existing = stmt.query_row(params![address_id, tag_id], |row| {
        Ok(AddressTag {
            id: row.get(0)?,
            address_id: row.get(1)?,
            tag_id: row.get(2)?,
            created_at: row.get(3)?,
        })
    });

    match existing {
        Ok(link) => Ok((link, true)),
        Err(rusqlite::Error::QueryReturnedNoRows) => {
            let link_id = generate_id("address_tag");
            conn.execute(
                "INSERT INTO address_tags (id, addressId, tagId, createdAt) VALUES (?1, ?2, ?3, ?4)",
                params![link_id, address_id, tag_id, timestamp],
            )?;

            // Update tag frequency
            conn.execute(
                "UPDATE tags SET frequency = frequency + 1, lastUsedAt = ?1, frecencyScore = ?2, updatedAt = ?1 WHERE id = ?3",
                params![timestamp, calculate_frecency(1, timestamp), tag_id],
            )?;

            let link = AddressTag {
                id: link_id,
                address_id: address_id.to_string(),
                tag_id: tag_id.to_string(),
                created_at: timestamp,
            };
            Ok((link, false))
        }
        Err(e) => Err(e),
    }
}

pub fn untag_address(conn: &Connection, address_id: &str, tag_id: &str) -> Result<bool> {
    let rows = conn.execute(
        "DELETE FROM address_tags WHERE addressId = ?1 AND tagId = ?2",
        params![address_id, tag_id],
    )?;
    Ok(rows > 0)
}

pub fn get_address_tags(conn: &Connection, address_id: &str) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        r#"SELECT t.id, t.name, t.slug, t.color, t.parentId, t.description, t.metadata, t.createdAt, t.updatedAt, t.frequency, t.lastUsedAt, t.frecencyScore
           FROM tags t
           JOIN address_tags at ON t.id = at.tagId
           WHERE at.addressId = ?1"#,
    )?;

    let tags = stmt.query_map(params![address_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            slug: row.get(2)?,
            color: row.get(3)?,
            parent_id: row.get(4)?,
            description: row.get(5)?,
            metadata: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            frequency: row.get(9)?,
            last_used_at: row.get(10)?,
            frecency_score: row.get(11)?,
        })
    })?;

    tags.collect()
}

pub fn get_tags_by_frecency(conn: &Connection, limit: i64) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        r#"SELECT id, name, slug, color, parentId, description, metadata, createdAt, updatedAt, frequency, lastUsedAt, frecencyScore
           FROM tags
           ORDER BY frecencyScore DESC, frequency DESC, lastUsedAt DESC
           LIMIT ?1"#,
    )?;

    let tags = stmt.query_map(params![limit], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            slug: row.get(2)?,
            color: row.get(3)?,
            parent_id: row.get(4)?,
            description: row.get(5)?,
            metadata: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            frequency: row.get(9)?,
            last_used_at: row.get(10)?,
            frecency_score: row.get(11)?,
        })
    })?;

    tags.collect()
}

pub fn get_addresses_by_tag(conn: &Connection, tag_id: &str) -> Result<Vec<Address>> {
    let mut stmt = conn.prepare(
        r#"SELECT a.id, a.uri, a.protocol, a.domain, a.path, a.title, a.mimeType, a.favicon, a.description, a.tags, a.metadata, a.createdAt, a.updatedAt, a.lastVisitAt, a.visitCount, a.starred, a.archived
           FROM addresses a
           JOIN address_tags at ON a.id = at.addressId
           WHERE at.tagId = ?1
           ORDER BY a.updatedAt DESC"#,
    )?;

    let addresses = stmt.query_map(params![tag_id], |row| {
        Ok(Address {
            id: row.get(0)?,
            uri: row.get(1)?,
            protocol: row.get(2)?,
            domain: row.get(3)?,
            path: row.get(4)?,
            title: row.get(5)?,
            mime_type: row.get(6)?,
            favicon: row.get(7)?,
            description: row.get(8)?,
            tags: row.get(9)?,
            metadata: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            last_visit_at: row.get(13)?,
            visit_count: row.get(14)?,
            starred: row.get(15)?,
            archived: row.get(16)?,
        })
    })?;

    addresses.collect()
}

pub fn get_untagged_addresses(conn: &Connection, limit: i64) -> Result<Vec<Address>> {
    let mut stmt = conn.prepare(
        r#"SELECT a.id, a.uri, a.protocol, a.domain, a.path, a.title, a.mimeType, a.favicon, a.description, a.tags, a.metadata, a.createdAt, a.updatedAt, a.lastVisitAt, a.visitCount, a.starred, a.archived
           FROM addresses a
           LEFT JOIN address_tags at ON a.id = at.addressId
           WHERE at.id IS NULL
           ORDER BY a.updatedAt DESC
           LIMIT ?1"#,
    )?;

    let addresses = stmt.query_map(params![limit], |row| {
        Ok(Address {
            id: row.get(0)?,
            uri: row.get(1)?,
            protocol: row.get(2)?,
            domain: row.get(3)?,
            path: row.get(4)?,
            title: row.get(5)?,
            mime_type: row.get(6)?,
            favicon: row.get(7)?,
            description: row.get(8)?,
            tags: row.get(9)?,
            metadata: row.get(10)?,
            created_at: row.get(11)?,
            updated_at: row.get(12)?,
            last_visit_at: row.get(13)?,
            visit_count: row.get(14)?,
            starred: row.get(15)?,
            archived: row.get(16)?,
        })
    })?;

    addresses.collect()
}

// ==================== Generic Table Operations ====================

pub fn get_table(
    conn: &Connection,
    table_name: &str,
) -> Result<HashMap<String, HashMap<String, serde_json::Value>>> {
    // Validate table name to prevent SQL injection
    let valid_tables = [
        "addresses",
        "visits",
        "content",
        "tags",
        "address_tags",
        "blobs",
        "scripts_data",
        "feeds",
        "extensions",
        "extension_settings",
        "migrations",
    ];
    if !valid_tables.contains(&table_name) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "Invalid table: {}",
            table_name
        )));
    }

    let sql = format!("SELECT * FROM {}", table_name);
    let mut stmt = conn.prepare(&sql)?;

    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();
    let mut result: HashMap<String, HashMap<String, serde_json::Value>> = HashMap::new();

    let mut rows = stmt.query([])?;
    while let Some(row) = rows.next()? {
        let id: String = row.get(0)?;
        let mut row_data: HashMap<String, serde_json::Value> = HashMap::new();

        for (i, col_name) in column_names.iter().enumerate() {
            let value: rusqlite::types::Value = row.get(i)?;
            let json_value = match value {
                rusqlite::types::Value::Null => serde_json::Value::Null,
                rusqlite::types::Value::Integer(i) => serde_json::Value::Number(i.into()),
                rusqlite::types::Value::Real(f) => {
                    serde_json::Number::from_f64(f).map_or(serde_json::Value::Null, |n| {
                        serde_json::Value::Number(n)
                    })
                }
                rusqlite::types::Value::Text(s) => serde_json::Value::String(s),
                rusqlite::types::Value::Blob(b) => {
                    serde_json::Value::String(base64::encode_config(&b, base64::STANDARD))
                }
            };
            row_data.insert(col_name.clone(), json_value);
        }

        result.insert(id, row_data);
    }

    Ok(result)
}

pub fn get_row(
    conn: &Connection,
    table_name: &str,
    row_id: &str,
) -> Result<Option<HashMap<String, serde_json::Value>>> {
    // Validate table name to prevent SQL injection
    let valid_tables = [
        "addresses",
        "visits",
        "content",
        "tags",
        "address_tags",
        "blobs",
        "scripts_data",
        "feeds",
        "extensions",
        "extension_settings",
        "migrations",
    ];
    if !valid_tables.contains(&table_name) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "Invalid table: {}",
            table_name
        )));
    }

    let sql = format!("SELECT * FROM {} WHERE id = ?1", table_name);
    let mut stmt = conn.prepare(&sql)?;

    let column_names: Vec<String> = stmt.column_names().iter().map(|s| s.to_string()).collect();

    let result = stmt.query_row(params![row_id], |row| {
        let mut row_data: HashMap<String, serde_json::Value> = HashMap::new();

        for (i, col_name) in column_names.iter().enumerate() {
            let value: rusqlite::types::Value = row.get(i)?;
            let json_value = match value {
                rusqlite::types::Value::Null => serde_json::Value::Null,
                rusqlite::types::Value::Integer(i) => serde_json::Value::Number(i.into()),
                rusqlite::types::Value::Real(f) => {
                    serde_json::Number::from_f64(f).map_or(serde_json::Value::Null, |n| {
                        serde_json::Value::Number(n)
                    })
                }
                rusqlite::types::Value::Text(s) => serde_json::Value::String(s),
                rusqlite::types::Value::Blob(b) => {
                    serde_json::Value::String(base64::encode_config(&b, base64::STANDARD))
                }
            };
            row_data.insert(col_name.clone(), json_value);
        }

        Ok(row_data)
    });

    match result {
        Ok(row_data) => Ok(Some(row_data)),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
        Err(e) => Err(e),
    }
}

pub fn set_row(
    conn: &Connection,
    table_name: &str,
    row_id: &str,
    row_data: &HashMap<String, serde_json::Value>,
) -> Result<()> {
    // Validate table name
    let valid_tables = [
        "addresses",
        "visits",
        "content",
        "tags",
        "address_tags",
        "blobs",
        "scripts_data",
        "feeds",
        "extensions",
        "extension_settings",
        "migrations",
    ];
    if !valid_tables.contains(&table_name) {
        return Err(rusqlite::Error::InvalidParameterName(format!(
            "Invalid table: {}",
            table_name
        )));
    }

    let mut columns = vec!["id".to_string()];
    let mut placeholders = vec!["?1".to_string()];
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(row_id.to_string())];
    let mut idx = 2;

    for (key, value) in row_data {
        if key == "id" {
            continue;
        }
        columns.push(key.clone());
        placeholders.push(format!("?{}", idx));
        match value {
            serde_json::Value::Null => values.push(Box::new(Option::<String>::None)),
            serde_json::Value::Bool(b) => values.push(Box::new(if *b { 1i64 } else { 0i64 })),
            serde_json::Value::Number(n) => {
                if let Some(i) = n.as_i64() {
                    values.push(Box::new(i));
                } else if let Some(f) = n.as_f64() {
                    values.push(Box::new(f));
                } else {
                    values.push(Box::new(n.to_string()));
                }
            }
            serde_json::Value::String(s) => values.push(Box::new(s.clone())),
            _ => values.push(Box::new(value.to_string())),
        }
        idx += 1;
    }

    let sql = format!(
        "INSERT OR REPLACE INTO {} ({}) VALUES ({})",
        table_name,
        columns.join(", "),
        placeholders.join(", ")
    );

    let params_ref: Vec<&dyn rusqlite::ToSql> = values.iter().map(|p| p.as_ref()).collect();
    conn.execute(&sql, params_ref.as_slice())?;

    Ok(())
}

pub fn get_stats(conn: &Connection) -> Result<DatastoreStats> {
    let total_addresses: i64 =
        conn.query_row("SELECT COUNT(*) FROM addresses", [], |row| row.get(0))?;
    let total_visits: i64 = conn.query_row("SELECT COUNT(*) FROM visits", [], |row| row.get(0))?;
    let avg_visit_duration: f64 = conn
        .query_row("SELECT AVG(duration) FROM visits", [], |row| {
            row.get::<_, Option<f64>>(0)
        })?
        .unwrap_or(0.0);
    let total_content: i64 = conn.query_row("SELECT COUNT(*) FROM content", [], |row| row.get(0))?;
    let synced_content: i64 = conn.query_row(
        "SELECT COUNT(*) FROM content WHERE synced = 1",
        [],
        |row| row.get(0),
    )?;

    Ok(DatastoreStats {
        total_addresses,
        total_visits,
        avg_visit_duration,
        total_content,
        synced_content,
    })
}

// ==================== Item Operations (mobile-style lightweight content) ====================

pub fn add_item(conn: &Connection, item_type: &str, options: &ItemOptions) -> Result<String> {
    let item_id = generate_id("item");
    let timestamp = now();

    conn.execute(
        r#"INSERT INTO items
           (id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 0, ?10, ?11)"#,
        params![
            item_id,
            item_type,
            options.content.as_deref(),
            options.mime_type.as_deref().unwrap_or(""),
            options.metadata.as_deref().unwrap_or("{}"),
            options.sync_id.as_deref().unwrap_or(""),
            options.sync_source.as_deref().unwrap_or(""),
            timestamp,
            timestamp,
            options.starred.unwrap_or(0),
            options.archived.unwrap_or(0),
        ],
    )?;

    Ok(item_id)
}

pub fn get_item(conn: &Connection, id: &str) -> Result<Option<Item>> {
    let mut stmt = conn.prepare(
        "SELECT id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived FROM items WHERE id = ?1 AND deletedAt = 0",
    )?;

    let mut rows = stmt.query(params![id])?;
    match rows.next()? {
        Some(row) => Ok(Some(Item {
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
        })),
        None => Ok(None),
    }
}

pub fn update_item(conn: &Connection, id: &str, options: &ItemOptions) -> Result<bool> {
    let timestamp = now();
    let mut updates = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut idx = 1;

    if let Some(ref content) = options.content {
        updates.push(format!("content = ?{}", idx));
        values.push(Box::new(content.clone()));
        idx += 1;
    }
    if let Some(ref mime_type) = options.mime_type {
        updates.push(format!("mimeType = ?{}", idx));
        values.push(Box::new(mime_type.clone()));
        idx += 1;
    }
    if let Some(ref metadata) = options.metadata {
        updates.push(format!("metadata = ?{}", idx));
        values.push(Box::new(metadata.clone()));
        idx += 1;
    }
    if let Some(ref sync_id) = options.sync_id {
        updates.push(format!("syncId = ?{}", idx));
        values.push(Box::new(sync_id.clone()));
        idx += 1;
    }
    if let Some(ref sync_source) = options.sync_source {
        updates.push(format!("syncSource = ?{}", idx));
        values.push(Box::new(sync_source.clone()));
        idx += 1;
    }
    if let Some(starred) = options.starred {
        updates.push(format!("starred = ?{}", idx));
        values.push(Box::new(starred));
        idx += 1;
    }
    if let Some(archived) = options.archived {
        updates.push(format!("archived = ?{}", idx));
        values.push(Box::new(archived));
        idx += 1;
    }

    if updates.is_empty() {
        return Ok(false);
    }

    updates.push(format!("updatedAt = ?{}", idx));
    values.push(Box::new(timestamp));
    idx += 1;

    values.push(Box::new(id.to_string()));

    let sql = format!(
        "UPDATE items SET {} WHERE id = ?{} AND deletedAt = 0",
        updates.join(", "),
        idx
    );

    let params_ref: Vec<&dyn rusqlite::ToSql> = values.iter().map(|p| p.as_ref()).collect();
    let changes = conn.execute(&sql, params_ref.as_slice())?;
    Ok(changes > 0)
}

pub fn delete_item(conn: &Connection, id: &str) -> Result<bool> {
    let timestamp = now();
    let changes = conn.execute(
        "UPDATE items SET deletedAt = ?1, updatedAt = ?1 WHERE id = ?2 AND deletedAt = 0",
        params![timestamp, id],
    )?;
    Ok(changes > 0)
}

pub fn hard_delete_item(conn: &Connection, id: &str) -> Result<bool> {
    conn.execute("DELETE FROM item_tags WHERE itemId = ?1", params![id])?;
    let changes = conn.execute("DELETE FROM items WHERE id = ?1", params![id])?;
    Ok(changes > 0)
}

pub fn query_items(conn: &Connection, filter: &ItemFilter) -> Result<Vec<Item>> {
    let mut conditions = Vec::new();
    let mut values: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();
    let mut idx = 1;

    // By default, exclude soft-deleted items
    if !filter.include_deleted.unwrap_or(false) {
        conditions.push("deletedAt = 0".to_string());
    }

    if let Some(ref item_type) = filter.item_type {
        conditions.push(format!("type = ?{}", idx));
        values.push(Box::new(item_type.clone()));
        idx += 1;
    }
    if let Some(starred) = filter.starred {
        conditions.push(format!("starred = ?{}", idx));
        values.push(Box::new(starred));
        idx += 1;
    }
    if let Some(archived) = filter.archived {
        conditions.push(format!("archived = ?{}", idx));
        values.push(Box::new(archived));
        // idx is not used after this but kept for pattern consistency
    }

    let where_clause = if conditions.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", conditions.join(" AND "))
    };

    let order_by = match filter.sort_by.as_deref() {
        Some("updated") => "updatedAt DESC",
        _ => "createdAt DESC",
    };

    let limit_clause = filter
        .limit
        .map(|l| format!("LIMIT {}", l))
        .unwrap_or_default();

    let sql = format!(
        "SELECT id, type, content, mimeType, metadata, syncId, syncSource, createdAt, updatedAt, deletedAt, starred, archived FROM items {} ORDER BY {} {}",
        where_clause, order_by, limit_clause
    );

    let params_ref: Vec<&dyn rusqlite::ToSql> = values.iter().map(|p| p.as_ref()).collect();
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map(params_ref.as_slice(), |row| {
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
        })
    })?;

    rows.collect()
}

// ==================== Item-Tag Operations ====================

pub fn tag_item(conn: &Connection, item_id: &str, tag_id: &str) -> Result<(ItemTag, bool)> {
    let timestamp = now();

    // Check if link already exists
    let mut stmt = conn.prepare(
        "SELECT id, itemId, tagId, createdAt FROM item_tags WHERE itemId = ?1 AND tagId = ?2",
    )?;
    let mut rows = stmt.query(params![item_id, tag_id])?;

    if let Some(row) = rows.next()? {
        let existing = ItemTag {
            id: row.get(0)?,
            item_id: row.get(1)?,
            tag_id: row.get(2)?,
            created_at: row.get(3)?,
        };
        return Ok((existing, true));
    }

    let link_id = generate_id("item_tag");
    conn.execute(
        "INSERT INTO item_tags (id, itemId, tagId, createdAt) VALUES (?1, ?2, ?3, ?4)",
        params![link_id, item_id, tag_id, timestamp],
    )?;

    // Update tag frequency and frecency
    if let Ok(Some(tag)) = get_tag_by_id(conn, tag_id) {
        let new_frequency = tag.frequency + 1;
        let frecency_score = calculate_frecency(new_frequency, timestamp);
        conn.execute(
            "UPDATE tags SET frequency = ?1, lastUsedAt = ?2, frecencyScore = ?3, updatedAt = ?2 WHERE id = ?4",
            params![new_frequency, timestamp, frecency_score, tag_id],
        )?;
    }

    let new_link = ItemTag {
        id: link_id,
        item_id: item_id.to_string(),
        tag_id: tag_id.to_string(),
        created_at: timestamp,
    };
    Ok((new_link, false))
}

pub fn untag_item(conn: &Connection, item_id: &str, tag_id: &str) -> Result<bool> {
    let changes = conn.execute(
        "DELETE FROM item_tags WHERE itemId = ?1 AND tagId = ?2",
        params![item_id, tag_id],
    )?;
    Ok(changes > 0)
}

pub fn get_item_tags(conn: &Connection, item_id: &str) -> Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        r#"SELECT t.id, t.name, t.slug, t.color, t.parentId, t.description, t.metadata,
                  t.createdAt, t.updatedAt, t.frequency, t.lastUsedAt, t.frecencyScore
           FROM tags t
           JOIN item_tags it ON t.id = it.tagId
           WHERE it.itemId = ?1"#,
    )?;

    let rows = stmt.query_map(params![item_id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            slug: row.get(2)?,
            color: row.get(3)?,
            parent_id: row.get(4)?,
            description: row.get(5)?,
            metadata: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            frequency: row.get(9)?,
            last_used_at: row.get(10)?,
            frecency_score: row.get(11)?,
        })
    })?;

    rows.collect()
}

pub fn get_items_by_tag(conn: &Connection, tag_id: &str) -> Result<Vec<Item>> {
    let mut stmt = conn.prepare(
        r#"SELECT i.id, i.type, i.content, i.mimeType, i.metadata, i.syncId, i.syncSource,
                  i.createdAt, i.updatedAt, i.deletedAt, i.starred, i.archived
           FROM items i
           JOIN item_tags it ON i.id = it.itemId
           WHERE it.tagId = ?1 AND i.deletedAt = 0"#,
    )?;

    let rows = stmt.query_map(params![tag_id], |row| {
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
        })
    })?;

    rows.collect()
}

// Helper to get a tag by ID (used by tag_item)
fn get_tag_by_id(conn: &Connection, tag_id: &str) -> Result<Option<Tag>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, slug, color, parentId, description, metadata, createdAt, updatedAt, frequency, lastUsedAt, frecencyScore FROM tags WHERE id = ?1",
    )?;
    let mut rows = stmt.query(params![tag_id])?;

    match rows.next()? {
        Some(row) => Ok(Some(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            slug: row.get(2)?,
            color: row.get(3)?,
            parent_id: row.get(4)?,
            description: row.get(5)?,
            metadata: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
            frequency: row.get(9)?,
            last_used_at: row.get(10)?,
            frecency_score: row.get(11)?,
        })),
        None => Ok(None),
    }
}

// Simple base64 encoding (avoiding external dependency for now)
mod base64 {
    pub const STANDARD: () = ();

    pub fn encode_config(data: &[u8], _config: ()) -> String {
        const ALPHABET: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        let mut result = String::new();

        for chunk in data.chunks(3) {
            let n = match chunk.len() {
                3 => ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8) | (chunk[2] as u32),
                2 => ((chunk[0] as u32) << 16) | ((chunk[1] as u32) << 8),
                1 => (chunk[0] as u32) << 16,
                _ => continue,
            };

            result.push(ALPHABET[((n >> 18) & 0x3F) as usize] as char);
            result.push(ALPHABET[((n >> 12) & 0x3F) as usize] as char);
            if chunk.len() > 1 {
                result.push(ALPHABET[((n >> 6) & 0x3F) as usize] as char);
            } else {
                result.push('=');
            }
            if chunk.len() > 2 {
                result.push(ALPHABET[(n & 0x3F) as usize] as char);
            } else {
                result.push('=');
            }
        }

        result
    }
}
