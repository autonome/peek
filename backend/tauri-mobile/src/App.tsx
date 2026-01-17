import { useState, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

type ItemType = "page" | "text" | "tagset" | "image";

interface ItemMetadata {
  title?: string;
  selectedText?: string;
  sourceApp?: string;
  sharedAt?: string;
}

interface SavedUrl {
  id: string;
  url: string;
  tags: string[];
  saved_at: string;
  metadata?: ItemMetadata;
}

interface SavedText {
  id: string;
  content: string;
  tags: string[];
  saved_at: string;
  metadata?: ItemMetadata;
}

interface SavedTagset {
  id: string;
  tags: string[];
  saved_at: string;
  metadata?: ItemMetadata;
}

interface SavedImage {
  id: string;
  tags: string[];
  saved_at: string;
  metadata?: ItemMetadata;
  thumbnail?: string; // Base64-encoded thumbnail
  mime_type: string;
  width?: number;
  height?: number;
}

interface TagStats {
  name: string;
  frequency: number;
  last_used: string;
  frecency_score: number;
}

interface SyncResult {
  success: boolean;
  synced_count: number;
  message: string;
}

// Unified item for combined list
interface UnifiedItem {
  id: string;
  type: ItemType;
  url?: string;
  content?: string;
  tags: string[];
  saved_at: string;
  metadata?: ItemMetadata;
  thumbnail?: string;
  mime_type?: string;
  width?: number;
  height?: number;
}

function App() {
  // Filter state: "all" shows everything, or a single type
  const [activeFilter, setActiveFilter] = useState<ItemType | "all">("all");

  // Data state
  const [savedUrls, setSavedUrls] = useState<SavedUrl[]>([]);
  const [savedTexts, setSavedTexts] = useState<SavedText[]>([]);
  const [savedTagsets, setSavedTagsets] = useState<SavedTagset[]>([]);
  const [savedImages, setSavedImages] = useState<SavedImage[]>([]);
  const [allTags, setAllTags] = useState<TagStats[]>([]);

  // Page editing state
  const [editingUrlId, setEditingUrlId] = useState<string | null>(null);
  const [editingUrlValue, setEditingUrlValue] = useState("");
  const [editingTags, setEditingTags] = useState<Set<string>>(new Set());
  const [editingUrlTags, setEditingUrlTags] = useState<TagStats[]>([]); // Domain-boosted tags for editing
  const [newTagInput, setNewTagInput] = useState("");

  // Text creation/editing state
  const [editingTextId, setEditingTextId] = useState<string | null>(null);
  const [editingTextContent, setEditingTextContent] = useState("");

  // Tagset editing state
  const [editingTagsetId, setEditingTagsetId] = useState<string | null>(null);
  const [editingTagsetTags, setEditingTagsetTags] = useState<Set<string>>(new Set());
  const [editingTagsetInput, setEditingTagsetInput] = useState("");

  // Image editing state
  const [editingImageId, setEditingImageId] = useState<string | null>(null);
  const [editingImageTags, setEditingImageTags] = useState<Set<string>>(new Set());
  const [editingImageTagInput, setEditingImageTagInput] = useState("");

  // Unified add input state
  const [addInputText, setAddInputText] = useState("");
  const [addInputTags, setAddInputTags] = useState<Set<string>>(new Set());
  const [addInputExpanded, setAddInputExpanded] = useState(false);
  const [addInputNewTag, setAddInputNewTag] = useState("");

  // Scroll ref for scroll-to-top
  const mainRef = useRef<HTMLElement>(null);

  // UI state
  const [isDark, setIsDark] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState("");
  const [webhookUrlInput, setWebhookUrlInput] = useState("");
  const [webhookApiKey, setWebhookApiKey] = useState("");
  const [webhookApiKeyInput, setWebhookApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);

  // Detect system dark mode via native iOS API
  useEffect(() => {
    const checkDarkMode = async () => {
      try {
        const nativeDark = await invoke<boolean>("is_dark_mode");
        setIsDark(nativeDark);
      } catch (error) {
        // Fallback to JS media query
        const jsMediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        setIsDark(jsMediaQuery.matches);
      }
    };

    checkDarkMode();

    // Listen for system theme changes via media query
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => checkDarkMode();
    mediaQuery.addEventListener("change", handleChange);

    // Also check when app resumes from background
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        checkDarkMode();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      mediaQuery.removeEventListener("change", handleChange);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Apply dark class to body
  useEffect(() => {
    document.body.classList.toggle("dark", isDark);
  }, [isDark]);

  // Load data on mount and when app returns to foreground
  useEffect(() => {
    const loadData = () => {
      loadSavedUrls();
      loadSavedTexts();
      loadSavedTagsets();
      loadSavedImages();
      loadAllTags();
    };

    const tryAutoSync = async () => {
      try {
        await invoke("auto_sync_if_needed");
      } catch (error) {
        // Silently ignore auto-sync errors
        console.log("Auto-sync check:", error);
      }
    };

    loadData();
    loadWebhookUrl();
    loadWebhookApiKey();
    loadLastSync();
    tryAutoSync();

    // Reload when app comes back to foreground (to pick up items from share extension)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadData();
        tryAutoSync();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Reset empty expanded input when app returns to foreground
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // If input is expanded but empty, collapse it
        if (addInputExpanded && !addInputText.trim() && addInputTags.size === 0) {
          setAddInputExpanded(false);
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [addInputExpanded, addInputText, addInputTags]);

  const loadWebhookUrl = async () => {
    try {
      const url = await invoke<string | null>("get_webhook_url");
      if (url) {
        setWebhookUrl(url);
        setWebhookUrlInput(url);
      }
    } catch (error) {
      console.error("Failed to load webhook URL:", error);
    }
  };

  const loadWebhookApiKey = async () => {
    try {
      const key = await invoke<string | null>("get_webhook_api_key");
      if (key) {
        setWebhookApiKey(key);
        setWebhookApiKeyInput(key);
      }
    } catch (error) {
      console.error("Failed to load webhook API key:", error);
    }
  };

  const loadLastSync = async () => {
    try {
      const sync = await invoke<string | null>("get_last_sync");
      setLastSync(sync);
    } catch (error) {
      console.error("Failed to load last sync:", error);
    }
  };

  const saveWebhookSettings = async () => {
    try {
      await invoke("set_webhook_url", { url: webhookUrlInput });
      await invoke("set_webhook_api_key", { key: webhookApiKeyInput });
      setWebhookUrl(webhookUrlInput);
      setWebhookApiKey(webhookApiKeyInput);
      setSyncMessage("Settings saved");
      setTimeout(() => setSyncMessage(null), 2000);
    } catch (error) {
      console.error("Failed to save webhook settings:", error);
      setSyncMessage("Failed to save settings");
      setTimeout(() => setSyncMessage(null), 3000);
    }
  };

  const syncToWebhook = async () => {
    if (!webhookUrl) {
      setSyncMessage("Please save a webhook URL first");
      setTimeout(() => setSyncMessage(null), 3000);
      return;
    }

    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const result = await invoke<SyncResult>("sync_to_webhook");
      setSyncMessage(result.message);
      await loadLastSync(); // Refresh last sync timestamp
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (error) {
      console.error("Failed to sync:", error);
      setSyncMessage(`Sync failed: ${error}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  const loadSavedUrls = async () => {
    try {
      const urls = await invoke<SavedUrl[]>("get_saved_urls");
      setSavedUrls(urls);
    } catch (error) {
      console.error("Failed to load saved URLs:", error);
    }
  };

  const loadSavedTexts = async () => {
    try {
      const texts = await invoke<SavedText[]>("get_saved_texts");
      setSavedTexts(texts);
    } catch (error) {
      console.error("Failed to load saved texts:", error);
    }
  };

  const loadSavedTagsets = async () => {
    try {
      const tagsets = await invoke<SavedTagset[]>("get_saved_tagsets");
      setSavedTagsets(tagsets);
    } catch (error) {
      console.error("Failed to load saved tagsets:", error);
    }
  };

  const loadSavedImages = async () => {
    try {
      const images = await invoke<SavedImage[]>("get_saved_images");
      setSavedImages(images);
    } catch (error) {
      console.error("Failed to load saved images:", error);
    }
  };

  const loadAllTags = async () => {
    try {
      const tags = await invoke<TagStats[]>("get_tags_by_frecency");
      setAllTags(tags);
    } catch (error) {
      console.error("Failed to load tags:", error);
    }
  };

  const startEditing = async (item: SavedUrl) => {
    setEditingUrlId(item.id);
    setEditingUrlValue(item.url);
    setEditingTags(new Set(item.tags));
    setNewTagInput("");

    // Fetch domain-boosted tags for this URL
    try {
      const tags = await invoke<TagStats[]>("get_tags_by_frecency_for_url", { url: item.url });
      setEditingUrlTags(tags);
    } catch (error) {
      console.error("Failed to load domain-boosted tags:", error);
      setEditingUrlTags(allTags); // Fallback to regular tags
    }
  };

  const cancelEditing = () => {
    setEditingUrlId(null);
    setEditingUrlValue("");
    setEditingTags(new Set());
    setEditingUrlTags([]);
    setNewTagInput("");
  };

  const deleteUrl = async (id: string) => {
    console.log("[Frontend] deleteUrl called for id:", id);
    try {
      await invoke("delete_url", { id });
      console.log("[Frontend] delete_url invoke succeeded");
      await loadSavedUrls();
      cancelEditing();
    } catch (error) {
      console.error("[Frontend] Failed to delete URL:", error);
    }
  };

  const toggleTag = (tagName: string) => {
    const newTags = new Set(editingTags);
    if (newTags.has(tagName)) {
      newTags.delete(tagName);
    } else {
      newTags.add(tagName);
    }
    setEditingTags(newTags);
  };

  const addNewTag = () => {
    const newTags = new Set(editingTags);
    const parts = newTagInput.split(",");
    let added = false;

    for (const part of parts) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed && !newTags.has(trimmed)) {
        newTags.add(trimmed);
        added = true;
      }
    }

    if (added) {
      setEditingTags(newTags);
    }
    setNewTagInput("");
  };

  const handleNewTagKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      addNewTag();
    }
  };

  const saveChanges = async () => {
    if (!editingUrlId) return;

    // If there's text in the new tag field, add it first (matches share extension behavior)
    const finalTags = new Set(editingTags);
    if (newTagInput.trim()) {
      const parts = newTagInput.split(",");
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed) {
          finalTags.add(trimmed);
        }
      }
      setNewTagInput("");
    }

    const tagsArray = Array.from(finalTags);
    console.log("[Frontend] saveChanges called");
    console.log("[Frontend] editingUrlId:", editingUrlId);
    console.log("[Frontend] url:", editingUrlValue);
    console.log("[Frontend] tags to save:", tagsArray);

    try {
      await invoke("update_url", {
        id: editingUrlId,
        url: editingUrlValue,
        tags: tagsArray,
      });
      console.log("[Frontend] update_url invoke succeeded");
      await loadSavedUrls();
      await loadAllTags();
      cancelEditing();
    } catch (error) {
      console.error("[Frontend] Failed to update URL:", error);
    }
  };

  // Unified add input functions
  const toggleAddInputTag = (tagName: string) => {
    const newTags = new Set(addInputTags);
    if (newTags.has(tagName)) {
      newTags.delete(tagName);
    } else {
      newTags.add(tagName);
    }
    setAddInputTags(newTags);
  };

  const resetAddInput = () => {
    setAddInputText("");
    setAddInputTags(new Set());
    setAddInputExpanded(false);
    setAddInputNewTag("");
  };

  const addInputAddNewTag = () => {
    const newTags = new Set(addInputTags);
    const parts = addInputNewTag.split(",");
    for (const part of parts) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed) {
        newTags.add(trimmed);
      }
    }
    setAddInputTags(newTags);
    setAddInputNewTag("");
  };

  const saveAddInput = async () => {
    const text = addInputText.trim();

    // Include any text in the new tag field
    const finalTags = new Set(addInputTags);
    if (addInputNewTag.trim()) {
      const parts = addInputNewTag.split(",");
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed) {
          finalTags.add(trimmed);
        }
      }
    }
    const tags = Array.from(finalTags);

    // Detect type based on content
    const isUrl = text.startsWith("http://") || text.startsWith("https://");

    if (isUrl) {
      // Save as URL
      try {
        await invoke("save_url", { url: text, tags });
        resetAddInput();
        await loadSavedUrls();
        await loadAllTags();
      } catch (error) {
        console.error("Failed to save URL:", error);
      }
    } else if (text) {
      // Save as text (note)
      try {
        await invoke("save_text", { content: text, extra_tags: tags });
        resetAddInput();
        await loadSavedTexts();
        await loadAllTags();
      } catch (error) {
        console.error("Failed to save text:", error);
      }
    } else if (tags.length > 0) {
      // Save as tagset (tags only, no text)
      try {
        await invoke("save_tagset", { tags });
        resetAddInput();
        await loadSavedTagsets();
        await loadAllTags();
      } catch (error) {
        console.error("Failed to save tagset:", error);
      }
    }
  };

  // Detect what type the input would create
  const getAddInputType = (): "url" | "text" | "tagset" | null => {
    const text = addInputText.trim();
    if (text.startsWith("http://") || text.startsWith("https://")) return "url";
    if (text) return "text";
    if (addInputTags.size > 0) return "tagset";
    return null;
  };

  const startEditingText = (item: SavedText) => {
    setEditingTextId(item.id);
    setEditingTextContent(item.content);
  };

  const cancelEditingText = () => {
    setEditingTextId(null);
    setEditingTextContent("");
  };

  const saveTextChanges = async () => {
    if (!editingTextId) return;

    try {
      await invoke("update_text", {
        id: editingTextId,
        content: editingTextContent,
      });
      await loadSavedTexts();
      await loadAllTags();
      cancelEditingText();
    } catch (error) {
      console.error("Failed to update text:", error);
    }
  };

  const deleteText = async (id: string) => {
    try {
      await invoke("delete_url", { id }); // delete_url works for all item types
      await loadSavedTexts();
      cancelEditingText();
    } catch (error) {
      console.error("Failed to delete text:", error);
    }
  };

  // Tagset editing functions
  const startEditingTagset = (item: SavedTagset) => {
    setEditingTagsetId(item.id);
    setEditingTagsetTags(new Set(item.tags));
    setEditingTagsetInput("");
  };

  const cancelEditingTagset = () => {
    setEditingTagsetId(null);
    setEditingTagsetTags(new Set());
    setEditingTagsetInput("");
  };

  const toggleEditingTagsetTag = (tagName: string) => {
    const newTags = new Set(editingTagsetTags);
    if (newTags.has(tagName)) {
      newTags.delete(tagName);
    } else {
      newTags.add(tagName);
    }
    setEditingTagsetTags(newTags);
  };

  const addEditingTagsetTag = () => {
    const newTags = new Set(editingTagsetTags);
    const parts = editingTagsetInput.split(",");
    for (const part of parts) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed) {
        newTags.add(trimmed);
      }
    }
    setEditingTagsetTags(newTags);
    setEditingTagsetInput("");
  };

  const saveTagsetChanges = async () => {
    if (!editingTagsetId) return;

    // Include any text in the input field
    const finalTags = new Set(editingTagsetTags);
    if (editingTagsetInput.trim()) {
      const parts = editingTagsetInput.split(",");
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed) {
          finalTags.add(trimmed);
        }
      }
    }

    if (finalTags.size === 0) {
      console.error("At least one tag is required");
      return;
    }

    try {
      await invoke("update_tagset", {
        id: editingTagsetId,
        tags: Array.from(finalTags),
      });
      await loadSavedTagsets();
      await loadAllTags();
      cancelEditingTagset();
    } catch (error) {
      console.error("Failed to update tagset:", error);
    }
  };

  const deleteTagset = async (id: string) => {
    try {
      await invoke("delete_url", { id }); // delete_url works for all item types
      await loadSavedTagsets();
      cancelEditingTagset();
    } catch (error) {
      console.error("Failed to delete tagset:", error);
    }
  };

  // Image editing functions
  const startEditingImage = (item: SavedImage) => {
    setEditingImageId(item.id);
    setEditingImageTags(new Set(item.tags));
    setEditingImageTagInput("");
  };

  const cancelEditingImage = () => {
    setEditingImageId(null);
    setEditingImageTags(new Set());
    setEditingImageTagInput("");
  };

  const toggleEditingImageTag = (tagName: string) => {
    const newTags = new Set(editingImageTags);
    if (newTags.has(tagName)) {
      newTags.delete(tagName);
    } else {
      newTags.add(tagName);
    }
    setEditingImageTags(newTags);
  };

  const addEditingImageTag = () => {
    const newTags = new Set(editingImageTags);
    const parts = editingImageTagInput.split(",");
    for (const part of parts) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed) {
        newTags.add(trimmed);
      }
    }
    setEditingImageTags(newTags);
    setEditingImageTagInput("");
  };

  const saveImageChanges = async () => {
    if (!editingImageId) return;

    // Include any text in the input field
    const finalTags = new Set(editingImageTags);
    if (editingImageTagInput.trim()) {
      const parts = editingImageTagInput.split(",");
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed) {
          finalTags.add(trimmed);
        }
      }
    }

    try {
      await invoke("update_image_tags", {
        id: editingImageId,
        tags: Array.from(finalTags),
      });
      await loadSavedImages();
      await loadAllTags();
      cancelEditingImage();
    } catch (error) {
      console.error("Failed to update image:", error);
    }
  };

  // Helper to extract hashtags from text for display
  const extractHashtags = (content: string): string[] => {
    const matches = content.match(/#(\w+)/g);
    return matches ? matches.map((m) => m.slice(1).toLowerCase()) : [];
  };

  // Set filter to show only a specific type
  const selectFilter = (type: ItemType) => {
    // If already showing this type, go back to all
    if (activeFilter === type) {
      setActiveFilter("all");
    } else {
      setActiveFilter(type);
    }
  };

  // Scroll to top of the list
  const scrollToTop = () => {
    mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Reset to show all types (home view) and scroll to top
  const showAll = () => {
    setActiveFilter("all");
    scrollToTop();
  };

  // Create unified sorted list
  const getUnifiedItems = (): UnifiedItem[] => {
    const items: UnifiedItem[] = [];
    const showType = (type: ItemType) => activeFilter === "all" || activeFilter === type;

    if (showType("page")) {
      savedUrls.forEach((url) => {
        items.push({
          id: url.id,
          type: "page",
          url: url.url,
          tags: url.tags,
          saved_at: url.saved_at,
          metadata: url.metadata,
        });
      });
    }

    if (showType("text")) {
      savedTexts.forEach((text) => {
        items.push({
          id: text.id,
          type: "text",
          content: text.content,
          tags: text.tags,
          saved_at: text.saved_at,
          metadata: text.metadata,
        });
      });
    }

    if (showType("tagset")) {
      savedTagsets.forEach((tagset) => {
        items.push({
          id: tagset.id,
          type: "tagset",
          tags: tagset.tags,
          saved_at: tagset.saved_at,
          metadata: tagset.metadata,
        });
      });
    }

    if (showType("image")) {
      savedImages.forEach((image) => {
        items.push({
          id: image.id,
          type: "image",
          tags: image.tags,
          saved_at: image.saved_at,
          metadata: image.metadata,
          thumbnail: image.thumbnail,
          mime_type: image.mime_type,
          width: image.width,
          height: image.height,
        });
      });
    }

    // Sort by date, newest first
    return items.sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());
  };

  // Render unified item based on type
  const renderUnifiedItem = (item: UnifiedItem) => {
    switch (item.type) {
      case "page":
        return renderUrlItem({
          id: item.id,
          url: item.url!,
          tags: item.tags,
          saved_at: item.saved_at,
          metadata: item.metadata,
        });
      case "text":
        return renderTextItem({
          id: item.id,
          content: item.content!,
          tags: item.tags,
          saved_at: item.saved_at,
          metadata: item.metadata,
        });
      case "tagset":
        return renderTagsetItem({
          id: item.id,
          tags: item.tags,
          saved_at: item.saved_at,
          metadata: item.metadata,
        });
      case "image":
        return renderImageItem({
          id: item.id,
          tags: item.tags,
          saved_at: item.saved_at,
          metadata: item.metadata,
          thumbnail: item.thumbnail,
          mime_type: item.mime_type || "image/jpeg",
          width: item.width,
          height: item.height,
        });
      default:
        return null;
    }
  };

  const renderUrlItem = (item: SavedUrl) => {
    const isEditing = editingUrlId === item.id;

    if (isEditing) {
      // Use domain-boosted tags for unused tag suggestions
      const unusedTags = editingUrlTags.filter((tag) => !editingTags.has(tag.name));

      return (
        <div key={item.id} className="saved-url-item editing">
          <div className="edit-section">
            <input
              type="url"
              className="edit-url-input"
              value={editingUrlValue}
              onChange={(e) => setEditingUrlValue(e.target.value)}
              placeholder="URL"
              autoCapitalize="none"
              autoCorrect="off"
            />
          </div>

          <div className="edit-section">
            <div className="editing-tags">
              {editingTags.size === 0 ? (
                <span className="no-tags">No tags selected</span>
              ) : (
                Array.from(editingTags).sort().map((tag) => (
                  <span key={tag} className="editing-tag">
                    {tag}
                    <button onClick={() => toggleTag(tag)}>&times;</button>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="edit-section">
            <div className="new-tag-input">
              <input
                type="text"
                value={newTagInput}
                onChange={(e) => setNewTagInput(e.target.value)}
                onKeyDown={handleNewTagKeyDown}
                placeholder="Add tag..."
                autoCapitalize="none"
                autoCorrect="off"
              />
              <button onClick={addNewTag} disabled={!newTagInput.trim()}>
                Add
              </button>
            </div>
          </div>

          {unusedTags.length > 0 && (
            <div className="edit-section">
              <div className="all-tags-list">
                {unusedTags.map((tag) => (
                  <span
                    key={tag.name}
                    className="tag-chip"
                    onClick={() => toggleTag(tag.name)}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="edit-buttons">
            <button className="delete-btn" onClick={() => deleteUrl(item.id)}>
              Delete
            </button>
            <button className="cancel-btn" onClick={cancelEditing}>
              Cancel
            </button>
            <button className="save-btn" onClick={saveChanges}>
              Save
            </button>
          </div>
        </div>
      );
    }

    const title = item.metadata?.title;

    return (
      <div key={item.id} className="saved-url-item">
        <div className="item-type-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          Page
        </div>
        <div className="url-row">
          <div className="url-info">
            {title && <div className="url-title">{title}</div>}
            <a href={item.url} target="_blank" rel="noopener noreferrer" className={title ? "url-with-title" : ""}>
              {item.url}
            </a>
          </div>
          <div className="item-actions">
            <button className="icon-btn" onClick={() => startEditing(item)} title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button className="icon-btn delete" onClick={() => deleteUrl(item.id)} title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div className="saved-url-tags">
          {item.tags.map((tag) => (
            <span key={tag} className="saved-url-tag">
              {tag}
            </span>
          ))}
        </div>
        <div className="saved-url-date">
          {new Date(item.saved_at).toLocaleDateString()}
        </div>
      </div>
    );
  };

  const renderTextItem = (item: SavedText) => {
    const isEditing = editingTextId === item.id;
    const tags = extractHashtags(item.content);

    if (isEditing) {
      return (
        <div key={item.id} className="saved-text-item editing">
          <div className="edit-section">
            <textarea
              className="edit-text-input"
              value={editingTextContent}
              onChange={(e) => setEditingTextContent(e.target.value)}
              placeholder="Text with #hashtags..."
              rows={4}
            />
          </div>
          <div className="edit-section">
            <p className="hashtag-hint">Hashtags in text become tags automatically</p>
          </div>
          <div className="edit-buttons">
            <button className="delete-btn" onClick={() => deleteText(item.id)}>
              Delete
            </button>
            <button className="cancel-btn" onClick={cancelEditingText}>
              Cancel
            </button>
            <button className="save-btn" onClick={saveTextChanges}>
              Save
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={item.id} className="saved-text-item">
        <div className="item-type-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
          </svg>
          Note
        </div>
        <div className="text-row">
          <div className="text-content">{item.content}</div>
          <div className="item-actions">
            <button className="icon-btn" onClick={() => startEditingText(item)} title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button className="icon-btn delete" onClick={() => deleteText(item.id)} title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        {tags.length > 0 && (
          <div className="saved-text-tags">
            {tags.map((tag) => (
              <span key={tag} className="saved-text-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="saved-text-date">
          {new Date(item.saved_at).toLocaleDateString()}
        </div>
      </div>
    );
  };

  const renderTagsetItem = (item: SavedTagset) => {
    const isEditing = editingTagsetId === item.id;

    if (isEditing) {
      const unusedTags = allTags.filter((tag) => !editingTagsetTags.has(tag.name));

      return (
        <div key={item.id} className="saved-tagset-item editing">
          <div className="edit-section">
            <div className="editing-tags">
              {editingTagsetTags.size === 0 ? (
                <span className="no-tags">No tags selected</span>
              ) : (
                Array.from(editingTagsetTags).sort().map((tag) => (
                  <span key={tag} className="editing-tag">
                    {tag}
                    <button onClick={() => toggleEditingTagsetTag(tag)}>&times;</button>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="edit-section">
            <div className="new-tag-input">
              <input
                type="text"
                value={editingTagsetInput}
                onChange={(e) => setEditingTagsetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEditingTagsetTag();
                  }
                }}
                placeholder="Add tag..."
                autoCapitalize="none"
                autoCorrect="off"
              />
              <button onClick={addEditingTagsetTag} disabled={!editingTagsetInput.trim()}>
                Add
              </button>
            </div>
          </div>

          {unusedTags.length > 0 && (
            <div className="edit-section">
              <div className="all-tags-list">
                {unusedTags.map((tag) => (
                  <span
                    key={tag.name}
                    className="tag-chip"
                    onClick={() => toggleEditingTagsetTag(tag.name)}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="edit-buttons">
            <button className="delete-btn" onClick={() => deleteTagset(item.id)}>
              Delete
            </button>
            <button className="cancel-btn" onClick={cancelEditingTagset}>
              Cancel
            </button>
            <button className="save-btn" onClick={saveTagsetChanges}>
              Save
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={item.id} className="saved-tagset-item">
        <div className="item-type-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
            <line x1="7" y1="7" x2="7.01" y2="7"></line>
          </svg>
          Tag Set
        </div>
        <div className="tagset-row">
          <div className="tagset-tags">
            {item.tags.map((tag) => (
              <span key={tag} className="saved-tagset-tag">
                {tag}
              </span>
            ))}
          </div>
          <div className="item-actions">
            <button className="icon-btn" onClick={() => startEditingTagset(item)} title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button className="icon-btn delete" onClick={() => deleteTagset(item.id)} title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        <div className="saved-tagset-date">
          {new Date(item.saved_at).toLocaleDateString()}
        </div>
      </div>
    );
  };

  const deleteImage = async (id: string) => {
    try {
      await invoke("delete_url", { id }); // delete_url works for all item types
      await loadSavedImages();
    } catch (error) {
      console.error("Failed to delete image:", error);
    }
  };

  const renderImageItem = (item: SavedImage) => {
    const isEditing = editingImageId === item.id;
    const metadata = item.metadata as Record<string, unknown> | undefined;
    const title = metadata?.title as string | undefined;
    const sourceUrl = metadata?.sourceUrl as string | undefined;
    const dimensions = item.width && item.height ? `${item.width}×${item.height}` : null;

    if (isEditing) {
      const unusedTags = allTags.filter((tag) => !editingImageTags.has(tag.name));

      return (
        <div key={item.id} className="saved-image-item editing">
          <div className="image-row">
            <div className="image-preview">
              {item.thumbnail ? (
                <img
                  src={`data:image/jpeg;base64,${item.thumbnail}`}
                  alt={title || "Preview"}
                  className="image-thumbnail"
                />
              ) : (
                <div className="image-placeholder">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                    <circle cx="8.5" cy="8.5" r="1.5"></circle>
                    <polyline points="21 15 16 10 5 21"></polyline>
                  </svg>
                </div>
              )}
            </div>
            <div className="image-info">
              {title && <div className="image-title">{title}</div>}
              {sourceUrl && (
                <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={`image-source ${title ? "with-title" : ""}`}>
                  {sourceUrl}
                </a>
              )}
            </div>
          </div>

          <div className="edit-section">
            <div className="editing-tags">
              {editingImageTags.size === 0 ? (
                <span className="no-tags">No tags selected</span>
              ) : (
                Array.from(editingImageTags).sort().map((tag) => (
                  <span key={tag} className="editing-tag">
                    {tag}
                    <button onClick={() => toggleEditingImageTag(tag)}>&times;</button>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="edit-section">
            <div className="new-tag-input">
              <input
                type="text"
                value={editingImageTagInput}
                onChange={(e) => setEditingImageTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEditingImageTag();
                  }
                }}
                placeholder="Add tag..."
                autoCapitalize="none"
                autoCorrect="off"
              />
              <button onClick={addEditingImageTag} disabled={!editingImageTagInput.trim()}>
                Add
              </button>
            </div>
          </div>

          {unusedTags.length > 0 && (
            <div className="edit-section">
              <div className="all-tags-list">
                {unusedTags.map((tag) => (
                  <span
                    key={tag.name}
                    className="tag-chip"
                    onClick={() => toggleEditingImageTag(tag.name)}
                  >
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="edit-buttons">
            <button className="delete-btn" onClick={() => deleteImage(item.id)}>
              Delete
            </button>
            <button className="cancel-btn" onClick={cancelEditingImage}>
              Cancel
            </button>
            <button className="save-btn" onClick={saveImageChanges}>
              Save
            </button>
          </div>
        </div>
      );
    }

    return (
      <div key={item.id} className="saved-image-item">
        <div className="item-type-indicator">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
            <circle cx="8.5" cy="8.5" r="1.5"></circle>
            <polyline points="21 15 16 10 5 21"></polyline>
          </svg>
          Image
        </div>
        <div className="image-row">
          <div className="image-preview">
            {item.thumbnail ? (
              <img
                src={`data:image/jpeg;base64,${item.thumbnail}`}
                alt={title || "Preview"}
                className="image-thumbnail"
              />
            ) : (
              <div className="image-placeholder">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                  <circle cx="8.5" cy="8.5" r="1.5"></circle>
                  <polyline points="21 15 16 10 5 21"></polyline>
                </svg>
              </div>
            )}
          </div>
          <div className="image-info">
            {title && <div className="image-title">{title}</div>}
            {sourceUrl && (
              <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className={`image-source ${title ? "with-title" : ""}`}>
                {sourceUrl}
              </a>
            )}
            {dimensions && <div className="image-dimensions">{dimensions}</div>}
          </div>
          <div className="item-actions">
            <button className="icon-btn" onClick={() => startEditingImage(item)} title="Edit">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
              </svg>
            </button>
            <button className="icon-btn delete" onClick={() => deleteImage(item.id)} title="Delete">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          </div>
        </div>
        {item.tags.length > 0 && (
          <div className="saved-image-tags">
            {item.tags.map((tag) => (
              <span key={tag} className="saved-image-tag">
                {tag}
              </span>
            ))}
          </div>
        )}
        <div className="saved-image-date">
          {new Date(item.saved_at).toLocaleDateString()}
        </div>
      </div>
    );
  };

  const closeSettings = () => {
    setShowSettings(false);
    // Reload data in case webhook was used
    loadSavedUrls();
    loadAllTags();
  };

  if (showSettings) {
    return (
      <div className="app">
        <header>
          <button className="header-btn back-btn" onClick={closeSettings}>
            Back
          </button>
          <h1>Settings</h1>
          <div className="header-spacer"></div>
        </header>

        <main className="settings-view">
          <div className="settings-section">
            <h2>Webhook Sync</h2>
            <p className="settings-description">
              Enter a webhook URL to sync your saved items. Items are automatically sent when saved, and you can also sync all items manually.
            </p>

            <div className="webhook-input">
              <input
                type="url"
                value={webhookUrlInput}
                onChange={(e) => setWebhookUrlInput(e.target.value)}
                placeholder="https://example.com/webhook"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            <div className="webhook-input api-key-field">
              <input
                type={showApiKey ? "text" : "password"}
                value={webhookApiKeyInput}
                onChange={(e) => setWebhookApiKeyInput(e.target.value)}
                placeholder="API key (optional)"
                autoCapitalize="none"
                autoCorrect="off"
              />
              <button
                type="button"
                className="toggle-visibility-btn"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                    <line x1="1" y1="1" x2="23" y2="23"></line>
                  </svg>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                    <circle cx="12" cy="12" r="3"></circle>
                  </svg>
                )}
              </button>
            </div>

            <button
              onClick={saveWebhookSettings}
              disabled={webhookUrlInput === webhookUrl && webhookApiKeyInput === webhookApiKey}
              className="save-settings-btn"
            >
              Save Settings
            </button>

            {lastSync && (
              <p className="last-sync-info">
                Last synced: {new Date(lastSync).toLocaleString()}
              </p>
            )}

            <button
              className="sync-btn"
              onClick={syncToWebhook}
              disabled={!webhookUrl || isSyncing}
            >
              {isSyncing ? "Syncing..." : lastSync ? "Sync Now" : `Sync All Items (${savedUrls.length + savedTexts.length + savedTagsets.length + savedImages.length})`}
            </button>

            {syncMessage && (
              <div className={`sync-message ${syncMessage.includes("failed") || syncMessage.includes("Failed") ? "error" : "success"}`}>
                {syncMessage}
              </div>
            )}
          </div>
        </main>
      </div>
    );
  }

  const unifiedItems = getUnifiedItems();
  const totalCount = savedUrls.length + savedTexts.length + savedTagsets.length + savedImages.length;

  return (
    <div className="app">
      <header>
        <h1 onClick={activeFilter !== "all" ? showAll : scrollToTop} style={{ cursor: "pointer" }}>
          Peek
        </h1>
        <div className="filter-icons">
          <button
            className={`filter-btn ${activeFilter === "page" ? "active" : ""}`}
            onClick={() => selectFilter("page")}
            title="Pages"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
            <span className="filter-count">{savedUrls.length}</span>
          </button>
          <button
            className={`filter-btn ${activeFilter === "text" ? "active" : ""}`}
            onClick={() => selectFilter("text")}
            title="Notes"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
            <span className="filter-count">{savedTexts.length}</span>
          </button>
          <button
            className={`filter-btn ${activeFilter === "tagset" ? "active" : ""}`}
            onClick={() => selectFilter("tagset")}
            title="Tag Sets"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
              <line x1="7" y1="7" x2="7.01" y2="7"></line>
            </svg>
            <span className="filter-count">{savedTagsets.length}</span>
          </button>
          <button
            className={`filter-btn ${activeFilter === "image" ? "active" : ""}`}
            onClick={() => selectFilter("image")}
            title="Images"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
              <circle cx="8.5" cy="8.5" r="1.5"></circle>
              <polyline points="21 15 16 10 5 21"></polyline>
            </svg>
            <span className="filter-count">{savedImages.length}</span>
          </button>
        </div>
        <button className="header-btn settings-btn" onClick={() => setShowSettings(true)}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </header>

      <main className="saved-view" ref={mainRef}>
        {/* Unified add input */}
        <div className={`unified-add-input ${addInputExpanded ? "expanded" : ""}`}>
          {!addInputExpanded ? (
            <input
              type="text"
              className="add-input-collapsed"
              placeholder="Add note, URL, or tags..."
              value={addInputText}
              onChange={(e) => setAddInputText(e.target.value)}
              onFocus={() => setAddInputExpanded(true)}
              autoCapitalize="none"
              autoCorrect="off"
            />
          ) : (
            <>
              <textarea
                className="add-input-expanded"
                placeholder="Enter text, URL, or just select tags..."
                value={addInputText}
                onChange={(e) => setAddInputText(e.target.value)}
                rows={3}
                autoFocus
              />
              <div className="new-tag-input">
                <input
                  type="text"
                  value={addInputNewTag}
                  onChange={(e) => setAddInputNewTag(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addInputAddNewTag();
                    }
                  }}
                  placeholder="Add new tag..."
                  autoCapitalize="none"
                  autoCorrect="off"
                />
                <button onClick={addInputAddNewTag} disabled={!addInputNewTag.trim()}>
                  Add
                </button>
              </div>

              {allTags.length > 0 && (
                <div className="add-input-available-tags">
                  {allTags.map((tag) => (
                    <span
                      key={tag.name}
                      className={`tag-chip ${addInputTags.has(tag.name) ? "selected" : ""}`}
                      onClick={() => toggleAddInputTag(tag.name)}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              )}
              <div className="add-input-actions">
                <button className="add-input-cancel" onClick={resetAddInput}>
                  Cancel
                </button>
                <button
                  className="add-input-save"
                  onClick={saveAddInput}
                  disabled={!getAddInputType()}
                >
                  Save
                </button>
              </div>
            </>
          )}
        </div>

        <div className="unified-list">
          {totalCount === 0 ? (
            <div className="empty-state">
              <p>No saved items yet.</p>
              <p>Share a URL from any app to get started!</p>
            </div>
          ) : unifiedItems.length === 0 ? (
            <div className="empty-state">
              <p>No {activeFilter === "page" ? "pages" : activeFilter === "text" ? "notes" : activeFilter === "tagset" ? "tag sets" : "images"} saved yet.</p>
              <p>Tap Peek to see all items.</p>
            </div>
          ) : (
            unifiedItems.map((item) => renderUnifiedItem(item))
          )}
        </div>
      </main>
    </div>
  );
}

export default App;
