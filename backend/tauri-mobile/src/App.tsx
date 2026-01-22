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

interface BidirectionalSyncResult {
  success: boolean;
  pulled: number;
  pushed: number;
  conflicts: number;
  message: string;
}

interface SyncStatus {
  configured: boolean;
  last_sync_time: string | null;
  pending_count: number;
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
  const [editingTextTags, setEditingTextTags] = useState<Set<string>>(new Set());
  const [editingTextTagInput, setEditingTextTagInput] = useState("");

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

  // Camera capture state
  const [capturedImage, setCapturedImage] = useState<string | null>(null); // base64 data URL
  const [capturedImageTags, setCapturedImageTags] = useState<Set<string>>(new Set());
  const [capturedImageTagInput, setCapturedImageTagInput] = useState("");
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Scroll ref for scroll-to-top
  const mainRef = useRef<HTMLElement>(null);

  // Ref for textarea to focus without scroll
  const addTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Focus textarea when expanded, but prevent iOS scroll
  useEffect(() => {
    if (addInputExpanded && addTextareaRef.current) {
      // Small delay to let React render the textarea first
      setTimeout(() => {
        addTextareaRef.current?.focus({ preventScroll: true });
      }, 10);
    }
  }, [addInputExpanded]);

  // Delete confirmation state
  const [pendingDelete, setPendingDelete] = useState<{ id: string; type: ItemType } | null>(null);

  // View mode state (search/browse)
  const [viewModeActive, setViewModeActive] = useState(false);
  const [viewSearchText, setViewSearchText] = useState("");
  const [viewSelectedTags, setViewSelectedTags] = useState<Set<string>>(new Set());

  // View mode swipe tracking
  const viewModeStartY = useRef<number | null>(null);
  const VIEW_SWIPE_THRESHOLD = 100;

  // Toast notification state
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string, type: "success" | "error" = "success") => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToast({ message, type });
    toastTimeoutRef.current = setTimeout(() => setToast(null), 3000);
  };

  // Discard changes confirmation state
  const [pendingDiscard, setPendingDiscard] = useState<{ type: ItemType } | null>(null);

  // Track original values for dirty checking
  const [originalEditValues, setOriginalEditValues] = useState<{
    url?: string; tags?: string[]; content?: string;
  } | null>(null);

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
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);

  // Pull-to-refresh state
  const pullStartY = useRef<number | null>(null);
  const PULL_THRESHOLD = 80;

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
    loadSyncStatus();
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

  const loadSyncStatus = async () => {
    try {
      const status = await invoke<SyncStatus>("get_sync_status");
      setSyncStatus(status);
      if (status.last_sync_time) {
        setLastSync(status.last_sync_time);
      }
    } catch (error) {
      console.error("Failed to load sync status:", error);
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

  // Bidirectional sync: pull then push
  const syncAll = async () => {
    if (!webhookUrl) {
      setSyncMessage("Please save a server URL first");
      setTimeout(() => setSyncMessage(null), 3000);
      return;
    }

    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const result = await invoke<BidirectionalSyncResult>("sync_all");
      const msg = `Synced: ${result.pulled} pulled, ${result.pushed} pushed${result.conflicts > 0 ? `, ${result.conflicts} conflicts` : ''}`;
      setSyncMessage(msg);
      await loadLastSync();
      await loadSyncStatus();
      // Reload data to show new items from server
      loadSavedUrls();
      loadSavedTexts();
      loadSavedTagsets();
      loadSavedImages();
      loadAllTags();
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (error) {
      console.error("Failed to sync:", error);
      setSyncMessage(`Sync failed: ${error}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Pull only from server
  const pullFromServer = async () => {
    if (!webhookUrl) {
      setSyncMessage("Please save a server URL first");
      setTimeout(() => setSyncMessage(null), 3000);
      return;
    }

    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const result = await invoke<BidirectionalSyncResult>("pull_from_server");
      const msg = `Pulled ${result.pulled} items${result.conflicts > 0 ? `, ${result.conflicts} conflicts` : ''}`;
      setSyncMessage(msg);
      await loadSyncStatus();
      // Reload data to show new items from server
      loadSavedUrls();
      loadSavedTexts();
      loadSavedTagsets();
      loadSavedImages();
      loadAllTags();
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (error) {
      console.error("Failed to pull:", error);
      setSyncMessage(`Pull failed: ${error}`);
      setTimeout(() => setSyncMessage(null), 5000);
    } finally {
      setIsSyncing(false);
    }
  };

  // Push only to server
  const pushToServer = async () => {
    if (!webhookUrl) {
      setSyncMessage("Please save a server URL first");
      setTimeout(() => setSyncMessage(null), 3000);
      return;
    }

    setIsSyncing(true);
    setSyncMessage(null);

    try {
      const result = await invoke<BidirectionalSyncResult>("push_to_server");
      setSyncMessage(`Pushed ${result.pushed} items`);
      await loadSyncStatus();
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (error) {
      console.error("Failed to push:", error);
      setSyncMessage(`Push failed: ${error}`);
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

  // Dirty checking helpers
  const hasUrlChanges = (): boolean => {
    if (!originalEditValues) return false;
    return editingUrlValue !== originalEditValues.url || JSON.stringify(Array.from(editingTags).sort()) !== JSON.stringify(originalEditValues.tags);
  };
  const hasTextChanges = (): boolean => {
    if (!originalEditValues) return false;
    return editingTextContent !== originalEditValues.content || JSON.stringify(Array.from(editingTextTags).sort()) !== JSON.stringify(originalEditValues.tags);
  };
  const hasTagsetChanges = (): boolean => {
    if (!originalEditValues) return false;
    return JSON.stringify(Array.from(editingTagsetTags).sort()) !== JSON.stringify(originalEditValues.tags);
  };
  const hasImageChanges = (): boolean => {
    if (!originalEditValues) return false;
    return JSON.stringify(Array.from(editingImageTags).sort()) !== JSON.stringify(originalEditValues.tags);
  };

  const startEditing = async (item: SavedUrl) => {
    setEditingUrlId(item.id);
    setEditingUrlValue(item.url);
    setEditingTags(new Set(item.tags));
    setNewTagInput("");
    setOriginalEditValues({ url: item.url, tags: [...item.tags].sort() });

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
    setOriginalEditValues(null);
  };

  const requestCancelEditing = () => {
    if (hasUrlChanges()) setPendingDiscard({ type: "page" });
    else cancelEditing();
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

    const finalTags = new Set(editingTags);
    if (newTagInput.trim()) {
      for (const tag of newTagInput.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 0)) {
        finalTags.add(tag);
      }
      setNewTagInput("");
    }

    try {
      await invoke("update_url", { id: editingUrlId, url: editingUrlValue, tags: Array.from(finalTags) });
      await loadSavedUrls();
      await loadAllTags();
      cancelEditing();
      showToast("Page saved");
    } catch (error) {
      console.error("[Frontend] Failed to update URL:", error);
      showToast("Failed to save page", "error");
    }
  };

  // Unified add input functions
  const toggleAddInputTag = (tagName: string) => {
    console.log("[toggleAddInputTag] toggling tag:", tagName);
    const newTags = new Set(addInputTags);
    if (newTags.has(tagName)) {
      newTags.delete(tagName);
    } else {
      newTags.add(tagName);
    }
    console.log("[toggleAddInputTag] new tags:", Array.from(newTags));
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

  // Camera functions
  const openCamera = () => {
    cameraInputRef.current?.click();
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      setCapturedImage(dataUrl);
      setCapturedImageTags(new Set());
      setCapturedImageTagInput("");
    };
    reader.readAsDataURL(file);

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const toggleCapturedImageTag = (tagName: string) => {
    const newTags = new Set(capturedImageTags);
    if (newTags.has(tagName)) {
      newTags.delete(tagName);
    } else {
      newTags.add(tagName);
    }
    setCapturedImageTags(newTags);
  };

  const addCapturedImageTag = () => {
    const newTags = new Set(capturedImageTags);
    const parts = capturedImageTagInput.split(",");
    for (const part of parts) {
      const trimmed = part.trim().toLowerCase();
      if (trimmed) {
        newTags.add(trimmed);
      }
    }
    setCapturedImageTags(newTags);
    setCapturedImageTagInput("");
  };

  const cancelCapturedImage = () => {
    setCapturedImage(null);
    setCapturedImageTags(new Set());
    setCapturedImageTagInput("");
  };

  const saveCapturedImage = async () => {
    if (!capturedImage) return;

    // Include any text in the input field
    const finalTags = new Set(capturedImageTags);
    if (capturedImageTagInput.trim()) {
      const parts = capturedImageTagInput.split(",");
      for (const part of parts) {
        const trimmed = part.trim().toLowerCase();
        if (trimmed) {
          finalTags.add(trimmed);
        }
      }
    }

    try {
      // Extract base64 data from data URL
      const base64Data = capturedImage.split(",")[1];
      const mimeType = capturedImage.split(";")[0].split(":")[1];

      await invoke("save_captured_image", {
        imageData: base64Data,
        mimeType,
        tags: Array.from(finalTags),
      });

      cancelCapturedImage();
      await loadSavedImages();
      await loadAllTags();
    } catch (error) {
      console.error("Failed to save captured image:", error);
    }
  };

  const saveAddInput = async () => {
    const text = addInputText.trim();

    // Include any text in the new tag field
    const finalTags = new Set(addInputTags);
    console.log("[saveAddInput] addInputTags:", Array.from(addInputTags));
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
    console.log("[saveAddInput] final tags to save:", tags);

    // Detect type based on content
    const isUrl = text.startsWith("http://") || text.startsWith("https://");

    if (isUrl) {
      // Save as URL
      try {
        await invoke("save_url", { url: text, tags });
        resetAddInput();
        await loadSavedUrls();
        await loadAllTags();
        showToast("Page saved");
      } catch (error) {
        console.error("Failed to save URL:", error);
        showToast("Failed to save page", "error");
      }
    } else if (text) {
      // Save as text (note)
      try {
        console.log("[saveAddInput] Saving text with tags:", { content: text, tags });
        await invoke("save_text", { content: text, tags });
        resetAddInput();
        await loadSavedTexts();
        await loadAllTags();
        showToast("Note saved");
      } catch (error) {
        console.error("Failed to save text:", error);
        showToast("Failed to save note", "error");
      }
    } else if (tags.length > 0) {
      // Save as tagset (tags only, no text)
      try {
        await invoke("save_tagset", { tags });
        resetAddInput();
        await loadSavedTagsets();
        await loadAllTags();
        showToast("Tags saved");
      } catch (error) {
        console.error("Failed to save tagset:", error);
        showToast("Failed to save tags", "error");
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
    const existingTags = item.tags.length > 0 ? item.tags : extractHashtags(item.content);
    setEditingTextTags(new Set(existingTags));
    setEditingTextTagInput("");
    setOriginalEditValues({ content: item.content, tags: [...existingTags].sort() });
  };

  const cancelEditingText = () => {
    setEditingTextId(null);
    setEditingTextContent("");
    setEditingTextTags(new Set());
    setEditingTextTagInput("");
    setOriginalEditValues(null);
  };

  const requestCancelEditingText = () => {
    if (hasTextChanges()) setPendingDiscard({ type: "text" });
    else cancelEditingText();
  };

  const toggleEditingTextTag = (tagName: string) => {
    const newTags = new Set(editingTextTags);
    if (newTags.has(tagName)) {
      newTags.delete(tagName);
    } else {
      newTags.add(tagName);
    }
    setEditingTextTags(newTags);
  };

  const addEditingTextTag = () => {
    const trimmed = editingTextTagInput.trim().toLowerCase();
    if (trimmed) {
      setEditingTextTags(new Set(editingTextTags).add(trimmed));
      setEditingTextTagInput("");
    }
  };

  const saveTextChanges = async () => {
    if (!editingTextId) return;

    const finalTags = new Set(editingTextTags);
    if (editingTextTagInput.trim()) {
      for (const tag of editingTextTagInput.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 0)) {
        finalTags.add(tag);
      }
    }

    try {
      await invoke("update_text", { id: editingTextId, content: editingTextContent.trim(), tags: Array.from(finalTags) });
      await loadSavedTexts();
      await loadAllTags();
      cancelEditingText();
      showToast("Note saved");
    } catch (error) {
      console.error("Failed to update text:", error);
      showToast("Failed to save note", "error");
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
    setOriginalEditValues({ tags: [...item.tags].sort() });
  };

  const cancelEditingTagset = () => {
    setEditingTagsetId(null);
    setEditingTagsetTags(new Set());
    setEditingTagsetInput("");
    setOriginalEditValues(null);
  };

  const requestCancelEditingTagset = () => {
    if (hasTagsetChanges()) setPendingDiscard({ type: "tagset" });
    else cancelEditingTagset();
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

    const finalTags = new Set(editingTagsetTags);
    if (editingTagsetInput.trim()) {
      for (const tag of editingTagsetInput.split(",").map(t => t.trim().toLowerCase()).filter(t => t.length > 0)) {
        finalTags.add(tag);
      }
    }

    if (finalTags.size === 0) {
      showToast("At least one tag is required", "error");
      return;
    }

    try {
      await invoke("update_tagset", { id: editingTagsetId, tags: Array.from(finalTags) });
      await loadSavedTagsets();
      await loadAllTags();
      cancelEditingTagset();
      showToast("Tags saved");
    } catch (error) {
      console.error("Failed to update tagset:", error);
      showToast("Failed to save tags", "error");
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
    setOriginalEditValues({ tags: [...item.tags].sort() });
  };

  const cancelEditingImage = () => {
    setEditingImageId(null);
    setEditingImageTags(new Set());
    setEditingImageTagInput("");
    setOriginalEditValues(null);
  };

  const requestCancelEditingImage = () => {
    if (hasImageChanges()) setPendingDiscard({ type: "image" });
    else cancelEditingImage();
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
      showToast("Image saved");
    } catch (error) {
      console.error("Failed to update image:", error);
      showToast("Failed to save image", "error");
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

  // Pull-to-refresh touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    // Ignore if editing, add input expanded, or already syncing
    const anyEditing = editingUrlId || editingTextId || editingTagsetId || editingImageId;
    if (anyEditing || addInputExpanded || isSyncing) return;

    const main = mainRef.current;
    if (!main) return;

    // Only track if at scroll top
    if (main.scrollTop <= 0) {
      pullStartY.current = e.touches[0].clientY;
    }
  };

  const handleTouchMove = (e: TouchEvent) => {
    if (pullStartY.current === null) return;

    const pullDistance = e.touches[0].clientY - pullStartY.current;

    // If pulling down past threshold, prevent default scroll
    if (pullDistance > PULL_THRESHOLD) {
      e.preventDefault();
    }
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (pullStartY.current === null) return;

    const pullDistance = e.changedTouches[0].clientY - pullStartY.current;
    pullStartY.current = null;

    // Trigger sync if pulled past threshold
    if (pullDistance > PULL_THRESHOLD) {
      syncAll();
    }
  };

  // Attach touchmove with passive: false to allow preventDefault
  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;

    main.addEventListener("touchmove", handleTouchMove, { passive: false });
    return () => {
      main.removeEventListener("touchmove", handleTouchMove);
    };
  }, [editingUrlId, editingTextId, editingTagsetId, editingImageId, addInputExpanded, isSyncing]);

  // Reset to show all types (home view) and scroll to top
  const showAll = () => {
    setActiveFilter("all");
    scrollToTop();
  };

  // View mode functions
  const openViewMode = () => {
    setViewModeActive(true);
    setViewSearchText("");
    setViewSelectedTags(new Set());
  };

  const closeViewMode = () => {
    setViewModeActive(false);
    setViewSearchText("");
    setViewSelectedTags(new Set());
  };

  const toggleViewTag = (tagName: string) => {
    const newTags = new Set(viewSelectedTags);
    if (newTags.has(tagName)) {
      newTags.delete(tagName);
    } else {
      newTags.add(tagName);
    }
    setViewSelectedTags(newTags);
  };

  // View mode swipe handlers
  const handleViewModeTouchStart = (e: React.TouchEvent) => {
    viewModeStartY.current = e.touches[0].clientY;
  };

  const handleViewModeTouchEnd = (e: React.TouchEvent) => {
    if (viewModeStartY.current === null) return;
    const deltaY = e.changedTouches[0].clientY - viewModeStartY.current;
    viewModeStartY.current = null;
    if (deltaY > VIEW_SWIPE_THRESHOLD) {
      closeViewMode();
    }
  };

  // Filter tags for view mode
  const getFilteredViewTags = () => {
    if (!viewSearchText.trim()) return allTags;
    const search = viewSearchText.toLowerCase();
    return allTags.filter(tag => tag.name.toLowerCase().includes(search));
  };

  // Filter items for view mode
  const getFilteredViewItems = (): UnifiedItem[] => {
    const items: UnifiedItem[] = [];

    // Include all item types in view mode
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

    savedTagsets.forEach((tagset) => {
      items.push({
        id: tagset.id,
        type: "tagset",
        tags: tagset.tags,
        saved_at: tagset.saved_at,
        metadata: tagset.metadata,
      });
    });

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

    // Filter by search text and selected tags
    const searchLower = viewSearchText.toLowerCase();
    const filtered = items.filter(item => {
      // Match search text against tags, url, content, or title
      const matchesSearch = !viewSearchText.trim() ||
        item.tags.some(t => t.toLowerCase().includes(searchLower)) ||
        item.url?.toLowerCase().includes(searchLower) ||
        item.content?.toLowerCase().includes(searchLower) ||
        item.metadata?.title?.toLowerCase().includes(searchLower);

      // Match selected tags (AND filter - item must have all selected tags)
      const matchesTags = viewSelectedTags.size === 0 ||
        Array.from(viewSelectedTags).every(t => item.tags.includes(t));

      return matchesSearch && matchesTags;
    });

    // Sort by date, newest first
    return filtered.sort((a, b) => new Date(b.saved_at).getTime() - new Date(a.saved_at).getTime());
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

  // Check if any edit mode is active
  const isEditing = editingUrlId || editingTextId || editingTagsetId || editingImageId;

  // Render edit modal content
  const renderEditModal = () => {
    if (!isEditing) return null;

    // URL editing
    if (editingUrlId) {
      const item = savedUrls.find(u => u.id === editingUrlId);
      if (!item) return null;
      const unusedTags = editingUrlTags.filter((tag) => !editingTags.has(tag.name));

      return (
        <div className="edit-overlay" onClick={(e) => e.target === e.currentTarget && requestCancelEditing()}>
          <div className="expandable-card expanded">
            <div className="expandable-card-input-row">
              <input
                type="url"
                className="expandable-card-input"
                value={editingUrlValue}
                onChange={(e) => setEditingUrlValue(e.target.value)}
                placeholder="URL"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            <div className="expandable-card-scroll">
              {editingTags.size > 0 && (
                <div className="expandable-card-section">
                  <div className="editing-tags">
                    {Array.from(editingTags).sort().map((tag) => (
                      <span key={tag} className="editing-tag">
                        {tag}
                        <button onClick={() => toggleTag(tag)}>&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="expandable-card-section">
                <div className="new-tag-input">
                  <input
                    type="text"
                    value={newTagInput}
                    onChange={(e) => setNewTagInput(e.target.value)}
                    onKeyDown={handleNewTagKeyDown}
                    placeholder="Add tag..."
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button onClick={addNewTag} disabled={!newTagInput.trim()}>
                    Add
                  </button>
                </div>
              </div>

              {unusedTags.length > 0 && (
                <div className="expandable-card-section">
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
            </div>

            <div className="expandable-card-buttons">
              <button className="delete-btn" onClick={() => requestDelete(editingUrlId, "page")}>
                Delete
              </button>
              <button className="cancel-btn" onClick={requestCancelEditing}>
                Cancel
              </button>
              <button className="save-btn" onClick={saveChanges}>
                Save
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Text/Note editing
    if (editingTextId) {
      const unusedTags = allTags.filter((tag) => !editingTextTags.has(tag.name));

      return (
        <div className="edit-overlay" onClick={(e) => e.target === e.currentTarget && requestCancelEditingText()}>
          <div className="expandable-card expanded">
            <div className="expandable-card-input-row">
              <textarea
                className="expandable-card-input expanded-input"
                value={editingTextContent}
                onChange={(e) => setEditingTextContent(e.target.value)}
                placeholder="Note text..."
                rows={3}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            <div className="expandable-card-scroll">
              {editingTextTags.size > 0 && (
                <div className="expandable-card-section">
                  <div className="editing-tags">
                    {Array.from(editingTextTags).sort().map((tag) => (
                      <span key={tag} className="editing-tag">
                        {tag}
                        <button onClick={() => toggleEditingTextTag(tag)}>&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="expandable-card-section">
                <div className="new-tag-input">
                  <input
                    type="text"
                    value={editingTextTagInput}
                    onChange={(e) => setEditingTextTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addEditingTextTag();
                      }
                    }}
                    placeholder="Add tag..."
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button onClick={addEditingTextTag} disabled={!editingTextTagInput.trim()}>
                    Add
                  </button>
                </div>
              </div>

              {unusedTags.length > 0 && (
                <div className="expandable-card-section">
                  <div className="all-tags-list">
                    {unusedTags.map((tag) => (
                      <span
                        key={tag.name}
                        className="tag-chip"
                        onClick={() => toggleEditingTextTag(tag.name)}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="expandable-card-buttons">
              <button className="delete-btn" onClick={() => requestDelete(editingTextId, "text")}>
                Delete
              </button>
              <button className="cancel-btn" onClick={requestCancelEditingText}>
                Cancel
              </button>
              <button className="save-btn" onClick={saveTextChanges}>
                Save
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Tagset editing
    if (editingTagsetId) {
      const unusedTags = allTags.filter((tag) => !editingTagsetTags.has(tag.name));

      return (
        <div className="edit-overlay" onClick={(e) => e.target === e.currentTarget && requestCancelEditingTagset()}>
          <div className="expandable-card expanded">
            <div className="expandable-card-scroll" style={{ paddingTop: '0.75rem' }}>
              {editingTagsetTags.size > 0 && (
                <div className="expandable-card-section">
                  <div className="editing-tags">
                    {Array.from(editingTagsetTags).sort().map((tag) => (
                      <span key={tag} className="editing-tag">
                        {tag}
                        <button onClick={() => toggleEditingTagsetTag(tag)}>&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="expandable-card-section">
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
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button onClick={addEditingTagsetTag} disabled={!editingTagsetInput.trim()}>
                    Add
                  </button>
                </div>
              </div>

              {unusedTags.length > 0 && (
                <div className="expandable-card-section">
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
            </div>

            <div className="expandable-card-buttons">
              <button className="delete-btn" onClick={() => requestDelete(editingTagsetId, "tagset")}>
                Delete
              </button>
              <button className="cancel-btn" onClick={requestCancelEditingTagset}>
                Cancel
              </button>
              <button className="save-btn" onClick={saveTagsetChanges}>
                Save
              </button>
            </div>
          </div>
        </div>
      );
    }

    // Image editing
    if (editingImageId) {
      const item = savedImages.find(i => i.id === editingImageId);
      if (!item) return null;
      const unusedTags = allTags.filter((tag) => !editingImageTags.has(tag.name));
      const metadata = item.metadata as Record<string, unknown> | undefined;
      const title = metadata?.title as string | undefined;

      return (
        <div className="edit-overlay" onClick={(e) => e.target === e.currentTarget && requestCancelEditingImage()}>
          <div className="expandable-card expanded">
            <div className="expandable-card-scroll" style={{ paddingTop: '0.75rem' }}>
              <div className="expandable-card-section image-preview-section">
                {item.thumbnail ? (
                  <img
                    src={`data:image/jpeg;base64,${item.thumbnail}`}
                    alt={title || "Preview"}
                    className="edit-modal-image"
                  />
                ) : (
                  <div className="image-placeholder">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                      <circle cx="8.5" cy="8.5" r="1.5"></circle>
                      <polyline points="21 15 16 10 5 21"></polyline>
                    </svg>
                  </div>
                )}
                {title && <div className="edit-image-title">{title}</div>}
              </div>

              {editingImageTags.size > 0 && (
                <div className="expandable-card-section">
                  <div className="editing-tags">
                    {Array.from(editingImageTags).sort().map((tag) => (
                      <span key={tag} className="editing-tag">
                        {tag}
                        <button onClick={() => toggleEditingImageTag(tag)}>&times;</button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div className="expandable-card-section">
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
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button onClick={addEditingImageTag} disabled={!editingImageTagInput.trim()}>
                    Add
                  </button>
                </div>
              </div>

              {unusedTags.length > 0 && (
                <div className="expandable-card-section">
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
            </div>

            <div className="expandable-card-buttons">
              <button className="delete-btn" onClick={() => requestDelete(editingImageId, "image")}>
                Delete
              </button>
              <button className="cancel-btn" onClick={requestCancelEditingImage}>
                Cancel
              </button>
              <button className="save-btn" onClick={saveImageChanges}>
                Save
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
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
    const title = item.metadata?.title as string | undefined;

    return (
      <div key={item.id} className="saved-item-card" onClick={() => startEditing(item)}>
        <div className="card-header">
          <div className="card-type-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="2" y1="12" x2="22" y2="12"></line>
              <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
            </svg>
          </div>
          <span className="card-title">{title || item.url}</span>
          <button
            className="card-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              requestDelete(item.id, "page");
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div className="card-footer">
          <div className="card-tags">
            {item.tags.map((tag) => (
              <span key={tag} className="card-tag">{tag}</span>
            ))}
          </div>
          <div className="card-date">
            {new Date(item.saved_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    );
  };

  const renderTextItem = (item: SavedText) => {
    // Use actual tags from database, not just hashtags in content
    const tags = item.tags.length > 0 ? item.tags : extractHashtags(item.content);
    // Get summary: first line or truncated content (without hashtags for display)
    const contentWithoutTags = item.content.replace(/#\w+/g, '').trim();
    const summary = contentWithoutTags.split('\n')[0].slice(0, 100) || item.content.slice(0, 100);

    return (
      <div key={item.id} className="saved-item-card" onClick={() => startEditingText(item)}>
        <div className="card-header">
          <div className="card-type-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
              <polyline points="14 2 14 8 20 8"></polyline>
              <line x1="16" y1="13" x2="8" y2="13"></line>
              <line x1="16" y1="17" x2="8" y2="17"></line>
            </svg>
          </div>
          <div className="card-title">{summary}</div>
          <button
            className="card-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              requestDelete(item.id, "text");
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div className="card-footer">
          <div className="card-tags">
            {tags.map((tag) => (
              <span key={tag} className="card-tag">{tag}</span>
            ))}
          </div>
          <div className="card-date">
            {new Date(item.saved_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    );
  };

  const renderTagsetItem = (item: SavedTagset) => {
    return (
      <div key={item.id} className="saved-item-card" onClick={() => startEditingTagset(item)}>
        <div className="card-header">
          <div className="card-type-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"></path>
              <line x1="7" y1="7" x2="7.01" y2="7"></line>
            </svg>
          </div>
          <div className="card-title">{item.tags.join(', ')}</div>
          <button
            className="card-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              requestDelete(item.id, "tagset");
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div className="card-footer">
          <div className="card-tags"></div>
          <div className="card-date">
            {new Date(item.saved_at).toLocaleDateString()}
          </div>
        </div>
      </div>
    );
  };

  const deleteImage = async (id: string) => {
    try {
      await invoke("delete_url", { id }); // delete_url works for all item types
      await loadSavedImages();
      cancelEditingImage();
    } catch (error) {
      console.error("Failed to delete image:", error);
    }
  };

  // Delete confirmation functions
  const requestDelete = (id: string, type: ItemType) => {
    setPendingDelete({ id, type });
  };

  const cancelDelete = () => {
    setPendingDelete(null);
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;

    const { id, type } = pendingDelete;
    setPendingDelete(null);

    const typeLabels: Record<ItemType, string> = {
      page: "Page",
      text: "Note",
      tagset: "Tags",
      image: "Image",
    };

    try {
      switch (type) {
        case "page":
          await deleteUrl(id);
          break;
        case "text":
          await deleteText(id);
          break;
        case "tagset":
          await deleteTagset(id);
          break;
        case "image":
          await deleteImage(id);
          break;
      }
      showToast(`${typeLabels[type]} deleted`);
    } catch (error) {
      console.error("Failed to delete:", error);
      showToast("Failed to delete", "error");
    }
  };

  const cancelDiscard = () => {
    setPendingDiscard(null);
  };

  const confirmDiscard = () => {
    if (!pendingDiscard) return;
    const { type } = pendingDiscard;
    setPendingDiscard(null);
    switch (type) {
      case "page":
        cancelEditing();
        break;
      case "text":
        cancelEditingText();
        break;
      case "tagset":
        cancelEditingTagset();
        break;
      case "image":
        cancelEditingImage();
        break;
    }
  };

  const renderDiscardConfirmModal = () => {
    if (!pendingDiscard) return null;

    return (
      <div className="confirm-modal-overlay" onClick={cancelDiscard}>
        <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
          <p>Discard unsaved changes?</p>
          <div className="confirm-modal-buttons">
            <button className="cancel-btn" onClick={cancelDiscard}>
              Cancel
            </button>
            <button className="delete-btn" onClick={confirmDiscard}>
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderDeleteConfirmModal = () => {
    if (!pendingDelete) return null;

    const typeLabels: Record<ItemType, string> = {
      page: "page",
      text: "note",
      tagset: "tag set",
      image: "image",
    };

    return (
      <div className="confirm-modal-overlay" onClick={cancelDelete}>
        <div className="confirm-modal" onClick={(e) => e.stopPropagation()}>
          <p>Delete this {typeLabels[pendingDelete.type]}?</p>
          <div className="confirm-modal-buttons">
            <button className="cancel-btn" onClick={cancelDelete}>
              Cancel
            </button>
            <button className="delete-btn" onClick={confirmDelete}>
              Delete
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderImageItem = (item: SavedImage) => {
    const metadata = item.metadata as Record<string, unknown> | undefined;
    const title = metadata?.title as string | undefined;
    const sourceUrl = metadata?.sourceUrl as string | undefined;

    return (
      <div key={item.id} className="saved-item-card image-card" onClick={() => startEditingImage(item)}>
        <div className="card-header">
          <div className="card-thumbnail">
            {item.thumbnail ? (
              <img
                src={`data:image/jpeg;base64,${item.thumbnail}`}
                alt={title || "Preview"}
              />
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <circle cx="8.5" cy="8.5" r="1.5"></circle>
                <polyline points="21 15 16 10 5 21"></polyline>
              </svg>
            )}
          </div>
          <div className="card-title">{title || sourceUrl || "Image"}</div>
          <button
            className="card-delete-btn"
            onClick={(e) => {
              e.stopPropagation();
              requestDelete(item.id, "image");
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
        <div className="card-footer">
          <div className="card-tags">
            {item.tags.map((tag) => (
              <span key={tag} className="card-tag">{tag}</span>
            ))}
          </div>
          <div className="card-date">
            {new Date(item.saved_at).toLocaleDateString()}
          </div>
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

  // Render view mode UI
  const renderViewMode = () => {
    const filteredTags = getFilteredViewTags();
    const filteredItems = getFilteredViewItems();

    return (
      <div
        className="view-mode-container"
        onTouchStart={handleViewModeTouchStart}
        onTouchEnd={handleViewModeTouchEnd}
      >
        {/* Search box - matches quick-add styling */}
        <div className="view-mode-search">
          <input
            type="text"
            className="view-mode-search-input"
            placeholder="Search tags or items..."
            value={viewSearchText}
            onChange={(e) => setViewSearchText(e.target.value)}
            autoCapitalize="none"
            autoCorrect="off"
          />
          {viewSearchText && (
            <button
              className="view-mode-search-clear"
              onClick={() => setViewSearchText("")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>
          )}
        </div>

        {/* Tags container - 25% height, scrollable */}
        <div className="view-mode-tags-container">
          {filteredTags.length === 0 ? (
            <div className="view-mode-empty-tags">No matching tags</div>
          ) : (
            <div className="view-mode-tags">
              {filteredTags.map((tag) => (
                <span
                  key={tag.name}
                  className={`tag-chip ${viewSelectedTags.has(tag.name) ? "selected" : ""}`}
                  onClick={() => toggleViewTag(tag.name)}
                >
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Results list - fills remaining space */}
        <div className="view-mode-results">
          {filteredItems.length === 0 ? (
            <div className="view-mode-empty-results">
              {viewSearchText || viewSelectedTags.size > 0
                ? "No matching items"
                : "No items saved yet"}
            </div>
          ) : (
            <div className="view-mode-results-list">
              {filteredItems.map((item) => renderUnifiedItem(item))}
            </div>
          )}
        </div>
      </div>
    );
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
            <h2>Server Sync</h2>
            <p className="settings-description">
              Sync your saved items with the server. Pull to get items from other devices, push to send local items, or sync all to do both.
            </p>

            <div className="webhook-input">
              <input
                type="url"
                value={webhookUrlInput}
                onChange={(e) => setWebhookUrlInput(e.target.value)}
                placeholder="https://your-server.example.com"
                autoCapitalize="none"
                autoCorrect="off"
              />
            </div>

            <div className="webhook-input api-key-field">
              <input
                type={showApiKey ? "text" : "password"}
                value={webhookApiKeyInput}
                onChange={(e) => setWebhookApiKeyInput(e.target.value)}
                placeholder="API key"
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

            {syncStatus && syncStatus.pending_count > 0 && (
              <p className="sync-pending-info">
                {syncStatus.pending_count} item{syncStatus.pending_count === 1 ? '' : 's'} pending sync
              </p>
            )}

            <button
              className="sync-btn primary"
              onClick={syncAll}
              disabled={!webhookUrl || isSyncing}
            >
              {isSyncing ? "Syncing..." : "Sync All"}
            </button>

            <div className="sync-btn-row">
              <button
                className="sync-btn secondary"
                onClick={pullFromServer}
                disabled={!webhookUrl || isSyncing}
              >
                Pull
              </button>
              <button
                className="sync-btn secondary"
                onClick={pushToServer}
                disabled={!webhookUrl || isSyncing}
              >
                Push
              </button>
            </div>

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

  // Hidden camera input
  const cameraInput = (
    <input
      ref={cameraInputRef}
      type="file"
      accept="image/*"
      capture="environment"
      onChange={handleCameraCapture}
      style={{ display: "none" }}
    />
  );

  // Captured image edit view
  if (capturedImage) {
    return (
      <div className="app">
        {cameraInput}
        <header>
          <button className="header-btn back-btn" onClick={cancelCapturedImage}>
            Cancel
          </button>
          <h1>Save Photo</h1>
          <div className="header-spacer"></div>
        </header>

        <main className="saved-view">
          <div className="captured-image-view">
            <div className="captured-image-preview">
              <img src={capturedImage} alt="Captured" />
            </div>

            {capturedImageTags.size > 0 && (
              <div className="edit-section">
                <div className="editing-tags">
                  {Array.from(capturedImageTags).sort().map((tag) => (
                    <span key={tag} className="editing-tag">
                      {tag}
                      <button onClick={() => toggleCapturedImageTag(tag)}>&times;</button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="edit-section">
              <div className="new-tag-input">
                <input
                  type="text"
                  value={capturedImageTagInput}
                  onChange={(e) => setCapturedImageTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addCapturedImageTag();
                    }
                  }}
                  placeholder="Add tag..."
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                />
                <button onClick={addCapturedImageTag} disabled={!capturedImageTagInput.trim()}>
                  Add
                </button>
              </div>
            </div>

            {allTags.length > 0 && (
              <div className="edit-section">
                <div className="all-tags-list">
                  {allTags.filter((t) => !capturedImageTags.has(t.name)).map((tag) => (
                    <span
                      key={tag.name}
                      className="tag-chip"
                      onClick={() => toggleCapturedImageTag(tag.name)}
                    >
                      {tag.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            <div className="edit-buttons">
              <button className="cancel-btn" onClick={cancelCapturedImage}>
                Cancel
              </button>
              <button className="save-btn" onClick={saveCapturedImage}>
                Save
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      {cameraInput}
      <header>
        <h1
          onClick={() => {
            if (viewModeActive) closeViewMode();
            else if (activeFilter !== "all") showAll();
            else scrollToTop();
          }}
          style={{ cursor: "pointer" }}
        >
          Peek
        </h1>
        <button
          className={`header-btn view-mode-btn ${viewModeActive ? "active" : ""}`}
          onClick={() => viewModeActive ? closeViewMode() : openViewMode()}
          title="Search & Browse"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </button>
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
        <button className="header-btn settings-btn" onClick={() => { closeViewMode(); setShowSettings(true); }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3"></circle>
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
          </svg>
        </button>
      </header>

      {viewModeActive ? (
        renderViewMode()
      ) : (
      <main
        className="saved-view"
        ref={mainRef}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Quick add - expandable in place */}
        <div className={`expandable-card ${addInputExpanded ? 'expanded' : ''}`}>
          {!addInputExpanded ? (
            /* Collapsed: use input (not textarea) to avoid iOS cursor bug */
            <div className="expandable-card-input-row">
              <input
                type="text"
                className="expandable-card-input"
                placeholder="Add note, URL, or tags..."
                value={addInputText}
                onChange={(e) => setAddInputText(e.target.value)}
                onFocus={() => setAddInputExpanded(true)}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="off"
                spellCheck={false}
              />
              <button className="camera-btn" onClick={openCamera} title="Take photo">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path>
                  <circle cx="12" cy="13" r="4"></circle>
                </svg>
              </button>
            </div>
          ) : (
            /* Expanded: use textarea for multi-line */
            <>
              <div className="expandable-card-input-row">
                <textarea
                  ref={addTextareaRef}
                  className="expandable-card-input expanded-input"
                  placeholder="Enter text, URL, or just select tags..."
                  value={addInputText}
                  onChange={(e) => setAddInputText(e.target.value)}
                  rows={3}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div className="expandable-card-scroll">
                {addInputTags.size > 0 && (
                  <div className="expandable-card-section">
                    <div className="editing-tags">
                      {Array.from(addInputTags).sort().map((tag) => (
                        <span key={tag} className="editing-tag">
                          {tag}
                          <button onClick={() => toggleAddInputTag(tag)}>&times;</button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="expandable-card-section">
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
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <button onClick={addInputAddNewTag} disabled={!addInputNewTag.trim()}>
                      Add
                    </button>
                  </div>
                </div>

                {allTags.filter((tag) => !addInputTags.has(tag.name)).length > 0 && (
                  <div className="expandable-card-section">
                    <div className="all-tags-list">
                      {allTags.filter((tag) => !addInputTags.has(tag.name)).map((tag) => (
                        <span
                          key={tag.name}
                          className="tag-chip"
                          onClick={() => toggleAddInputTag(tag.name)}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Action buttons - always visible at bottom */}
              <div className="expandable-card-buttons">
                <button className="cancel-btn" onClick={resetAddInput}>
                  Cancel
                </button>
                <button
                  className="save-btn"
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
      )}

      {/* Edit modal overlay */}
      {renderEditModal()}

      {/* Delete confirmation modal */}
      {renderDeleteConfirmModal()}

      {/* Discard changes confirmation modal */}
      {renderDiscardConfirmModal()}

      {/* Toast notification */}
      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
