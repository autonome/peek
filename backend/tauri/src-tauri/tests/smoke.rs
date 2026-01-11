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

/// Main test runner - prints summary
fn main() {
    println!("\n🧪 Tauri Backend Smoke Tests\n");
    println!("Run with: cargo test --test smoke\n");
}
