//! Tauri Backend Smoke Tests
//!
//! These tests verify core Tauri backend functionality:
//! - Database initialization and operations
//! - Address CRUD operations
//! - Visit tracking
//! - Tag operations
//!
//! Run with: cargo test --test smoke

use tempfile::TempDir;

// Import our modules
#[path = "../src/datastore.rs"]
mod datastore;

/// Test database initialization
#[test]
fn test_database_init() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");

    let conn = datastore::init_database(&db_path).expect("Failed to init database");

    // Verify tables exist
    let tables: Vec<String> = conn
        .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
        .unwrap()
        .query_map([], |row| row.get(0))
        .unwrap()
        .filter_map(|r| r.ok())
        .collect();

    assert!(tables.contains(&"addresses".to_string()));
    assert!(tables.contains(&"visits".to_string()));
    assert!(tables.contains(&"tags".to_string()));
    assert!(tables.contains(&"content".to_string()));
    assert!(tables.contains(&"extensions".to_string()));

    println!("✓ Database initialization works");
}

/// Test address operations
#[test]
fn test_address_operations() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    // Add an address
    let options = datastore::AddressOptions {
        title: Some("Test Page".to_string()),
        ..Default::default()
    };
    let id = datastore::add_address(&conn, "https://example.com/test", &options)
        .expect("Failed to add address");

    assert!(id.starts_with("addr_"));
    println!("✓ Address added: {}", id);

    // Get the address
    let addr = datastore::get_address(&conn, &id)
        .expect("Failed to get address")
        .expect("Address not found");

    assert_eq!(addr.uri, "https://example.com/test");
    assert_eq!(addr.title, "Test Page");
    assert_eq!(addr.domain, Some("example.com".to_string()));
    assert_eq!(addr.protocol, "https");
    println!("✓ Address retrieved correctly");

    // Query addresses
    let filter = datastore::AddressFilter {
        domain: Some("example.com".to_string()),
        ..Default::default()
    };
    let results = datastore::query_addresses(&conn, &filter).expect("Failed to query");

    assert_eq!(results.len(), 1);
    assert_eq!(results[0].id, id);
    println!("✓ Address query works");

    // Update address
    let mut updates = std::collections::HashMap::new();
    updates.insert("title".to_string(), serde_json::json!("Updated Title"));
    let updated = datastore::update_address(&conn, &id, &updates).expect("Failed to update");

    assert!(updated);

    let addr = datastore::get_address(&conn, &id).unwrap().unwrap();
    assert_eq!(addr.title, "Updated Title");
    println!("✓ Address update works");
}

/// Test visit tracking
#[test]
fn test_visit_tracking() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    // Add an address first
    let addr_id = datastore::add_address(&conn, "https://example.com", &Default::default()).unwrap();

    // Add a visit
    let visit_options = datastore::VisitOptions {
        source: Some("test".to_string()),
        ..Default::default()
    };
    let visit_id =
        datastore::add_visit(&conn, &addr_id, &visit_options).expect("Failed to add visit");

    assert!(visit_id.starts_with("visit_"));
    println!("✓ Visit added: {}", visit_id);

    // Verify address visit count updated
    let addr = datastore::get_address(&conn, &addr_id).unwrap().unwrap();
    assert_eq!(addr.visit_count, 1);
    assert!(addr.last_visit_at > 0);
    println!("✓ Address visit count updated");

    // Query visits
    let filter = datastore::VisitFilter {
        address_id: Some(addr_id.clone()),
        ..Default::default()
    };
    let visits = datastore::query_visits(&conn, &filter).expect("Failed to query visits");

    assert_eq!(visits.len(), 1);
    assert_eq!(visits[0].source, "test");
    println!("✓ Visit query works");
}

/// Test tag operations
#[test]
fn test_tag_operations() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    // Create a tag
    let (tag, created) =
        datastore::get_or_create_tag(&conn, "Test Tag").expect("Failed to create tag");

    assert!(created);
    assert!(tag.id.starts_with("tag_"));
    assert_eq!(tag.name, "Test Tag");
    assert_eq!(tag.slug, Some("test-tag".to_string()));
    println!("✓ Tag created: {}", tag.id);

    // Get same tag again (should not create new)
    let (tag2, created2) = datastore::get_or_create_tag(&conn, "Test Tag").unwrap();

    assert!(!created2);
    assert_eq!(tag.id, tag2.id);
    println!("✓ Tag retrieval works (no duplicate)");

    // Tag an address
    let addr_id = datastore::add_address(&conn, "https://example.com", &Default::default()).unwrap();
    let (link, already_exists) =
        datastore::tag_address(&conn, &addr_id, &tag.id).expect("Failed to tag address");

    assert!(!already_exists);
    assert!(link.id.starts_with("address_tag_"));
    println!("✓ Address tagged");

    // Get address tags
    let tags = datastore::get_address_tags(&conn, &addr_id).expect("Failed to get address tags");

    assert_eq!(tags.len(), 1);
    assert_eq!(tags[0].name, "Test Tag");
    println!("✓ Address tags retrieved");

    // Untag address
    let removed = datastore::untag_address(&conn, &addr_id, &tag.id).expect("Failed to untag");

    assert!(removed);

    let tags = datastore::get_address_tags(&conn, &addr_id).unwrap();
    assert_eq!(tags.len(), 0);
    println!("✓ Address untagged");
}

/// Test generic table operations
#[test]
fn test_table_operations() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    // Add some data
    datastore::add_address(&conn, "https://example1.com", &Default::default()).unwrap();
    datastore::add_address(&conn, "https://example2.com", &Default::default()).unwrap();

    // Get table
    let table = datastore::get_table(&conn, "addresses").expect("Failed to get table");

    assert_eq!(table.len(), 2);
    println!("✓ Get table works ({} rows)", table.len());

    // Set row - provide all required fields
    let now = datastore::now();
    let mut row_data = std::collections::HashMap::new();
    row_data.insert("title".to_string(), serde_json::json!("Custom Title"));
    row_data.insert("uri".to_string(), serde_json::json!("https://custom.com"));
    row_data.insert("protocol".to_string(), serde_json::json!("https"));
    row_data.insert("domain".to_string(), serde_json::json!("custom.com"));
    row_data.insert("path".to_string(), serde_json::json!(""));
    row_data.insert("mimeType".to_string(), serde_json::json!("text/html"));
    row_data.insert("createdAt".to_string(), serde_json::json!(now));
    row_data.insert("updatedAt".to_string(), serde_json::json!(now));

    datastore::set_row(&conn, "addresses", "custom_id", &row_data).expect("Failed to set row");

    // Verify via get_table (get_address expects all fields)
    let table = datastore::get_table(&conn, "addresses").expect("Failed to get table");
    assert_eq!(table.len(), 3);
    assert!(table.contains_key("custom_id"));
    assert_eq!(table["custom_id"]["title"], serde_json::json!("Custom Title"));
    println!("✓ Set row works");
}

/// Test stats
#[test]
fn test_stats() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    // Add some data
    let addr_id = datastore::add_address(&conn, "https://example.com", &Default::default()).unwrap();
    datastore::add_visit(&conn, &addr_id, &Default::default()).unwrap();
    datastore::add_visit(&conn, &addr_id, &Default::default()).unwrap();

    let stats = datastore::get_stats(&conn).expect("Failed to get stats");

    assert_eq!(stats.total_addresses, 1);
    assert_eq!(stats.total_visits, 2);
    println!("✓ Stats work: {} addresses, {} visits", stats.total_addresses, stats.total_visits);
}

/// Test URL normalization
#[test]
fn test_url_normalization() {
    // Trailing slash removal
    assert_eq!(
        datastore::normalize_url("https://example.com/path/"),
        "https://example.com/path"
    );

    // Root path preserved
    assert_eq!(
        datastore::normalize_url("https://example.com/"),
        "https://example.com/"
    );

    // Default port removal
    assert_eq!(
        datastore::normalize_url("https://example.com:443/path"),
        "https://example.com/path"
    );

    assert_eq!(
        datastore::normalize_url("http://example.com:80/path"),
        "http://example.com/path"
    );

    println!("✓ URL normalization works");
}

/// Test extension CRUD operations
#[test]
fn test_extension_operations() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    let now = datastore::now();

    // Add an extension
    conn.execute(
        "INSERT INTO extensions (id, name, description, version, path, backgroundUrl, builtin, enabled, status, installedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params![
            "test-ext",
            "Test Extension",
            "A test extension",
            "1.0.0",
            "/path/to/extension",
            "background.html",
            0,
            1,
            "installed",
            now,
            now
        ],
    ).expect("Failed to add extension");
    println!("✓ Extension added");

    // Get extension
    let ext: (String, String, i32, i32) = conn.query_row(
        "SELECT id, name, enabled, builtin FROM extensions WHERE id = ?",
        rusqlite::params!["test-ext"],
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
    ).expect("Failed to get extension");

    assert_eq!(ext.0, "test-ext");
    assert_eq!(ext.1, "Test Extension");
    assert_eq!(ext.2, 1); // enabled
    assert_eq!(ext.3, 0); // not builtin
    println!("✓ Extension retrieved correctly");

    // Update extension (disable it)
    conn.execute(
        "UPDATE extensions SET enabled = ?, status = ?, updatedAt = ? WHERE id = ?",
        rusqlite::params![0, "disabled", now, "test-ext"],
    ).expect("Failed to update extension");

    let enabled: i32 = conn.query_row(
        "SELECT enabled FROM extensions WHERE id = ?",
        rusqlite::params!["test-ext"],
        |row| row.get(0),
    ).unwrap();
    assert_eq!(enabled, 0);
    println!("✓ Extension updated (disabled)");

    // Re-enable
    conn.execute(
        "UPDATE extensions SET enabled = ?, status = ? WHERE id = ?",
        rusqlite::params![1, "installed", "test-ext"],
    ).unwrap();

    let enabled: i32 = conn.query_row(
        "SELECT enabled FROM extensions WHERE id = ?",
        rusqlite::params!["test-ext"],
        |row| row.get(0),
    ).unwrap();
    assert_eq!(enabled, 1);
    println!("✓ Extension re-enabled");

    // List all extensions
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM extensions",
        [],
        |row| row.get(0),
    ).unwrap();
    assert_eq!(count, 1);
    println!("✓ Extension list works");

    // Remove extension
    conn.execute(
        "DELETE FROM extensions WHERE id = ?",
        rusqlite::params!["test-ext"],
    ).expect("Failed to remove extension");

    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM extensions WHERE id = ?",
        rusqlite::params!["test-ext"],
        |row| row.get(0),
    ).unwrap();
    assert_eq!(count, 0);
    println!("✓ Extension removed");
}

/// Test extension_settings operations (used for extension prefs/items)
#[test]
fn test_extension_settings() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    let now = datastore::now();

    // Save extension settings (like peeks items)
    let peeks_items = serde_json::json!([
        {"title": "Test Peek 1", "uri": "https://test1.com", "shortcut": "Option+1"},
        {"title": "Test Peek 2", "uri": "https://test2.com", "shortcut": "Option+2"}
    ]);

    conn.execute(
        "INSERT INTO extension_settings (extensionId, key, value, updatedAt) VALUES (?, ?, ?, ?)",
        rusqlite::params!["peeks", "items", peeks_items.to_string(), now],
    ).expect("Failed to save extension settings");
    println!("✓ Extension settings saved");

    // Retrieve settings
    let value: String = conn.query_row(
        "SELECT value FROM extension_settings WHERE extensionId = ? AND key = ?",
        rusqlite::params!["peeks", "items"],
        |row| row.get(0),
    ).expect("Failed to get extension settings");

    let parsed: serde_json::Value = serde_json::from_str(&value).unwrap();
    assert!(parsed.is_array());
    assert_eq!(parsed.as_array().unwrap().len(), 2);
    assert_eq!(parsed[0]["title"], "Test Peek 1");
    println!("✓ Extension settings retrieved correctly");

    // Update settings
    let updated_items = serde_json::json!([
        {"title": "Updated Peek", "uri": "https://updated.com", "shortcut": "Option+1"}
    ]);

    conn.execute(
        "UPDATE extension_settings SET value = ?, updatedAt = ? WHERE extensionId = ? AND key = ?",
        rusqlite::params![updated_items.to_string(), now, "peeks", "items"],
    ).expect("Failed to update extension settings");

    let value: String = conn.query_row(
        "SELECT value FROM extension_settings WHERE extensionId = ? AND key = ?",
        rusqlite::params!["peeks", "items"],
        |row| row.get(0),
    ).unwrap();

    let parsed: serde_json::Value = serde_json::from_str(&value).unwrap();
    assert_eq!(parsed.as_array().unwrap().len(), 1);
    assert_eq!(parsed[0]["title"], "Updated Peek");
    println!("✓ Extension settings updated");

    // Save prefs for another extension
    let slides_prefs = serde_json::json!({"defaultPosition": "right", "defaultSize": 350});

    conn.execute(
        "INSERT INTO extension_settings (extensionId, key, value, updatedAt) VALUES (?, ?, ?, ?)",
        rusqlite::params!["slides", "prefs", slides_prefs.to_string(), now],
    ).unwrap();

    // Query all settings for an extension
    let mut stmt = conn.prepare(
        "SELECT key, value FROM extension_settings WHERE extensionId = ?"
    ).unwrap();

    let settings: Vec<(String, String)> = stmt.query_map(
        rusqlite::params!["peeks"],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).unwrap().filter_map(|r| r.ok()).collect();

    assert_eq!(settings.len(), 1);
    println!("✓ Extension settings query works");
}

/// Test data persistence (simulates app restart)
#[test]
fn test_data_persistence() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");

    // Phase 1: Create data
    {
        let conn = datastore::init_database(&db_path).unwrap();

        // Add addresses
        let opts = datastore::AddressOptions {
            title: Some("Persistent Page".to_string()),
            starred: Some(1),
            ..Default::default()
        };
        datastore::add_address(&conn, "https://persist.example.com", &opts).unwrap();

        // Add tag
        let (tag, _) = datastore::get_or_create_tag(&conn, "persistent-tag").unwrap();

        // Add extension settings
        let now = datastore::now();
        conn.execute(
            "INSERT INTO extension_settings (extensionId, key, value, updatedAt) VALUES (?, ?, ?, ?)",
            rusqlite::params!["test", "data", "\"persisted\"", now],
        ).unwrap();

        println!("✓ Phase 1: Data created");
        // Connection closes here
    }

    // Phase 2: Reopen and verify persistence
    {
        let conn = datastore::init_database(&db_path).unwrap();

        // Verify address persisted
        let filter = datastore::AddressFilter {
            starred: Some(1),
            ..Default::default()
        };
        let addresses = datastore::query_addresses(&conn, &filter).unwrap();
        assert_eq!(addresses.len(), 1);
        assert_eq!(addresses[0].title, "Persistent Page");
        println!("✓ Phase 2: Address persisted");

        // Verify tag persisted
        let (tag, created) = datastore::get_or_create_tag(&conn, "persistent-tag").unwrap();
        assert!(!created); // Should already exist
        println!("✓ Phase 2: Tag persisted");

        // Verify extension settings persisted
        let value: String = conn.query_row(
            "SELECT value FROM extension_settings WHERE extensionId = ? AND key = ?",
            rusqlite::params!["test", "data"],
            |row| row.get(0),
        ).unwrap();
        assert_eq!(value, "\"persisted\"");
        println!("✓ Phase 2: Extension settings persisted");
    }

    println!("✓ Data persistence verified across restart");
}

/// Test extension error tracking
#[test]
fn test_extension_error_tracking() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    let now = datastore::now();

    // Add extension
    conn.execute(
        "INSERT INTO extensions (id, name, path, enabled, status, installedAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?)",
        rusqlite::params!["error-ext", "Error Test", "/path", 0, "installed", now, now],
    ).unwrap();

    // Record an error
    let error_msg = "Failed to load: manifest not found";
    conn.execute(
        "UPDATE extensions SET lastError = ?, lastErrorAt = ?, status = ? WHERE id = ?",
        rusqlite::params![error_msg, now, "error", "error-ext"],
    ).unwrap();

    // Verify error recorded
    let (last_error, status): (String, String) = conn.query_row(
        "SELECT lastError, status FROM extensions WHERE id = ?",
        rusqlite::params!["error-ext"],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).unwrap();

    assert_eq!(last_error, error_msg);
    assert_eq!(status, "error");
    println!("✓ Extension error tracked");

    // Clear error on successful load
    conn.execute(
        "UPDATE extensions SET lastError = '', lastErrorAt = 0, status = ?, enabled = 1 WHERE id = ?",
        rusqlite::params!["installed", "error-ext"],
    ).unwrap();

    let (last_error, status): (String, String) = conn.query_row(
        "SELECT lastError, status FROM extensions WHERE id = ?",
        rusqlite::params!["error-ext"],
        |row| Ok((row.get(0)?, row.get(1)?)),
    ).unwrap();

    assert_eq!(last_error, "");
    assert_eq!(status, "installed");
    println!("✓ Extension error cleared");
}

/// Test item operations with new columns (syncedAt, visitCount, lastVisitAt)
#[test]
fn test_item_new_columns() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    // Add a 'url' type item (new type)
    let options = datastore::ItemOptions {
        content: Some("https://example.com".to_string()),
        ..Default::default()
    };
    let item_id = datastore::add_item(&conn, "url", &options).expect("Failed to add url item");
    assert!(item_id.starts_with("item_"));
    println!("✓ URL item added: {}", item_id);

    // Get the item and check new columns default to 0
    let item = datastore::get_item(&conn, &item_id).unwrap().unwrap();
    assert_eq!(item.item_type, "url");
    assert_eq!(item.synced_at, 0);
    assert_eq!(item.visit_count, 0);
    assert_eq!(item.last_visit_at, 0);
    println!("✓ New columns default to 0");

    // Add a 'text' type item
    let options2 = datastore::ItemOptions {
        content: Some("Hello world".to_string()),
        ..Default::default()
    };
    let item_id2 = datastore::add_item(&conn, "text", &options2).expect("Failed to add text item");
    let item2 = datastore::get_item(&conn, &item_id2).unwrap().unwrap();
    assert_eq!(item2.item_type, "text");
    println!("✓ Text item type works");

    // Update syncedAt via raw SQL (as sync module would)
    let now = datastore::now();
    conn.execute(
        "UPDATE items SET syncedAt = ?1, visitCount = 5, lastVisitAt = ?1 WHERE id = ?2",
        rusqlite::params![now, item_id],
    ).unwrap();

    let item = datastore::get_item(&conn, &item_id).unwrap().unwrap();
    assert_eq!(item.synced_at, now);
    assert_eq!(item.visit_count, 5);
    assert_eq!(item.last_visit_at, now);
    println!("✓ New columns updated correctly");

    // Query items and verify new columns
    let filter = datastore::ItemFilter {
        item_type: Some("url".to_string()),
        ..Default::default()
    };
    let items = datastore::query_items(&conn, &filter).unwrap();
    assert_eq!(items.len(), 1);
    assert_eq!(items[0].synced_at, now);
    assert_eq!(items[0].visit_count, 5);
    println!("✓ Query items returns new columns");
}

/// Test item type migration (note -> url/text)
#[test]
fn test_item_type_migration() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");

    // Phase 1: Create a database with old-style 'note' type
    {
        let conn = rusqlite::Connection::open(&db_path).unwrap();
        conn.pragma_update(None, "journal_mode", "WAL").unwrap();

        // Create old-style items table with 'note' type
        conn.execute_batch(r#"
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
            CREATE TABLE IF NOT EXISTS item_tags (
                id TEXT PRIMARY KEY,
                itemId TEXT NOT NULL,
                tagId TEXT NOT NULL,
                createdAt INTEGER NOT NULL
            );
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
            CREATE TABLE IF NOT EXISTS extension_settings (
                id TEXT PRIMARY KEY,
                extensionId TEXT NOT NULL,
                key TEXT NOT NULL,
                value TEXT,
                updatedAt INTEGER
            );
            CREATE TABLE IF NOT EXISTS migrations (
                id TEXT PRIMARY KEY,
                status TEXT DEFAULT 'pending',
                completedAt INTEGER DEFAULT 0
            );
        "#).unwrap();

        // Insert items with 'note' type
        let now = chrono::Utc::now().timestamp_millis();
        conn.execute(
            "INSERT INTO items (id, type, content, createdAt, updatedAt) VALUES ('item1', 'note', 'https://example.com', ?1, ?1)",
            rusqlite::params![now],
        ).unwrap();
        conn.execute(
            "INSERT INTO items (id, type, content, createdAt, updatedAt) VALUES ('item2', 'note', 'Just a text note', ?1, ?1)",
            rusqlite::params![now],
        ).unwrap();
        conn.execute(
            "INSERT INTO items (id, type, content, createdAt, updatedAt) VALUES ('item3', 'tagset', '{}', ?1, ?1)",
            rusqlite::params![now],
        ).unwrap();

        println!("✓ Phase 1: Old-style items created");
    }

    // Phase 2: Open with init_database (should run migrations)
    {
        let conn = datastore::init_database(&db_path).unwrap();

        // Check that note types were migrated
        let item1 = datastore::get_item(&conn, "item1").unwrap().unwrap();
        assert_eq!(item1.item_type, "url", "URL content should become 'url' type");
        println!("✓ Phase 2: note with URL content migrated to 'url'");

        let item2 = datastore::get_item(&conn, "item2").unwrap().unwrap();
        assert_eq!(item2.item_type, "text", "Text content should become 'text' type");
        println!("✓ Phase 2: note with text content migrated to 'text'");

        let item3 = datastore::get_item(&conn, "item3").unwrap().unwrap();
        assert_eq!(item3.item_type, "tagset", "tagset type should be preserved");
        println!("✓ Phase 2: tagset type preserved");

        // New columns should exist with defaults
        assert_eq!(item1.synced_at, 0);
        assert_eq!(item1.visit_count, 0);
        assert_eq!(item1.last_visit_at, 0);
        println!("✓ Phase 2: New columns have defaults after migration");

        // Verify we can insert new types
        let opts = datastore::ItemOptions {
            content: Some("new url".to_string()),
            ..Default::default()
        };
        let new_id = datastore::add_item(&conn, "url", &opts).unwrap();
        let new_item = datastore::get_item(&conn, &new_id).unwrap().unwrap();
        assert_eq!(new_item.item_type, "url");
        println!("✓ Phase 2: Can insert new 'url' type items");
    }

    println!("✓ Item type migration complete");
}

/// Test datastore version check
#[test]
fn test_datastore_version_check() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");

    let conn = datastore::init_database(&db_path).unwrap();

    // Check that version was written
    let version: String = conn.query_row(
        "SELECT value FROM extension_settings WHERE extensionId = 'system' AND key = 'datastoreVersion'",
        [],
        |row| row.get(0),
    ).expect("Version should be written to extension_settings");

    assert_eq!(version, datastore::DATASTORE_VERSION.to_string());
    println!("✓ Datastore version written: {}", version);

    // Verify constants
    assert_eq!(datastore::DATASTORE_VERSION, 1);
    assert_eq!(datastore::PROTOCOL_VERSION, 1);
    println!("✓ Version constants correct");
}

/// Test items and item_tags in valid_tables
#[test]
fn test_items_in_valid_tables() {
    let temp_dir = TempDir::new().unwrap();
    let db_path = temp_dir.path().join("test.sqlite");
    let conn = datastore::init_database(&db_path).unwrap();

    // get_table should work for items and item_tags
    let items_table = datastore::get_table(&conn, "items").expect("items should be a valid table");
    assert_eq!(items_table.len(), 0);
    println!("✓ 'items' is a valid table for get_table");

    let item_tags_table = datastore::get_table(&conn, "item_tags").expect("item_tags should be a valid table");
    assert_eq!(item_tags_table.len(), 0);
    println!("✓ 'item_tags' is a valid table for get_table");

    // themes should be valid too
    let themes_table = datastore::get_table(&conn, "themes").expect("themes should be a valid table");
    assert_eq!(themes_table.len(), 0);
    println!("✓ 'themes' is a valid table for get_table");
}

/// Main test runner - prints summary
fn main() {
    println!("\n🧪 Tauri Backend Smoke Tests\n");
    println!("Run with: cargo test --test smoke\n");
}
