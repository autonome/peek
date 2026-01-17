import UIKit
import UniformTypeIdentifiers
import GRDB
import Network
import os.log

private let shareLog = OSLog(subsystem: "com.dietrich.peek-mobile.share", category: "ShareExtension")

// MARK: - Item Types
enum ItemType: String {
    case page = "page"
    case text = "text"
    case tagset = "tagset"
}

// MARK: - Database Records
struct ItemRecord: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "items"

    var id: String
    var type: String
    var url: String?
    var content: String?
    var metadata: String?  // JSON-encoded metadata
    var created_at: String
    var updated_at: String
    var deleted_at: String?
}

struct TagRecord: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "tags"

    var id: Int64?
    var name: String
    var frequency: Int
    var last_used: String
    var frecency_score: Double
    var created_at: String
    var updated_at: String
}

struct ItemTagRecord: Codable, FetchableRecord, PersistableRecord {
    static let databaseTableName = "item_tags"

    var item_id: String
    var tag_id: Int64
    var created_at: String
}

// MARK: - View Models (for UI)
struct TagStats {
    var name: String
    var frequency: Int
    var last_used: String
    var frecency_score: Double
}

struct SavedItem {
    var id: String
    var itemType: ItemType
    var url: String?
    var content: String?
    var tags: [String]
    var saved_at: String
    var metadata: [String: Any]?
}

// For backward compatibility
typealias SavedUrl = SavedItem

// MARK: - Database Manager
class DatabaseManager {
    static let shared = DatabaseManager()

    private var dbQueue: DatabaseQueue?
    private let networkMonitor = NWPathMonitor()
    private var isConnected = false

    private init() {
        setupDatabase()
        setupNetworkMonitor()
    }

    private func setupNetworkMonitor() {
        networkMonitor.pathUpdateHandler = { [weak self] path in
            self?.isConnected = (path.status == .satisfied)
        }
        networkMonitor.start(queue: DispatchQueue.global(qos: .background))
    }

    private func getAppGroupContainerPath() -> URL? {
        return FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: "group.com.dietrich.peek-mobile")
    }

    private func setupDatabase() {
        guard let containerURL = getAppGroupContainerPath() else {
            print("[DB] Failed to get App Group container")
            return
        }

        let dbPath = containerURL.appendingPathComponent("peek.db")
        print("[DB] Opening database at: \(dbPath.path)")

        do {
            var config = Configuration()
            config.prepareDatabase { db in
                // Enable WAL mode for concurrent access
                try db.execute(sql: "PRAGMA journal_mode=WAL")
            }

            dbQueue = try DatabaseQueue(path: dbPath.path, configuration: config)
            try createTables()
            print("[DB] Database initialized successfully")
        } catch {
            print("[DB] Failed to setup database: \(error)")
        }
    }

    private func createTables() throws {
        try dbQueue?.write { db in
            // Check if we need migration from old schema
            let hasOldSchema = try db.tableExists("urls") && !db.tableExists("items")

            if hasOldSchema {
                // Migrate from old schema
                print("[DB] Migrating from urls/url_tags to items/item_tags")

                // Create new tables
                try db.execute(sql: """
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

                    CREATE TABLE IF NOT EXISTS item_tags (
                        item_id TEXT NOT NULL,
                        tag_id INTEGER NOT NULL,
                        created_at TEXT NOT NULL,
                        PRIMARY KEY (item_id, tag_id),
                        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                    );
                """)

                // Migrate data
                try db.execute(sql: """
                    INSERT INTO items (id, type, url, created_at, updated_at, deleted_at)
                        SELECT id, 'page', url, created_at, updated_at, deleted_at FROM urls;

                    INSERT INTO item_tags (item_id, tag_id, created_at)
                        SELECT url_id, tag_id, created_at FROM url_tags;
                """)

                // Drop old tables
                try db.execute(sql: """
                    DROP TABLE IF EXISTS url_tags;
                    DROP TABLE IF EXISTS urls;
                """)

                print("[DB] Migration complete")
            } else {
                // Create new schema directly
                try db.execute(sql: """
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

                    CREATE TABLE IF NOT EXISTS item_tags (
                        item_id TEXT NOT NULL,
                        tag_id INTEGER NOT NULL,
                        created_at TEXT NOT NULL,
                        PRIMARY KEY (item_id, tag_id),
                        FOREIGN KEY (item_id) REFERENCES items(id) ON DELETE CASCADE,
                        FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
                    );
                """)
            }

            // Add metadata column if it doesn't exist (for existing installs without metadata)
            let hasMetadataColumn = try db.columns(in: "items").contains { $0.name == "metadata" }
            if !hasMetadataColumn {
                print("[DB] Adding metadata column to items table...")
                try db.execute(sql: "ALTER TABLE items ADD COLUMN metadata TEXT")
                print("[DB] Metadata column added")
            }

            // Create tags and settings tables (always needed)
            try db.execute(sql: """
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

                CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
                CREATE INDEX IF NOT EXISTS idx_items_url ON items(url);
                CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
                CREATE INDEX IF NOT EXISTS idx_tags_name ON tags(name);
                CREATE INDEX IF NOT EXISTS idx_tags_frecency ON tags(frecency_score DESC);
            """)
        }
    }

    func loadTags() -> [TagStats] {
        do {
            return try dbQueue?.read { db in
                let records = try TagRecord.order(Column("frecency_score").desc).fetchAll(db)
                return records.map { TagStats(name: $0.name, frequency: $0.frequency, last_used: $0.last_used, frecency_score: $0.frecency_score) }
            } ?? []
        } catch {
            print("[DB] Failed to load tags: \(error)")
            return []
        }
    }

    /// Load tags with domain affinity boost - tags used on URLs from the same domain get a 2x score multiplier
    func loadTagsWithDomainBoost(forDomain domain: String?) -> [TagStats] {
        guard let domain = domain else {
            return loadTags()
        }

        do {
            return try dbQueue?.read { db in
                // Get all tags
                let records = try TagRecord.fetchAll(db)

                // Get tag IDs that have been used on items with the same domain
                // Using LIKE pattern: %://domain/% or %://domain (for root URLs)
                let domainPattern = "%://\(domain)/%"
                let domainPatternRoot = "%://\(domain)"
                let wwwDomainPattern = "%://www.\(domain)/%"
                let wwwDomainPatternRoot = "%://www.\(domain)"

                let domainTagIds = try Int64.fetchSet(db, sql: """
                    SELECT DISTINCT it.tag_id
                    FROM item_tags it
                    JOIN items i ON it.item_id = i.id
                    WHERE i.deleted_at IS NULL
                      AND i.type = 'page'
                      AND (i.url LIKE ? OR i.url LIKE ? OR i.url LIKE ? OR i.url LIKE ?)
                """, arguments: [domainPattern, domainPatternRoot, wwwDomainPattern, wwwDomainPatternRoot])

                // Apply 2x multiplier to tags used on same-domain URLs
                let boostedTags = records.map { record -> TagStats in
                    let boostedScore = domainTagIds.contains(record.id ?? -1)
                        ? record.frecency_score * 2.0
                        : record.frecency_score
                    return TagStats(
                        name: record.name,
                        frequency: record.frequency,
                        last_used: record.last_used,
                        frecency_score: boostedScore
                    )
                }

                // Sort by boosted score descending
                return boostedTags.sorted { $0.frecency_score > $1.frecency_score }
            } ?? []
        } catch {
            print("[DB] Failed to load tags with domain boost: \(error)")
            return loadTags()
        }
    }

    func findExistingUrl(_ url: String) -> SavedItem? {
        do {
            return try dbQueue?.read { db in
                guard let record = try ItemRecord
                    .filter(Column("url") == url && Column("type") == "page" && Column("deleted_at") == nil)
                    .fetchOne(db) else {
                    return nil
                }

                // Get tags for this item
                let tagNames = try String.fetchAll(db, sql: """
                    SELECT t.name FROM tags t
                    JOIN item_tags it ON t.id = it.tag_id
                    WHERE it.item_id = ?
                    ORDER BY t.name
                """, arguments: [record.id])

                return SavedItem(id: record.id, itemType: .page, url: record.url, content: nil, tags: tagNames, saved_at: record.created_at)
            }
        } catch {
            print("[DB] Failed to find URL: \(error)")
            return nil
        }
    }

    func saveUrl(url: String, tags: [String], metadata: [String: Any]?, existingId: String?, existingSavedAt: String?, completion: @escaping () -> Void) {
        saveItem(itemType: .page, url: url, content: nil, tags: tags, metadata: metadata, existingId: existingId, existingSavedAt: existingSavedAt, completion: completion)
    }

    func saveText(content: String, tags: [String], metadata: [String: Any]?, existingId: String?, existingSavedAt: String?, completion: @escaping () -> Void) {
        saveItem(itemType: .text, url: nil, content: content, tags: tags, metadata: metadata, existingId: existingId, existingSavedAt: existingSavedAt, completion: completion)
    }

    private func saveItem(itemType: ItemType, url: String?, content: String?, tags: [String], metadata: [String: Any]?, existingId: String?, existingSavedAt: String?, completion: @escaping () -> Void) {
        let now = ISO8601DateFormatter.shared.string(from: Date())
        var savedItemId: String?
        var savedMetadata = metadata

        // Serialize metadata to JSON string
        var metadataJson: String? = nil
        if let metadata = metadata, !metadata.isEmpty {
            if let jsonData = try? JSONSerialization.data(withJSONObject: metadata),
               let jsonString = String(data: jsonData, encoding: .utf8) {
                metadataJson = jsonString
            }
        }

        do {
            try dbQueue?.write { db in
                let itemId: String
                var existingTagNames: Set<String> = []

                if let existingId = existingId {
                    // Get existing tags for this item before removing associations
                    let existingTags = try String.fetchAll(db, sql: """
                        SELECT t.name FROM tags t
                        JOIN item_tags it ON t.id = it.tag_id
                        WHERE it.item_id = ?
                    """, arguments: [existingId])
                    existingTagNames = Set(existingTags)

                    // Update existing item (include metadata if we have new metadata)
                    if itemType == .page {
                        if metadataJson != nil {
                            try db.execute(sql: "UPDATE items SET url = ?, metadata = ?, updated_at = ? WHERE id = ?", arguments: [url, metadataJson, now, existingId])
                        } else {
                            try db.execute(sql: "UPDATE items SET url = ?, updated_at = ? WHERE id = ?", arguments: [url, now, existingId])
                        }
                    } else if itemType == .text {
                        if metadataJson != nil {
                            try db.execute(sql: "UPDATE items SET content = ?, metadata = ?, updated_at = ? WHERE id = ?", arguments: [content, metadataJson, now, existingId])
                        } else {
                            try db.execute(sql: "UPDATE items SET content = ?, updated_at = ? WHERE id = ?", arguments: [content, now, existingId])
                        }
                    }

                    // Remove old tag associations
                    try db.execute(sql: "DELETE FROM item_tags WHERE item_id = ?", arguments: [existingId])

                    itemId = existingId
                    print("[DB] Updated existing item: \(existingId)")
                } else {
                    // Insert new item
                    let newId = UUID().uuidString
                    let record = ItemRecord(id: newId, type: itemType.rawValue, url: url, content: content, metadata: metadataJson, created_at: now, updated_at: now, deleted_at: nil)
                    try record.insert(db)
                    itemId = newId
                    print("[DB] Inserted new \(itemType.rawValue): \(newId)")
                }

                // Add tags
                for tagName in tags {
                    // Get or create tag
                    var tagId: Int64
                    // Only increment frequency if this tag is new to this item
                    let isNewToItem = !existingTagNames.contains(tagName)

                    if let existingTag = try TagRecord.filter(Column("name") == tagName).fetchOne(db) {
                        tagId = existingTag.id!

                        if isNewToItem {
                            // Only update frequency for tags that are new to this item
                            let newFrequency = existingTag.frequency + 1
                            let frecency = calculateFrecency(frequency: newFrequency, lastUsed: now)

                            try db.execute(sql: """
                                UPDATE tags SET frequency = ?, last_used = ?, frecency_score = ?, updated_at = ?
                                WHERE id = ?
                            """, arguments: [newFrequency, now, frecency, now, existingTag.id!])
                        } else {
                            // Tag was already on this item, just update last_used and recalculate frecency
                            let frecency = calculateFrecency(frequency: existingTag.frequency, lastUsed: now)
                            try db.execute(sql: """
                                UPDATE tags SET last_used = ?, frecency_score = ?, updated_at = ?
                                WHERE id = ?
                            """, arguments: [now, frecency, now, existingTag.id!])
                        }
                    } else {
                        // Create new tag
                        let frecency = calculateFrecency(frequency: 1, lastUsed: now)
                        var newTag = TagRecord(id: nil, name: tagName, frequency: 1, last_used: now, frecency_score: frecency, created_at: now, updated_at: now)
                        try newTag.insert(db)
                        tagId = db.lastInsertedRowID
                    }

                    // Create item-tag association
                    let itemTag = ItemTagRecord(item_id: itemId, tag_id: tagId, created_at: now)
                    try itemTag.insert(db, onConflict: .ignore)
                }

                print("[DB] Saved \(itemType.rawValue) with \(tags.count) tags")
                savedItemId = itemId
            }

            // Push to webhook OUTSIDE of the database write block
            if let itemId = savedItemId {
                let savedAt = existingSavedAt ?? now
                if itemType == .page, let url = url {
                    pushToWebhook(urlId: itemId, urlString: url, tags: tags, metadata: savedMetadata, savedAt: savedAt, completion: completion)
                } else if itemType == .text, let content = content {
                    pushTextToWebhook(textId: itemId, content: content, tags: tags, metadata: savedMetadata, savedAt: savedAt, completion: completion)
                } else {
                    completion()
                }
            } else {
                completion()
            }
        } catch {
            print("[DB] Failed to save item: \(error)")
            completion()
        }
    }

    private func getWebhookUrl() -> String? {
        do {
            return try dbQueue?.read { db in
                try String.fetchOne(db, sql: "SELECT value FROM settings WHERE key = 'webhook_url'")
            }
        } catch {
            return nil
        }
    }

    private func getWebhookApiKey() -> String? {
        do {
            return try dbQueue?.read { db in
                try String.fetchOne(db, sql: "SELECT value FROM settings WHERE key = 'webhook_api_key'")
            }
        } catch {
            return nil
        }
    }

    private func pushToWebhook(urlId: String, urlString: String, tags: [String], metadata: [String: Any]?, savedAt: String, completion: @escaping () -> Void) {
        guard isConnected else {
            print("[Webhook] Offline - skipping webhook push")
            completion()
            return
        }

        guard let webhookUrlString = getWebhookUrl()?.trimmingCharacters(in: .whitespaces), !webhookUrlString.isEmpty else {
            print("[Webhook] No webhook URL configured")
            completion()
            return
        }

        guard let webhookUrl = URL(string: webhookUrlString) else {
            print("[Webhook] Invalid webhook URL: \(webhookUrlString)")
            completion()
            return
        }

        print("[Webhook] Pushing URL to: \(webhookUrlString)")

        var urlItem: [String: Any] = [
            "id": urlId,
            "url": urlString,
            "tags": tags,
            "saved_at": savedAt
        ]

        // Include metadata if present
        if let metadata = metadata, !metadata.isEmpty {
            urlItem["metadata"] = metadata
        }

        let payload: [String: Any] = [
            "urls": [urlItem],
            "texts": [],
            "tagsets": []
        ]

        sendWebhookRequest(to: webhookUrl, payload: payload, completion: completion)
    }

    private func pushTextToWebhook(textId: String, content: String, tags: [String], metadata: [String: Any]?, savedAt: String, completion: @escaping () -> Void) {
        guard isConnected else {
            print("[Webhook] Offline - skipping webhook push")
            completion()
            return
        }

        guard let webhookUrlString = getWebhookUrl()?.trimmingCharacters(in: .whitespaces), !webhookUrlString.isEmpty else {
            print("[Webhook] No webhook URL configured")
            completion()
            return
        }

        guard let webhookUrl = URL(string: webhookUrlString) else {
            print("[Webhook] Invalid webhook URL: \(webhookUrlString)")
            completion()
            return
        }

        print("[Webhook] Pushing text to: \(webhookUrlString)")

        var textItem: [String: Any] = [
            "id": textId,
            "content": content,
            "tags": tags,
            "saved_at": savedAt
        ]

        // Include metadata if present
        if let metadata = metadata, !metadata.isEmpty {
            textItem["metadata"] = metadata
        }

        let payload: [String: Any] = [
            "urls": [],
            "texts": [textItem],
            "tagsets": []
        ]

        sendWebhookRequest(to: webhookUrl, payload: payload, completion: completion)
    }

    private func sendWebhookRequest(to webhookUrl: URL, payload: [String: Any], completion: @escaping () -> Void) {
        guard let jsonData = try? JSONSerialization.data(withJSONObject: payload) else {
            print("[Webhook] Failed to serialize payload")
            completion()
            return
        }

        var request = URLRequest(url: webhookUrl)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.httpBody = jsonData

        // Add API key if configured
        if let apiKey = getWebhookApiKey()?.trimmingCharacters(in: .whitespaces), !apiKey.isEmpty {
            request.setValue("Bearer \(apiKey)", forHTTPHeaderField: "Authorization")
        }

        URLSession.shared.dataTask(with: request) { data, response, error in
            if let error = error {
                print("[Webhook] Push failed: \(error)")
            } else if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode >= 200 && httpResponse.statusCode < 300 {
                    print("[Webhook] Push successful")
                } else {
                    print("[Webhook] Push returned error: \(httpResponse.statusCode)")
                }
            }
            completion()
        }.resume()
    }

    private func calculateFrecency(frequency: Int, lastUsed: String) -> Double {
        guard let lastUsedDate = ISO8601DateFormatter.shared.date(from: lastUsed) else {
            return Double(frequency) * 10.0
        }

        let daysSinceUse = Date().timeIntervalSince(lastUsedDate) / 86400.0
        let decayFactor = 1.0 / (1.0 + daysSinceUse / 7.0)

        return Double(frequency) * 10.0 * decayFactor
    }
}

// MARK: - ISO8601 Formatter Extension
extension ISO8601DateFormatter {
    static let shared: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

// MARK: - URL Domain Extraction
extension String {
    func extractDomain() -> String? {
        guard let url = URL(string: self),
              let host = url.host else {
            return nil
        }
        // Remove www. prefix if present
        return host.hasPrefix("www.") ? String(host.dropFirst(4)) : host
    }
}

// MARK: - ShareViewController
class ShareViewController: UIViewController {
    var sharedURL: String?
    var sharedText: String?
    var sharedItemType: ItemType = .page
    var sharedMetadata: [String: Any] = [:]  // Captured metadata from share extension
    var selectedTags: Set<String> = []
    var availableTags: [TagStats] = []
    var existingSavedItem: SavedItem?

    let scrollView = UIScrollView()
    let contentStackView = UIStackView()
    let contentLabel = UILabel()  // Shows URL or text content

    // Selected tags at top - self-sizing
    let selectedTagsCollectionView: SelfSizingCollectionView = {
        let layout = LeftAlignedFlowLayout()
        layout.estimatedItemSize = UICollectionViewFlowLayout.automaticSize
        layout.minimumInteritemSpacing = 8
        layout.minimumLineSpacing = 8
        return SelfSizingCollectionView(frame: .zero, collectionViewLayout: layout)
    }()

    // Unused tags at bottom - self-sizing
    let unusedTagsCollectionView: SelfSizingCollectionView = {
        let layout = LeftAlignedFlowLayout()
        layout.estimatedItemSize = UICollectionViewFlowLayout.automaticSize
        layout.minimumInteritemSpacing = 8
        layout.minimumLineSpacing = 8
        return SelfSizingCollectionView(frame: .zero, collectionViewLayout: layout)
    }()

    let newTagTextField = UITextField()
    let addTagButton = UIButton(type: .system)
    let closeButton = UIButton(type: .system)
    let statusLabel = UILabel()

    let noTagsLabel = UILabel()
    let inputContainerView = UIView()

    override func viewDidLoad() {
        super.viewDidLoad()

        view.backgroundColor = .systemBackground

        setupUI()
        setupGestures()
        loadSharedContent()
        loadTags()
    }

    private func setupGestures() {
        // Tap empty area to dismiss
        let tapToDismiss = UITapGestureRecognizer(target: self, action: #selector(handleTapToDismiss(_:)))
        tapToDismiss.cancelsTouchesInView = false
        tapToDismiss.delegate = self
        view.addGestureRecognizer(tapToDismiss)
    }

    @objc private func handleTapToDismiss(_ gesture: UITapGestureRecognizer) {
        let location = gesture.location(in: view)

        // Check if tap is below the content (in the empty area)
        let contentBottom = scrollView.frame.origin.y + contentStackView.frame.maxY + 20
        if location.y > contentBottom {
            closePressed()
        }
    }

    override func viewWillAppear(_ animated: Bool) {
        super.viewWillAppear(animated)
        configureSheetPresentation()
    }

    override func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        newTagTextField.becomeFirstResponder()
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        updatePreferredContentSize()
    }

    private func configureSheetPresentation() {
        // For Share Extensions, we use preferredContentSize instead of UISheetPresentationController
        // because iOS controls the presentation, not our code
        updatePreferredContentSize()
    }

    private func updatePreferredContentSize() {
        // Calculate the actual content height needed
        view.layoutIfNeeded()

        let contentHeight = contentStackView.systemLayoutSizeFitting(
            CGSize(width: view.bounds.width - 32, height: UIView.layoutFittingCompressedSize.height),
            withHorizontalFittingPriority: .required,
            verticalFittingPriority: .fittingSizeLevel
        ).height

        // Add padding: top (20) + bottom (20) + safe area
        let safeAreaBottom = view.safeAreaInsets.bottom
        let totalHeight = contentHeight + 40 + safeAreaBottom

        // Clamp between min and max
        let minHeight: CGFloat = 250
        let maxHeight = UIScreen.main.bounds.height * 0.85
        let finalHeight = min(max(totalHeight, minHeight), maxHeight)

        // Set preferredContentSize - this is how Share Extensions tell iOS what size they want
        let newSize = CGSize(width: view.bounds.width, height: finalHeight)
        if preferredContentSize != newSize {
            preferredContentSize = newSize
        }
    }

    func setupUI() {
        // Header with close button
        let headerView = UIView()
        headerView.translatesAutoresizingMaskIntoConstraints = false
        view.addSubview(headerView)

        closeButton.setTitle("Done", for: .normal)
        closeButton.titleLabel?.font = .boldSystemFont(ofSize: 17)
        closeButton.addTarget(self, action: #selector(closePressed), for: .touchUpInside)
        closeButton.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(closeButton)

        let titleLabel = UILabel()
        titleLabel.text = "Save to Peek"
        titleLabel.font = .systemFont(ofSize: 17, weight: .semibold)
        titleLabel.translatesAutoresizingMaskIntoConstraints = false
        headerView.addSubview(titleLabel)

        // Status label (shows "Saved!" or "Already saved")
        statusLabel.font = .systemFont(ofSize: 13, weight: .medium)
        statusLabel.textColor = .systemGreen
        statusLabel.translatesAutoresizingMaskIntoConstraints = false
        statusLabel.alpha = 0
        headerView.addSubview(statusLabel)

        // Scroll view for content
        scrollView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.alwaysBounceVertical = false
        scrollView.keyboardDismissMode = .interactive
        view.addSubview(scrollView)

        // Content stack view inside scroll view
        contentStackView.axis = .vertical
        contentStackView.spacing = 12
        contentStackView.alignment = .fill
        contentStackView.translatesAutoresizingMaskIntoConstraints = false
        scrollView.addSubview(contentStackView)

        // URL Label
        contentLabel.font = .systemFont(ofSize: 16, weight: .regular)
        contentLabel.numberOfLines = 2
        contentLabel.textColor = .secondaryLabel
        contentLabel.lineBreakMode = .byTruncatingTail
        contentStackView.addArrangedSubview(contentLabel)

        // Selected tags section label
        let selectedLabel = UILabel()
        selectedLabel.text = "Selected Tags"
        selectedLabel.font = .systemFont(ofSize: 13, weight: .medium)
        selectedLabel.textColor = .secondaryLabel
        contentStackView.addArrangedSubview(selectedLabel)
        contentStackView.setCustomSpacing(8, after: contentLabel)

        // Selected Tags Collection View - self-sizing
        selectedTagsCollectionView.backgroundColor = .systemBackground
        selectedTagsCollectionView.delegate = self
        selectedTagsCollectionView.dataSource = self
        selectedTagsCollectionView.tag = 1
        selectedTagsCollectionView.isScrollEnabled = false
        selectedTagsCollectionView.register(SelectedTagCell.self, forCellWithReuseIdentifier: "SelectedTagCell")
        contentStackView.addArrangedSubview(selectedTagsCollectionView)

        // Input container (text field + add button)
        inputContainerView.translatesAutoresizingMaskIntoConstraints = false
        contentStackView.addArrangedSubview(inputContainerView)

        newTagTextField.placeholder = "Add new tag..."
        newTagTextField.borderStyle = .roundedRect
        newTagTextField.autocapitalizationType = .none
        newTagTextField.autocorrectionType = .no
        newTagTextField.font = .systemFont(ofSize: 16)
        newTagTextField.returnKeyType = .done
        newTagTextField.translatesAutoresizingMaskIntoConstraints = false
        newTagTextField.delegate = self
        inputContainerView.addSubview(newTagTextField)

        addTagButton.setTitle("Add", for: .normal)
        addTagButton.titleLabel?.font = .boldSystemFont(ofSize: 15)
        addTagButton.backgroundColor = .systemGreen
        addTagButton.setTitleColor(.white, for: .normal)
        addTagButton.layer.cornerRadius = 8
        addTagButton.contentEdgeInsets = UIEdgeInsets(top: 8, left: 16, bottom: 8, right: 16)
        addTagButton.addTarget(self, action: #selector(addTagPressed), for: .touchUpInside)
        addTagButton.translatesAutoresizingMaskIntoConstraints = false
        inputContainerView.addSubview(addTagButton)

        // Available tags section label
        let availableLabel = UILabel()
        availableLabel.text = "Available Tags"
        availableLabel.font = .systemFont(ofSize: 13, weight: .medium)
        availableLabel.textColor = .secondaryLabel
        contentStackView.addArrangedSubview(availableLabel)

        // Unused Tags Collection View - self-sizing
        unusedTagsCollectionView.backgroundColor = .systemBackground
        unusedTagsCollectionView.delegate = self
        unusedTagsCollectionView.dataSource = self
        unusedTagsCollectionView.tag = 2
        unusedTagsCollectionView.isScrollEnabled = false
        unusedTagsCollectionView.register(TagCell.self, forCellWithReuseIdentifier: "TagCell")
        contentStackView.addArrangedSubview(unusedTagsCollectionView)

        // Layout constraints
        NSLayoutConstraint.activate([
            // Header at top
            headerView.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor),
            headerView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            headerView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            headerView.heightAnchor.constraint(equalToConstant: 44),

            titleLabel.centerXAnchor.constraint(equalTo: headerView.centerXAnchor),
            titleLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            statusLabel.leadingAnchor.constraint(equalTo: headerView.leadingAnchor, constant: 16),
            statusLabel.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            closeButton.trailingAnchor.constraint(equalTo: headerView.trailingAnchor, constant: -16),
            closeButton.centerYAnchor.constraint(equalTo: headerView.centerYAnchor),

            // Scroll view below header
            scrollView.topAnchor.constraint(equalTo: headerView.bottomAnchor),
            scrollView.leadingAnchor.constraint(equalTo: view.leadingAnchor),
            scrollView.trailingAnchor.constraint(equalTo: view.trailingAnchor),
            scrollView.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor),

            // Content stack view inside scroll view
            contentStackView.topAnchor.constraint(equalTo: scrollView.topAnchor, constant: 12),
            contentStackView.leadingAnchor.constraint(equalTo: scrollView.leadingAnchor, constant: 16),
            contentStackView.trailingAnchor.constraint(equalTo: scrollView.trailingAnchor, constant: -16),
            contentStackView.bottomAnchor.constraint(equalTo: scrollView.bottomAnchor, constant: -20),
            contentStackView.widthAnchor.constraint(equalTo: scrollView.widthAnchor, constant: -32),

            // Input container internal layout
            inputContainerView.heightAnchor.constraint(equalToConstant: 40),
            newTagTextField.topAnchor.constraint(equalTo: inputContainerView.topAnchor),
            newTagTextField.leadingAnchor.constraint(equalTo: inputContainerView.leadingAnchor),
            newTagTextField.trailingAnchor.constraint(equalTo: addTagButton.leadingAnchor, constant: -8),
            newTagTextField.bottomAnchor.constraint(equalTo: inputContainerView.bottomAnchor),
            addTagButton.centerYAnchor.constraint(equalTo: inputContainerView.centerYAnchor),
            addTagButton.trailingAnchor.constraint(equalTo: inputContainerView.trailingAnchor),

            // Minimum heights for collection views
            selectedTagsCollectionView.heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
            unusedTagsCollectionView.heightAnchor.constraint(greaterThanOrEqualToConstant: 36),
        ])
    }

    @objc func addTagPressed() {
        guard let text = newTagTextField.text?.trimmingCharacters(in: .whitespaces).lowercased(),
              !text.isEmpty else { return }

        // Support comma-separated tags
        let parts = text.split(separator: ",").map { $0.trimmingCharacters(in: .whitespaces) }
        for part in parts where !part.isEmpty {
            selectedTags.insert(part)
        }

        newTagTextField.text = ""
        updateTagsUI()
        saveCurrentState()
    }

    func loadSharedContent() {
        guard let extensionItem = extensionContext?.inputItems.first as? NSExtensionItem,
              let itemProviders = extensionItem.attachments else {
            os_log("No extension items or attachments", log: shareLog, type: .error)
            return
        }

        // Log what we received for debugging
        os_log("Received %d item providers", log: shareLog, type: .info, itemProviders.count)
        for (index, provider) in itemProviders.enumerated() {
            os_log("Provider %d: %{public}@", log: shareLog, type: .info, index, provider.registeredTypeIdentifiers.joined(separator: ", "))
        }

        // Capture metadata from NSExtensionItem
        captureMetadata(from: extensionItem)

        // Also log the extension item's content
        if let contentText = extensionItem.attributedContentText?.string {
            os_log("Extension item attributedContentText: %{public}@", log: shareLog, type: .info, contentText)
        }

        // Log all available userInfo for debugging
        if let userInfo = extensionItem.userInfo {
            os_log("Extension item userInfo keys: %{public}@", log: shareLog, type: .info, userInfo.keys.map { String(describing: $0) }.joined(separator: ", "))
        }

        // Search all providers for http/https URLs (not file:// URLs)
        // We need to check all providers because Safari may provide multiple
        for provider in itemProviders {
            // Try loading as URL object first
            if provider.canLoadObject(ofClass: URL.self) {
                os_log("Provider can load URL object, attempting...", log: shareLog, type: .info)
                provider.loadObject(ofClass: URL.self) { [weak self] (url, error) in
                    if let error = error {
                        os_log("Error loading URL object: %{public}@", log: shareLog, type: .error, error.localizedDescription)
                    }
                    if let url = url {
                        os_log("Loaded URL object: %{public}@", log: shareLog, type: .info, url.absoluteString)
                        // Only accept http/https URLs, not file:// URLs
                        if url.scheme == "http" || url.scheme == "https" {
                            DispatchQueue.main.async {
                                self?.setSharedURL(url.absoluteString)
                            }
                        } else {
                            os_log("Ignoring non-http URL: %{public}@", log: shareLog, type: .info, url.scheme ?? "nil")
                        }
                    }
                }
            }

            // Try public.url type identifier
            if provider.hasItemConformingToTypeIdentifier("public.url") {
                os_log("Provider has public.url, attempting...", log: shareLog, type: .info)
                provider.loadItem(forTypeIdentifier: "public.url", options: nil) { [weak self] (item, error) in
                    if let error = error {
                        os_log("Error loading public.url: %{public}@", log: shareLog, type: .error, error.localizedDescription)
                    }
                    var urlString: String?

                    if let url = item as? URL {
                        urlString = url.absoluteString
                        os_log("public.url loaded as URL: %{public}@", log: shareLog, type: .info, urlString ?? "")
                    } else if let data = item as? Data, let url = URL(dataRepresentation: data, relativeTo: nil) {
                        urlString = url.absoluteString
                        os_log("public.url loaded as Data->URL: %{public}@", log: shareLog, type: .info, urlString ?? "")
                    } else if let string = item as? String {
                        urlString = string
                        os_log("public.url loaded as String: %{public}@", log: shareLog, type: .info, urlString ?? "")
                    } else {
                        os_log("public.url item type: %{public}@", log: shareLog, type: .info, String(describing: type(of: item)))
                    }

                    // Only accept http/https URLs
                    if let urlString = urlString,
                       (urlString.hasPrefix("http://") || urlString.hasPrefix("https://")) {
                        DispatchQueue.main.async {
                            self?.setSharedURL(urlString)
                        }
                    } else if let urlString = urlString {
                        os_log("Ignoring non-http URL string: %{public}@", log: shareLog, type: .info, urlString)
                    }
                }
            }

            // Try loading as plain text - could be a URL or plain text content
            if provider.hasItemConformingToTypeIdentifier("public.plain-text") {
                os_log("Provider has public.plain-text, attempting...", log: shareLog, type: .info)
                provider.loadItem(forTypeIdentifier: "public.plain-text", options: nil) { [weak self] (item, error) in
                    if let string = item as? String {
                        os_log("public.plain-text loaded: %{public}@", log: shareLog, type: .info, string)
                        // Check if it's a URL
                        if string.hasPrefix("http://") || string.hasPrefix("https://") {
                            DispatchQueue.main.async {
                                self?.setSharedURL(string)
                            }
                        } else {
                            // It's plain text content
                            DispatchQueue.main.async {
                                self?.setSharedText(string)
                            }
                        }
                    }
                }
            }

            // For images, try to get the source URL via suggested name which sometimes contains the URL
            if provider.hasItemConformingToTypeIdentifier("public.image") {
                os_log("Provider has public.image", log: shareLog, type: .info)
                if let suggestedName = provider.suggestedName {
                    os_log("Image suggested name: %{public}@", log: shareLog, type: .info, suggestedName)
                }
            }
        }

        // Also check attributedContentText for URL
        if let attributedText = extensionItem.attributedContentText,
           let urlString = attributedText.string.components(separatedBy: .whitespaces).first(where: { $0.hasPrefix("http://") || $0.hasPrefix("https://") }) {
            os_log("Found URL in attributedContentText: %{public}@", log: shareLog, type: .info, urlString)
            setSharedURL(urlString)
        }

        // Check userInfo for URL - Safari sometimes puts URL in userInfo
        if let userInfo = extensionItem.userInfo {
            for (key, value) in userInfo {
                os_log("userInfo[%{public}@] = %{public}@", log: shareLog, type: .info, String(describing: key), String(describing: value))
                if let urlString = value as? String,
                   (urlString.hasPrefix("http://") || urlString.hasPrefix("https://")) {
                    os_log("Found URL in userInfo: %{public}@", log: shareLog, type: .info, urlString)
                    setSharedURL(urlString)
                } else if let url = value as? URL,
                          (url.scheme == "http" || url.scheme == "https") {
                    os_log("Found URL object in userInfo: %{public}@", log: shareLog, type: .info, url.absoluteString)
                    setSharedURL(url.absoluteString)
                }
            }
        }
    }

    private func setSharedURL(_ urlString: String) {
        guard sharedURL == nil && sharedText == nil else {
            os_log("Content already set, ignoring URL: %{public}@", log: shareLog, type: .info, urlString)
            return
        }
        os_log("Setting shared URL: %{public}@", log: shareLog, type: .info, urlString)
        sharedURL = urlString
        sharedItemType = .page
        contentLabel.text = urlString
        contentLabel.numberOfLines = 2
        checkIfURLExists()
    }

    private func setSharedText(_ text: String) {
        guard sharedURL == nil && sharedText == nil else {
            os_log("Content already set, ignoring text", log: shareLog, type: .info)
            return
        }
        os_log("Setting shared text: %{public}@", log: shareLog, type: .info, String(text.prefix(50)))
        sharedText = text
        sharedItemType = .text
        contentLabel.text = text
        contentLabel.numberOfLines = 4  // Show more lines for text

        // Parse hashtags from text and add them as tags
        let hashtags = parseHashtags(from: text)
        for tag in hashtags {
            selectedTags.insert(tag)
        }

        // Load tags
        loadTags()

        // Auto-save
        saveCurrentState()

        // Show status
        showStatus("Saved!", color: .systemGreen)
    }

    /// Parse hashtags from text content
    private func parseHashtags(from text: String) -> [String] {
        let pattern = "#(\\w+)"
        guard let regex = try? NSRegularExpression(pattern: pattern, options: []) else {
            return []
        }
        let range = NSRange(text.startIndex..., in: text)
        let matches = regex.matches(in: text, options: [], range: range)

        var tags: [String] = []
        for match in matches {
            if let tagRange = Range(match.range(at: 1), in: text) {
                tags.append(String(text[tagRange]).lowercased())
            }
        }
        return tags
    }

    /// Capture metadata from NSExtensionItem (title, selected text, source app, etc.)
    private func captureMetadata(from extensionItem: NSExtensionItem) {
        var metadata: [String: Any] = [:]

        // Capture page title from attributedTitle (Safari provides this)
        if let title = extensionItem.attributedTitle?.string, !title.isEmpty {
            metadata["title"] = title
            os_log("Captured title: %{public}@", log: shareLog, type: .info, title)
        }

        // Capture selected text or description from attributedContentText
        if let contentText = extensionItem.attributedContentText?.string, !contentText.isEmpty {
            // Don't store if it's just the URL we're already saving
            if contentText != sharedURL {
                metadata["selectedText"] = contentText
                os_log("Captured selectedText: %{public}@", log: shareLog, type: .info, String(contentText.prefix(100)))
            }
        }

        // Capture source app bundle identifier from userInfo
        if let userInfo = extensionItem.userInfo {
            // Try common keys for source app
            if let sourceApp = userInfo["NSExtensionItemSourceApplicationKey"] as? String {
                metadata["sourceApp"] = sourceApp
                os_log("Captured sourceApp: %{public}@", log: shareLog, type: .info, sourceApp)
            } else if let sourceApp = userInfo[NSExtensionItemAttributedTitleKey] as? String {
                // Sometimes the app name is here
                if metadata["title"] == nil {
                    metadata["title"] = sourceApp
                }
            }

            // Check for any URL-related keys that might have title info
            for (key, value) in userInfo {
                let keyStr = String(describing: key)
                if keyStr.lowercased().contains("title"), let titleValue = value as? String, !titleValue.isEmpty {
                    if metadata["title"] == nil {
                        metadata["title"] = titleValue
                        os_log("Captured title from userInfo[%{public}@]: %{public}@", log: shareLog, type: .info, keyStr, titleValue)
                    }
                }
            }
        }

        // Store timestamp of share action
        metadata["sharedAt"] = ISO8601DateFormatter.shared.string(from: Date())

        self.sharedMetadata = metadata
        os_log("Metadata captured: %{public}@", log: shareLog, type: .info, metadata.keys.joined(separator: ", "))
    }

    func checkIfURLExists() {
        guard let url = sharedURL else { return }

        let existing = DatabaseManager.shared.findExistingUrl(url)
        if let existing = existing {
            existingSavedItem = existing
            selectedTags = Set(existing.tags)
        }
        // Reload tags with domain boost now that we know the URL
        loadTags()

        // Auto-save immediately so URL is saved even if user doesn't select any tags
        saveCurrentState()

        // Show status indicator
        if existing != nil {
            showStatus("Already saved", color: .secondaryLabel)
        } else {
            showStatus("Saved!", color: .systemGreen)
        }
    }

    private func showStatus(_ text: String, color: UIColor) {
        statusLabel.text = text
        statusLabel.textColor = color

        UIView.animate(withDuration: 0.2) {
            self.statusLabel.alpha = 1
        }
    }

    func loadTags() {
        let domain = sharedURL?.extractDomain()
        availableTags = DatabaseManager.shared.loadTagsWithDomainBoost(forDomain: domain)
        updateTagsUI()
    }

    func updateTagsUI() {
        // Reload both collection views
        selectedTagsCollectionView.reloadData()
        unusedTagsCollectionView.reloadData()

        // Force layout update for self-sizing collection views
        DispatchQueue.main.async { [weak self] in
            self?.selectedTagsCollectionView.invalidateIntrinsicContentSize()
            self?.unusedTagsCollectionView.invalidateIntrinsicContentSize()
            self?.view.layoutIfNeeded()
            self?.updatePreferredContentSize()
        }
    }

    func getUnusedTags() -> [TagStats] {
        return availableTags.filter { !selectedTags.contains($0.name) }
    }

    func getSortedSelectedTags() -> [String] {
        return Array(selectedTags).sorted()
    }

    /// Save the current state of selectedTags to the database (called instantly on tag changes)
    func saveCurrentState() {
        let finalTags = Array(selectedTags).sorted()
        let metadata = sharedMetadata.isEmpty ? nil : sharedMetadata

        switch sharedItemType {
        case .page:
            guard let url = sharedURL, !url.isEmpty else { return }

            DatabaseManager.shared.saveUrl(
                url: url,
                tags: finalTags,
                metadata: metadata,
                existingId: existingSavedItem?.id,
                existingSavedAt: existingSavedItem?.saved_at
            ) { [weak self] in
                // After first save, update existingSavedItem so subsequent saves are updates
                if self?.existingSavedItem == nil {
                    DispatchQueue.main.async {
                        self?.existingSavedItem = DatabaseManager.shared.findExistingUrl(url)
                    }
                }
            }

        case .text:
            guard let text = sharedText, !text.isEmpty else { return }

            DatabaseManager.shared.saveText(
                content: text,
                tags: finalTags,
                metadata: metadata,
                existingId: existingSavedItem?.id,
                existingSavedAt: existingSavedItem?.saved_at
            ) { [weak self] in
                // For text items, we don't have a lookup function for existing
                // But we track the existingSavedItem after first save
                _ = self  // Silence warning
            }

        case .tagset:
            // Tagsets are not supported in Share Extension
            break
        }
    }

    @objc func closePressed() {
        extensionContext?.completeRequest(returningItems: [], completionHandler: nil)
    }

    func showAlert(_ message: String) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default))
        present(alert, animated: true)
    }
}

// MARK: - UICollectionView
extension ShareViewController: UICollectionViewDelegate, UICollectionViewDataSource {
    func collectionView(_ collectionView: UICollectionView, numberOfItemsInSection section: Int) -> Int {
        if collectionView.tag == 1 {
            // Selected tags
            return getSortedSelectedTags().count
        } else {
            // Unused tags
            return getUnusedTags().count
        }
    }

    func collectionView(_ collectionView: UICollectionView, cellForItemAt indexPath: IndexPath) -> UICollectionViewCell {
        if collectionView.tag == 1 {
            // Selected tags - with remove button
            let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "SelectedTagCell", for: indexPath) as! SelectedTagCell
            let tagName = getSortedSelectedTags()[indexPath.item]
            cell.configure(with: tagName) { [weak self] in
                self?.selectedTags.remove(tagName)
                self?.updateTagsUI()
                self?.saveCurrentState()
            }
            return cell
        } else {
            // Unused tags
            let cell = collectionView.dequeueReusableCell(withReuseIdentifier: "TagCell", for: indexPath) as! TagCell
            let tag = getUnusedTags()[indexPath.item]
            cell.configure(with: tag.name, isSelected: false)
            return cell
        }
    }

    func collectionView(_ collectionView: UICollectionView, didSelectItemAt indexPath: IndexPath) {
        if collectionView.tag == 1 {
            // Tapping selected tag removes it
            let tagName = getSortedSelectedTags()[indexPath.item]
            selectedTags.remove(tagName)
        } else {
            // Tapping unused tag adds it
            let tag = getUnusedTags()[indexPath.item]
            selectedTags.insert(tag.name)
        }
        updateTagsUI()
        saveCurrentState()
    }
}

// MARK: - UITextFieldDelegate
extension ShareViewController: UITextFieldDelegate {
    func textFieldShouldReturn(_ textField: UITextField) -> Bool {
        // Add tag when Return is pressed
        addTagPressed()
        return true
    }
}

// MARK: - UIGestureRecognizerDelegate
extension ShareViewController: UIGestureRecognizerDelegate {
    func gestureRecognizer(_ gestureRecognizer: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        // Don't intercept touches on interactive elements
        let touchedView = touch.view
        if touchedView is UIButton || touchedView is UITextField || touchedView is UICollectionViewCell {
            return false
        }
        // Check if touch is inside a collection view cell
        if let _ = touchedView?.superview as? UICollectionViewCell {
            return false
        }
        return true
    }
}

// MARK: - TagCell
class TagCell: UICollectionViewCell {
    let label = UILabel()

    override init(frame: CGRect) {
        super.init(frame: frame)

        label.font = .systemFont(ofSize: 14)
        label.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(label)

        contentView.layer.cornerRadius = 8
        contentView.layer.borderWidth = 1

        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 8),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 12),
            label.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -12),
            label.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -8)
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with text: String, isSelected: Bool) {
        label.text = text

        if isSelected {
            contentView.backgroundColor = .systemBlue
            contentView.layer.borderColor = UIColor.systemBlue.cgColor
            label.textColor = .white
        } else {
            contentView.backgroundColor = .systemBackground
            contentView.layer.borderColor = UIColor.systemGray4.cgColor
            label.textColor = .label
        }
    }
}

// MARK: - SelectedTagCell (with remove button)
class SelectedTagCell: UICollectionViewCell {
    let label = UILabel()
    let removeButton = UIButton(type: .system)
    var onRemove: (() -> Void)?

    override init(frame: CGRect) {
        super.init(frame: frame)

        label.font = .systemFont(ofSize: 14)
        label.textColor = .white
        label.translatesAutoresizingMaskIntoConstraints = false
        contentView.addSubview(label)

        removeButton.setTitle("×", for: .normal)
        removeButton.titleLabel?.font = .systemFont(ofSize: 18, weight: .medium)
        removeButton.setTitleColor(.white.withAlphaComponent(0.8), for: .normal)
        removeButton.translatesAutoresizingMaskIntoConstraints = false
        removeButton.addTarget(self, action: #selector(removeTapped), for: .touchUpInside)
        contentView.addSubview(removeButton)

        contentView.backgroundColor = .systemBlue
        contentView.layer.cornerRadius = 16

        NSLayoutConstraint.activate([
            label.topAnchor.constraint(equalTo: contentView.topAnchor, constant: 6),
            label.leadingAnchor.constraint(equalTo: contentView.leadingAnchor, constant: 12),
            label.bottomAnchor.constraint(equalTo: contentView.bottomAnchor, constant: -6),

            removeButton.leadingAnchor.constraint(equalTo: label.trailingAnchor, constant: 4),
            removeButton.trailingAnchor.constraint(equalTo: contentView.trailingAnchor, constant: -8),
            removeButton.centerYAnchor.constraint(equalTo: contentView.centerYAnchor),
            removeButton.widthAnchor.constraint(equalToConstant: 20)
        ])
    }

    required init?(coder: NSCoder) {
        fatalError("init(coder:) has not been implemented")
    }

    func configure(with text: String, onRemove: @escaping () -> Void) {
        label.text = text
        self.onRemove = onRemove
    }

    @objc func removeTapped() {
        onRemove?()
    }
}

// MARK: - LeftAlignedFlowLayout
class LeftAlignedFlowLayout: UICollectionViewFlowLayout {
    override func layoutAttributesForElements(in rect: CGRect) -> [UICollectionViewLayoutAttributes]? {
        guard let attributes = super.layoutAttributesForElements(in: rect) else { return nil }

        var leftMargin: CGFloat = sectionInset.left
        var maxY: CGFloat = -1.0

        return attributes.map { attr in
            let newAttr = attr.copy() as! UICollectionViewLayoutAttributes

            if newAttr.frame.origin.y >= maxY {
                leftMargin = sectionInset.left
            }

            newAttr.frame.origin.x = leftMargin
            leftMargin += newAttr.frame.width + minimumInteritemSpacing
            maxY = max(newAttr.frame.maxY, maxY)

            return newAttr
        }
    }
}

// MARK: - Self-Sizing Collection View
class SelfSizingCollectionView: UICollectionView {
    override var contentSize: CGSize {
        didSet {
            invalidateIntrinsicContentSize()
        }
    }

    override var intrinsicContentSize: CGSize {
        layoutIfNeeded()
        return CGSize(width: UIView.noIntrinsicMetric, height: contentSize.height)
    }
}
