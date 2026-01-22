import appConfig from '../config.js';
import { createDatastoreStore } from '../utils.js';
import api from '../api.js';
import fc from '../features.js';

const DEBUG = api.debug;
const clear = false;

console.log('loading', 'settings');

// Helper: Create text/number input
const createInput = (label, value, onChange, options = {}) => {
  const group = document.createElement('div');
  group.className = 'form-group';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;

  const input = document.createElement('input');
  input.type = options.type || 'text';
  input.value = value || '';
  input.disabled = options.disabled || false;

  if (options.type === 'number') {
    if (options.step) input.step = options.step;
    if (options.min !== undefined) input.min = options.min;
    if (options.max !== undefined) input.max = options.max;
  }

  input.addEventListener('change', (e) => {
    const val = options.type === 'number' ? parseFloat(e.target.value) : e.target.value;
    onChange(val);
  });

  group.appendChild(labelEl);
  group.appendChild(input);

  if (options.helpText) {
    const help = document.createElement('div');
    help.className = 'help-text';
    help.textContent = options.helpText;
    group.appendChild(help);
  }

  return group;
};

// Helper: Create checkbox
const createCheckbox = (label, value, onChange, options = {}) => {
  const group = document.createElement('div');
  group.className = 'form-group-inline';

  const labelEl = document.createElement('label');
  labelEl.textContent = label;

  const wrapper = document.createElement('div');
  wrapper.className = 'checkbox-wrapper';

  const input = document.createElement('input');
  input.type = 'checkbox';
  input.checked = value || false;
  input.disabled = options.disabled || false;

  input.addEventListener('change', (e) => {
    onChange(e.target.checked);
  });

  wrapper.appendChild(input);
  group.appendChild(labelEl);
  group.appendChild(wrapper);

  return group;
};

// Create a settings section (supports async contentFn)
const createSection = async (sectionId, title, contentFn) => {
  const section = document.createElement('div');
  section.className = 'section';
  section.id = `section-${sectionId}`;

  const titleEl = document.createElement('h2');
  titleEl.className = 'section-title';
  titleEl.textContent = title;
  section.appendChild(titleEl);

  const content = await contentFn();
  if (content) {
    section.appendChild(content);
  }

  return section;
};

// Render core settings
const renderCoreSettings = async () => {
  const { id, labels, schemas, storageKeys, defaults } = appConfig;

  // Load from datastore
  const store = await createDatastoreStore('core', defaults);

  let prefs = store.get(storageKeys.PREFS);
  let features = store.get(storageKeys.ITEMS);

  const container = document.createElement('div');

  const save = async () => {
    await store.set(storageKeys.PREFS, prefs);
    await store.set(storageKeys.ITEMS, features);
    // Notify main process of prefs change for live updates (quit shortcut, dock visibility, etc.)
    api.publish('topic:core:prefs', { id, prefs }, api.scopes.SYSTEM);
  };

  // Preferences
  if (schemas.prefs && schemas.prefs.properties) {
    const prefsSection = document.createElement('div');
    prefsSection.className = 'form-section';

    const title = document.createElement('h3');
    title.className = 'form-section-title';
    title.textContent = 'Preferences';
    prefsSection.appendChild(title);

    const pProps = schemas.prefs.properties;

    Object.keys(pProps).forEach(k => {
      const s = pProps[k];
      const v = (prefs && prefs.hasOwnProperty(k)) ? prefs[k] : s.default;

      if (s.type === 'boolean') {
        const checkbox = createCheckbox(k, v, (newVal) => {
          prefs[k] = newVal;
          save();
        });
        prefsSection.appendChild(checkbox);
      } else if (s.type === 'integer' || s.type === 'number') {
        const input = createInput(k, v, (newVal) => {
          prefs[k] = newVal;
          save();
        }, {
          type: 'number',
          step: s.type === 'integer' ? 1 : 0.1,
          helpText: s.description
        });
        prefsSection.appendChild(input);
      } else {
        const input = createInput(k, v, (newVal) => {
          prefs[k] = newVal;
          save();
        }, {
          helpText: s.description
        });
        prefsSection.appendChild(input);
      }
    });

    container.appendChild(prefsSection);
  }

  // Features (core only - extensions are managed in Extensions section)
  const extensionNames = ['groups', 'peeks', 'slides'];
  const coreFeatures = features ? features.filter(f => !extensionNames.includes(f.name.toLowerCase())) : [];
  if (coreFeatures.length > 0) {
    const featuresSection = document.createElement('div');
    featuresSection.className = 'form-section';

    const title = document.createElement('h3');
    title.className = 'form-section-title';
    title.textContent = 'Features';
    featuresSection.appendChild(title);

    coreFeatures.forEach((feature) => {
      // Find original index for saving
      const i = features.findIndex(f => f.id === feature.id);

      const item = document.createElement('div');
      item.className = 'feature-item';

      const header = document.createElement('div');
      header.className = 'feature-header';

      const name = document.createElement('div');
      name.className = 'feature-name';
      name.textContent = feature.name;
      header.appendChild(name);

      const wrapper = document.createElement('div');
      wrapper.className = 'checkbox-wrapper';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = feature.enabled;
      checkbox.addEventListener('change', (e) => {
        features[i].enabled = e.target.checked;
        save();
        api.publish('core:feature:toggle', {
          featureId: feature.id,
          enabled: e.target.checked
        });
      });

      wrapper.appendChild(checkbox);
      header.appendChild(wrapper);
      item.appendChild(header);

      if (feature.description) {
        const desc = document.createElement('div');
        desc.className = 'feature-description';
        desc.textContent = feature.description;
        item.appendChild(desc);
      }

      featuresSection.appendChild(item);
    });

    container.appendChild(featuresSection);
  }

  return container;
};

// Render themes settings
const renderThemesSettings = async () => {
  const container = document.createElement('div');

  // Get current theme state
  const themeState = await api.theme.get();
  const activeThemeId = themeState?.themeId || 'basic';
  const colorScheme = themeState?.colorScheme || 'system';

  // Color scheme selector at top
  const schemeSection = document.createElement('div');
  schemeSection.className = 'form-section';
  schemeSection.style.marginBottom = '24px';

  const schemeTitle = document.createElement('h3');
  schemeTitle.className = 'form-section-title';
  schemeTitle.textContent = 'Color Scheme';
  schemeSection.appendChild(schemeTitle);

  const schemeGroup = document.createElement('div');
  schemeGroup.style.cssText = 'display: flex; gap: 8px;';

  ['system', 'light', 'dark'].forEach(scheme => {
    const btn = document.createElement('button');
    btn.textContent = scheme.charAt(0).toUpperCase() + scheme.slice(1);
    const isActive = colorScheme === scheme;
    btn.style.cssText = `
      padding: 8px 16px;
      font-size: 13px;
      background: ${isActive ? 'var(--base0D)' : 'var(--bg-tertiary)'};
      border: 2px solid ${isActive ? 'var(--base0D)' : 'var(--base03)'};
      border-radius: 6px;
      color: ${isActive ? 'white' : 'var(--text-primary)'};
      cursor: pointer;
      flex: 1;
      font-weight: ${isActive ? '600' : '400'};
    `;
    btn.addEventListener('click', async () => {
      const result = await api.theme.setColorScheme(scheme);
      if (result.success) {
        // Update button styles
        schemeGroup.querySelectorAll('button').forEach(b => {
          const btnIsActive = b.textContent.toLowerCase() === scheme;
          b.style.background = btnIsActive ? 'var(--base0D)' : 'var(--bg-tertiary)';
          b.style.borderColor = btnIsActive ? 'var(--base0D)' : 'var(--base03)';
          b.style.color = btnIsActive ? 'white' : 'var(--text-primary)';
          b.style.fontWeight = btnIsActive ? '600' : '400';
        });
      }
    });
    schemeGroup.appendChild(btn);
  });

  schemeSection.appendChild(schemeGroup);

  const schemeHelp = document.createElement('div');
  schemeHelp.className = 'help-text';
  schemeHelp.style.marginTop = '8px';
  schemeHelp.textContent = 'System follows your OS preference. Light/Dark forces that mode.';
  schemeSection.appendChild(schemeHelp);

  container.appendChild(schemeSection);

  // Add Theme button
  const addSection = document.createElement('div');
  addSection.className = 'form-section';
  addSection.style.marginBottom = '24px';

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add Theme';
  addBtn.style.cssText = `
    padding: 10px 16px;
    font-size: 13px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    width: 100%;
  `;
  addBtn.addEventListener('mouseenter', () => {
    addBtn.style.background = 'var(--bg-hover)';
  });
  addBtn.addEventListener('mouseleave', () => {
    addBtn.style.background = 'var(--bg-tertiary)';
  });
  addBtn.addEventListener('click', async () => {
    addBtn.textContent = 'Selecting folder...';
    addBtn.disabled = true;

    try {
      // Open folder picker
      const pickResult = await api.theme.pickFolder();
      if (!pickResult.success || pickResult.canceled) {
        addBtn.textContent = '+ Add Theme';
        addBtn.disabled = false;
        return;
      }

      const folderPath = pickResult.data.path;
      addBtn.textContent = 'Validating...';

      // Validate folder
      const validateResult = await api.theme.validateFolder(folderPath);

      if (!validateResult.success) {
        addBtn.textContent = `Error: ${validateResult.error}`;
        setTimeout(() => {
          addBtn.textContent = '+ Add Theme';
          addBtn.disabled = false;
        }, 3000);
        return;
      }

      addBtn.textContent = 'Adding...';

      // Add to datastore
      const addResult = await api.theme.add(folderPath);

      if (addResult.success) {
        addBtn.textContent = 'Added!';

        // Refresh the list
        setTimeout(() => {
          addBtn.textContent = '+ Add Theme';
          addBtn.disabled = false;
          refreshThemesList();
        }, 1500);
      } else {
        addBtn.textContent = `Error: ${addResult.error}`;
        setTimeout(() => {
          addBtn.textContent = '+ Add Theme';
          addBtn.disabled = false;
        }, 3000);
      }
    } catch (err) {
      console.error('Add theme error:', err);
      addBtn.textContent = 'Error adding theme';
      setTimeout(() => {
        addBtn.textContent = '+ Add Theme';
        addBtn.disabled = false;
      }, 2000);
    }
  });
  addSection.appendChild(addBtn);
  container.appendChild(addSection);

  // Themes list container
  const listContainer = document.createElement('div');
  listContainer.id = 'themes-list-container';
  container.appendChild(listContainer);

  // Function to refresh themes list
  const refreshThemesList = async () => {
    listContainer.innerHTML = '';

    const loading = document.createElement('div');
    loading.className = 'help-text';
    loading.textContent = 'Loading themes...';
    listContainer.appendChild(loading);

    try {
      const result = await api.theme.getAll();
      const currentTheme = await api.theme.get();
      const activeId = currentTheme?.themeId || 'basic';

      loading.remove();

      if (!result.success || !result.data || result.data.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'help-text';
        empty.textContent = 'No themes found.';
        listContainer.appendChild(empty);
        return;
      }

      const themes = result.data;

      const themeSection = document.createElement('div');
      themeSection.className = 'form-section';

      const title = document.createElement('h3');
      title.className = 'form-section-title';
      title.textContent = 'Installed Themes';
      themeSection.appendChild(title);

      themes.forEach(theme => {
        const isActive = theme.id === activeId;
        const isBuiltin = theme.builtin;

        const card = document.createElement('div');
        card.className = 'item-card';

        const header = document.createElement('div');
        header.className = 'item-card-header';

        // Left side: radio + name
        const leftSide = document.createElement('div');
        leftSide.style.cssText = 'display: flex; align-items: center; gap: 12px;';

        // Radio button for selection
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = 'active-theme';
        radio.checked = isActive;
        radio.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
        radio.addEventListener('change', async () => {
          if (radio.checked) {
            const result = await api.theme.setTheme(theme.id);
            if (result.success) {
              // Refresh to update UI
              refreshThemesList();
            }
          }
        });
        leftSide.appendChild(radio);

        const cardTitle = document.createElement('div');
        cardTitle.className = 'item-card-title';
        cardTitle.style.margin = '0';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = theme.name || theme.id;
        cardTitle.appendChild(nameSpan);

        if (theme.version) {
          const versionSpan = document.createElement('span');
          versionSpan.style.cssText = 'margin-left: 8px; font-size: 11px; color: var(--text-tertiary);';
          versionSpan.textContent = `v${theme.version}`;
          cardTitle.appendChild(versionSpan);
        }

        if (isBuiltin) {
          const badge = document.createElement('span');
          badge.style.cssText = 'margin-left: 8px; font-size: 10px; padding: 2px 6px; background: var(--bg-tertiary); border-radius: 4px; color: var(--text-tertiary);';
          badge.textContent = 'built-in';
          cardTitle.appendChild(badge);
        }

        if (isActive) {
          const activeBadge = document.createElement('span');
          activeBadge.style.cssText = 'margin-left: 8px; font-size: 10px; padding: 2px 6px; background: #22c55e; border-radius: 4px; color: white;';
          activeBadge.textContent = 'active';
          cardTitle.appendChild(activeBadge);
        }

        leftSide.appendChild(cardTitle);
        header.appendChild(leftSide);

        // Right side: actions
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        // Reload button
        const reloadBtn = document.createElement('button');
        reloadBtn.textContent = 'Reload';
        reloadBtn.style.cssText = `
          padding: 4px 8px;
          font-size: 11px;
          background: var(--bg-tertiary);
          border: 1px solid var(--border-primary);
          border-radius: 4px;
          color: var(--text-secondary);
          cursor: pointer;
        `;
        reloadBtn.addEventListener('click', async () => {
          reloadBtn.textContent = '...';
          reloadBtn.disabled = true;
          try {
            const result = await api.theme.reload(theme.id);
            reloadBtn.textContent = result.success ? '✓' : '✗';
          } catch (err) {
            reloadBtn.textContent = '✗';
          }
          setTimeout(() => {
            reloadBtn.textContent = 'Reload';
            reloadBtn.disabled = false;
          }, 1000);
        });
        actions.appendChild(reloadBtn);

        // Remove button (only for external themes)
        if (!isBuiltin) {
          const removeBtn = document.createElement('button');
          removeBtn.textContent = 'Remove';
          removeBtn.style.cssText = `
            padding: 4px 8px;
            font-size: 11px;
            background: var(--bg-tertiary);
            border: 1px solid #ef4444;
            border-radius: 4px;
            color: #ef4444;
            cursor: pointer;
          `;
          removeBtn.addEventListener('click', async () => {
            if (!confirm(`Remove theme "${theme.name || theme.id}"?`)) return;

            removeBtn.textContent = '...';
            removeBtn.disabled = true;

            const result = await api.theme.remove(theme.id);
            if (result.success) {
              refreshThemesList();
            } else {
              removeBtn.textContent = 'Error';
              setTimeout(() => {
                removeBtn.textContent = 'Remove';
                removeBtn.disabled = false;
              }, 2000);
            }
          });
          actions.appendChild(removeBtn);
        }

        header.appendChild(actions);
        card.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'item-card-body';

        if (theme.description) {
          const desc = document.createElement('div');
          desc.className = 'help-text';
          desc.style.marginBottom = '8px';
          desc.textContent = theme.description;
          body.appendChild(desc);
        }

        if (theme.author) {
          const authorInfo = document.createElement('div');
          authorInfo.className = 'help-text';
          authorInfo.style.marginBottom = '4px';
          authorInfo.textContent = `Author: ${theme.author}`;
          body.appendChild(authorInfo);
        }

        // Show path for external themes
        if (theme.path && !isBuiltin) {
          const pathInfo = document.createElement('div');
          pathInfo.className = 'help-text';
          pathInfo.style.cssText = 'font-family: monospace; font-size: 11px;';
          pathInfo.textContent = theme.path;
          body.appendChild(pathInfo);
        }

        card.appendChild(body);
        themeSection.appendChild(card);
      });

      listContainer.appendChild(themeSection);
    } catch (err) {
      loading.remove();
      const error = document.createElement('div');
      error.className = 'help-text';
      error.textContent = `Error loading themes: ${err.message}`;
      listContainer.appendChild(error);
    }
  };

  // Initial load
  await refreshThemesList();

  // Store refresh function for external access
  window._refreshThemesList = refreshThemesList;

  return container;
};

// Render sync settings
const renderSyncSettings = async () => {
  const container = document.createElement('div');

  // State
  let config = { serverUrl: '', apiKey: '', autoSync: false };
  let status = { configured: false, lastSync: 0, pendingCount: 0 };
  let isSyncing = false;

  // Load initial config and status
  try {
    const configResult = await api.sync.getConfig();
    if (configResult.success && configResult.data) {
      config = { ...config, ...configResult.data };
    }

    const statusResult = await api.sync.getStatus();
    if (statusResult.success && statusResult.data) {
      status = { ...status, ...statusResult.data };
    }
  } catch (err) {
    console.error('[settings] Failed to load sync config:', err);
  }

  // Server Configuration section
  const configSection = document.createElement('div');
  configSection.className = 'form-section';

  const configTitle = document.createElement('h3');
  configTitle.className = 'form-section-title';
  configTitle.textContent = 'Server Configuration';
  configSection.appendChild(configTitle);

  // Server URL input
  const serverUrlGroup = createInput('Server URL', config.serverUrl, async (val) => {
    config.serverUrl = val;
    await api.sync.setConfig({ serverUrl: val });
    updateStatus();
  }, { type: 'url', helpText: 'Full URL to sync server (e.g., https://peek.example.com)' });
  configSection.appendChild(serverUrlGroup);

  // API Key input with show/hide toggle
  const apiKeyGroup = document.createElement('div');
  apiKeyGroup.className = 'form-group';

  const apiKeyLabel = document.createElement('label');
  apiKeyLabel.textContent = 'API Key';
  apiKeyGroup.appendChild(apiKeyLabel);

  const apiKeyWrapper = document.createElement('div');
  apiKeyWrapper.style.cssText = 'display: flex; gap: 8px;';

  const apiKeyInput = document.createElement('input');
  apiKeyInput.type = 'password';
  apiKeyInput.value = config.apiKey || '';
  apiKeyInput.style.cssText = 'flex: 1;';
  apiKeyInput.addEventListener('change', async (e) => {
    config.apiKey = e.target.value;
    await api.sync.setConfig({ apiKey: e.target.value });
    updateStatus();
  });
  apiKeyWrapper.appendChild(apiKeyInput);

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'Show';
  toggleBtn.style.cssText = `
    padding: 6px 12px;
    font-size: 12px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    color: var(--text-secondary);
    cursor: pointer;
    min-width: 50px;
  `;
  toggleBtn.addEventListener('click', () => {
    if (apiKeyInput.type === 'password') {
      apiKeyInput.type = 'text';
      toggleBtn.textContent = 'Hide';
    } else {
      apiKeyInput.type = 'password';
      toggleBtn.textContent = 'Show';
    }
  });
  apiKeyWrapper.appendChild(toggleBtn);
  apiKeyGroup.appendChild(apiKeyWrapper);

  const apiKeyHelp = document.createElement('div');
  apiKeyHelp.className = 'help-text';
  apiKeyHelp.textContent = 'API key for authenticating with the sync server';
  apiKeyGroup.appendChild(apiKeyHelp);

  configSection.appendChild(apiKeyGroup);

  // Auto-sync checkbox
  const autoSyncCheckbox = createCheckbox('Auto-sync', config.autoSync, async (val) => {
    config.autoSync = val;
    await api.sync.setConfig({ autoSync: val });
  }, { helpText: 'Automatically sync when items are added or modified' });
  configSection.appendChild(autoSyncCheckbox);

  container.appendChild(configSection);

  // Sync Status section
  const statusSection = document.createElement('div');
  statusSection.className = 'form-section';
  statusSection.style.marginTop = '24px';

  const statusTitle = document.createElement('h3');
  statusTitle.className = 'form-section-title';
  statusTitle.textContent = 'Sync Status';
  statusSection.appendChild(statusTitle);

  const statusContainer = document.createElement('div');
  statusContainer.style.cssText = 'padding: 12px; background: var(--bg-tertiary); border-radius: 6px; margin-bottom: 16px;';

  const statusLine = document.createElement('div');
  statusLine.className = 'help-text';
  statusLine.style.marginBottom = '4px';
  statusContainer.appendChild(statusLine);

  const lastSyncLine = document.createElement('div');
  lastSyncLine.className = 'help-text';
  lastSyncLine.style.marginBottom = '4px';
  statusContainer.appendChild(lastSyncLine);

  const pendingLine = document.createElement('div');
  pendingLine.className = 'help-text';
  statusContainer.appendChild(pendingLine);

  statusSection.appendChild(statusContainer);

  // Function to update status display
  const updateStatus = async () => {
    try {
      const statusResult = await api.sync.getStatus();
      if (statusResult.success && statusResult.data) {
        status = statusResult.data;
      }
    } catch (err) {
      console.error('[settings] Failed to get sync status:', err);
    }

    const isConfigured = config.serverUrl && config.apiKey;
    statusLine.textContent = `Status: ${isConfigured ? 'Configured' : 'Not configured'}`;
    statusLine.style.color = isConfigured ? 'var(--text-primary)' : 'var(--text-tertiary)';

    if (status.lastSync && status.lastSync > 0) {
      const lastSyncDate = new Date(status.lastSync);
      lastSyncLine.textContent = `Last sync: ${lastSyncDate.toLocaleString()}`;
    } else {
      lastSyncLine.textContent = 'Last sync: Never';
    }

    pendingLine.textContent = `Pending items: ${status.pendingCount || 0}`;
  };

  // Initial status update
  await updateStatus();

  container.appendChild(statusSection);

  // Manual Sync section
  const syncSection = document.createElement('div');
  syncSection.className = 'form-section';
  syncSection.style.marginTop = '24px';

  const syncTitle = document.createElement('h3');
  syncTitle.className = 'form-section-title';
  syncTitle.textContent = 'Manual Sync';
  syncSection.appendChild(syncTitle);

  // Result display area
  const resultArea = document.createElement('div');
  resultArea.style.cssText = 'padding: 12px; border-radius: 6px; margin-bottom: 16px; display: none;';
  syncSection.appendChild(resultArea);

  // Function to show result message
  const showResult = (message, isError = false) => {
    resultArea.textContent = message;
    resultArea.style.display = 'block';
    resultArea.style.background = isError ? 'var(--error-bg, #fef2f2)' : 'var(--success-bg, #f0fdf4)';
    resultArea.style.border = isError ? '1px solid var(--error-border, #fecaca)' : '1px solid var(--success-border, #bbf7d0)';
    resultArea.style.color = isError ? 'var(--error-text, #dc2626)' : 'var(--success-text, #16a34a)';

    // Auto-hide after 5 seconds
    setTimeout(() => {
      resultArea.style.display = 'none';
    }, 5000);
  };

  // Button container
  const buttonContainer = document.createElement('div');
  buttonContainer.style.cssText = 'display: flex; gap: 8px; flex-wrap: wrap;';

  // Helper to create action buttons
  const createActionButton = (text, action) => {
    const btn = document.createElement('button');
    btn.textContent = text;
    btn.style.cssText = `
      padding: 10px 16px;
      font-size: 13px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      color: var(--text-primary);
      cursor: pointer;
      flex: 1;
      min-width: 120px;
    `;
    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) btn.style.background = 'var(--bg-hover)';
    });
    btn.addEventListener('mouseleave', () => {
      if (!btn.disabled) btn.style.background = 'var(--bg-tertiary)';
    });
    btn.addEventListener('click', async () => {
      if (isSyncing) return;

      // Check if configured
      if (!config.serverUrl || !config.apiKey) {
        showResult('Please configure server URL and API key first', true);
        return;
      }

      isSyncing = true;
      const originalText = btn.textContent;
      btn.textContent = 'Syncing...';
      btn.disabled = true;
      btn.style.opacity = '0.6';
      btn.style.cursor = 'not-allowed';

      // Disable all buttons during operation
      buttonContainer.querySelectorAll('button').forEach(b => {
        b.disabled = true;
        b.style.opacity = '0.6';
        b.style.cursor = 'not-allowed';
      });

      try {
        const result = await action();
        if (result.success) {
          const data = result.data || {};
          let message = '';
          if (data.pulled !== undefined && data.pushed !== undefined) {
            message = `Synced: ${data.pulled} pulled, ${data.pushed} pushed`;
            if (data.conflicts) message += `, ${data.conflicts} conflicts`;
          } else if (data.pulled !== undefined) {
            message = `Pulled ${data.pulled} items`;
            if (data.conflicts) message += ` (${data.conflicts} conflicts)`;
          } else if (data.pushed !== undefined) {
            message = `Pushed ${data.pushed} items`;
            if (data.skipped) message += ` (${data.skipped} skipped)`;
          } else {
            message = 'Sync completed';
          }
          showResult(message, false);
        } else {
          showResult(result.error || 'Sync failed', true);
        }
      } catch (err) {
        showResult(err.message || 'Sync error', true);
      } finally {
        isSyncing = false;
        btn.textContent = originalText;

        // Re-enable all buttons
        buttonContainer.querySelectorAll('button').forEach(b => {
          b.disabled = false;
          b.style.opacity = '1';
          b.style.cursor = 'pointer';
          b.style.background = 'var(--bg-tertiary)';
        });

        // Update status after sync
        await updateStatus();
      }
    });
    return btn;
  };

  // Pull button
  const pullBtn = createActionButton('Pull from Server', () => api.sync.pull());
  buttonContainer.appendChild(pullBtn);

  // Push button
  const pushBtn = createActionButton('Push to Server', () => api.sync.push());
  buttonContainer.appendChild(pushBtn);

  // Sync All button
  const syncAllBtn = createActionButton('Sync All', () => api.sync.syncAll());
  syncAllBtn.style.background = 'var(--base0D)';
  syncAllBtn.style.color = 'white';
  syncAllBtn.style.border = '1px solid var(--base0D)';
  syncAllBtn.addEventListener('mouseenter', () => {
    if (!syncAllBtn.disabled) syncAllBtn.style.background = 'var(--base0D)';
  });
  syncAllBtn.addEventListener('mouseleave', () => {
    if (!syncAllBtn.disabled) syncAllBtn.style.background = 'var(--base0D)';
  });
  buttonContainer.appendChild(syncAllBtn);

  syncSection.appendChild(buttonContainer);

  // Help text
  const helpText = document.createElement('div');
  helpText.className = 'help-text';
  helpText.style.marginTop = '12px';
  helpText.textContent = 'Pull downloads new items from the server. Push uploads local items. Sync All does both.';
  syncSection.appendChild(helpText);

  container.appendChild(syncSection);

  return container;
};

// Render extensions settings
const renderExtensionsSettings = async () => {
  const container = document.createElement('div');

  // Add Extension button at top
  const addSection = document.createElement('div');
  addSection.className = 'form-section';
  addSection.style.marginBottom = '24px';

  const addBtn = document.createElement('button');
  addBtn.textContent = '+ Add Extension';
  addBtn.style.cssText = `
    padding: 10px 16px;
    font-size: 13px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 6px;
    color: var(--text-primary);
    cursor: pointer;
    width: 100%;
  `;
  addBtn.addEventListener('mouseenter', () => {
    addBtn.style.background = 'var(--bg-hover)';
  });
  addBtn.addEventListener('mouseleave', () => {
    addBtn.style.background = 'var(--bg-tertiary)';
  });
  addBtn.addEventListener('click', async () => {
    addBtn.textContent = 'Selecting folder...';
    addBtn.disabled = true;

    try {
      // Open folder picker
      const pickResult = await api.extensions.pickFolder();
      if (!pickResult.success || pickResult.canceled) {
        addBtn.textContent = '+ Add Extension';
        addBtn.disabled = false;
        return;
      }

      const folderPath = pickResult.data.path;
      addBtn.textContent = 'Validating...';

      // Validate folder
      const validateResult = await api.extensions.validateFolder(folderPath);

      // Add even if invalid (disabled), so user can fix and retry
      // Handle both Electron format (data.manifest) and flat format
      const manifest = validateResult.data?.manifest || validateResult.manifest || {};
      const isValid = validateResult.success && !validateResult.error;
      const validationError = !isValid ? (validateResult.error || 'Unknown validation error') : null;

      addBtn.textContent = 'Adding...';

      // Add to datastore (disabled if invalid, with error message)
      const addResult = await api.extensions.add(folderPath, manifest, false, validationError);

      if (addResult.success) {
        addBtn.textContent = isValid ? 'Added!' : 'Added (disabled - has errors)';

        // Refresh the list
        setTimeout(() => {
          addBtn.textContent = '+ Add Extension';
          addBtn.disabled = false;
          refreshExtensionsList();
        }, 1500);
      } else {
        addBtn.textContent = `Error: ${addResult.error}`;
        setTimeout(() => {
          addBtn.textContent = '+ Add Extension';
          addBtn.disabled = false;
        }, 3000);
      }
    } catch (err) {
      console.error('Add extension error:', err);
      addBtn.textContent = 'Error adding extension';
      setTimeout(() => {
        addBtn.textContent = '+ Add Extension';
        addBtn.disabled = false;
      }, 2000);
    }
  });
  addSection.appendChild(addBtn);
  container.appendChild(addSection);

  // Extensions list container (for refresh)
  const listContainer = document.createElement('div');
  listContainer.id = 'extensions-list-container';
  container.appendChild(listContainer);

  // Function to refresh extensions list
  const refreshExtensionsList = async () => {
    listContainer.innerHTML = '';

    const loading = document.createElement('div');
    loading.className = 'help-text';
    loading.textContent = 'Loading extensions...';
    listContainer.appendChild(loading);

    try {
      // Get features list to check enabled state for builtins
      // Use pre-loaded core store if available, otherwise load fresh
      const coreStore = _coreStore || await createDatastoreStore('core', appConfig.defaults);
      const features = coreStore.get(appConfig.storageKeys.ITEMS) || [];

      // Get both running extensions and datastore extensions
      const [runningResult, datastoreResult] = await Promise.all([
        api.extensions.list(),
        api.extensions.getAll()
      ]);

      loading.remove();

      const runningExts = runningResult.success ? runningResult.data || [] : [];
      const datastoreExts = datastoreResult.success ? datastoreResult.data || [] : [];

      // Merge: builtin running + datastore external
      // Running extensions have manifest info, datastore has persisted info
      const runningById = new Map(runningExts.map(e => [e.id, e]));

      // Build combined list
      const allExtensions = [];

      // Get all builtin extension IDs from the loader
      const builtinExtIds = ['cmd', 'groups', 'peeks', 'slides', 'windows'];

      // Add builtin extensions (whether running or not)
      builtinExtIds.forEach(extId => {
        const running = runningById.get(extId);
        // Find matching feature to get enabled state
        // For builtins: if running, they're enabled. Otherwise check stored state, default true.
        const feature = features.find(f => f.name.toLowerCase() === extId);
        const isEnabled = running ? true : (feature ? feature.enabled !== false : true);

        if (running) {
          // Extension is running
          allExtensions.push({
            ...running,
            manifest: running.manifest || {
              id: extId,
              name: extId.charAt(0).toUpperCase() + extId.slice(1),
              shortname: extId,
              builtin: true
            },
            source: 'builtin',
            isRunning: true,
            enabled: isEnabled
          });
        } else {
          // Extension not running - show it as stopped
          allExtensions.push({
            id: extId,
            manifest: {
              id: extId,
              name: extId.charAt(0).toUpperCase() + extId.slice(1),
              shortname: extId,
              builtin: true
            },
            source: 'builtin',
            isRunning: false,
            enabled: isEnabled
          });
        }
      });

      // Add datastore extensions (external)
      // Handle both Electron format (flat fields) and Tauri format (with manifest object)
      datastoreExts.forEach(ext => {
        const running = runningById.get(ext.id);
        // Tauri returns manifest object, Electron returns flat fields
        const manifestData = ext.manifest || {};
        const name = ext.name || manifestData.name || ext.id;
        const description = ext.description || manifestData.description || '';
        const version = ext.version || manifestData.version || '';
        const shortname = (ext.metadata ? JSON.parse(ext.metadata).shortname : manifestData.shortname) || ext.id;
        const builtin = ext.builtin === 1 || ext.builtin === true || manifestData.builtin;
        // Handle both snake_case (Tauri JSON) and direct field names
        const lastError = ext.lastError || ext.last_error || null;

        allExtensions.push({
          id: ext.id,
          manifest: {
            id: ext.id,
            name,
            shortname,
            description,
            version,
            builtin
          },
          path: ext.path,
          source: 'datastore',
          isRunning: !!running,
          enabled: ext.enabled === 1 || ext.enabled === true,
          status: ext.status,
          lastError
        });
      });

      if (allExtensions.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'help-text';
        empty.textContent = 'No extensions installed. Click "Add Extension" to install one.';
        listContainer.appendChild(empty);
        return;
      }

      const extSection = document.createElement('div');
      extSection.className = 'form-section';

      const title = document.createElement('h3');
      title.className = 'form-section-title';
      title.textContent = 'Installed Extensions';
      extSection.appendChild(title);

      allExtensions.forEach(ext => {
        const manifest = ext.manifest || {};
        const isBuiltin = manifest.builtin || ext.source === 'builtin';

        const card = document.createElement('div');
        card.className = 'item-card';

        const header = document.createElement('div');
        header.className = 'item-card-header';

        // Left side: checkbox + name
        const leftSide = document.createElement('div');
        leftSide.style.cssText = 'display: flex; align-items: center; gap: 12px;';

        // Enable/disable checkbox
        // cmd extension cannot be disabled - it's required infrastructure
        const isCmdExtension = ext.id === 'cmd';
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = ext.enabled;
        checkbox.disabled = isCmdExtension;
        checkbox.title = isCmdExtension ? 'Required - cannot be disabled' : '';
        checkbox.style.cssText = `width: 16px; height: 16px; cursor: ${isCmdExtension ? 'not-allowed' : 'pointer'}; ${isCmdExtension ? 'opacity: 0.5;' : ''}`;
        checkbox.addEventListener('change', async (e) => {
          const newEnabled = e.target.checked;
          checkbox.disabled = true;

          if (isBuiltin) {
            // Update features storage for persistence
            const coreStore = _coreStore || await createDatastoreStore('core', appConfig.defaults);
            const featuresList = coreStore.get(appConfig.storageKeys.ITEMS) || [];
            const featureIndex = featuresList.findIndex(f => f.name.toLowerCase() === ext.id);
            if (featureIndex >= 0) {
              featuresList[featureIndex].enabled = newEnabled;
              await coreStore.set(appConfig.storageKeys.ITEMS, featuresList);
            }

            // Use the feature toggle mechanism to load/unload
            // This triggers the core:feature:toggle handler in app/index.js
            api.publish('core:feature:toggle', {
              featureId: ext.id,
              enabled: newEnabled
            });
          } else if (ext.source === 'datastore') {
            // Load or unload the extension first
            let loadResult = { success: true };
            if (newEnabled) {
              loadResult = await api.extensions.load(ext.id);
            } else {
              loadResult = await api.extensions.unload(ext.id);
            }

            if (loadResult.success) {
              // Update in datastore only if load/unload succeeded
              await api.extensions.update(ext.id, {
                enabled: newEnabled ? 1 : 0,
                status: newEnabled ? 'installed' : 'disabled',
                lastError: '',
                lastErrorAt: 0
              });
            } else {
              // Load/unload failed - store the error and keep disabled
              const errorMsg = loadResult.error || 'Failed to load extension';
              await api.extensions.update(ext.id, {
                enabled: 0,
                status: 'error',
                lastError: errorMsg,
                lastErrorAt: Date.now()
              });
              console.error(`[settings] Extension ${ext.id} load failed:`, errorMsg);
            }
          }

          checkbox.disabled = false;
          // Refresh to show current state
          setTimeout(refreshExtensionsList, 300);
        });
        leftSide.appendChild(checkbox);

        const cardTitle = document.createElement('div');
        cardTitle.className = 'item-card-title';
        cardTitle.style.margin = '0';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = manifest.name || ext.id;
        cardTitle.appendChild(nameSpan);

        if (manifest.version) {
          const versionSpan = document.createElement('span');
          versionSpan.style.cssText = 'margin-left: 8px; font-size: 11px; color: var(--text-tertiary);';
          versionSpan.textContent = `v${manifest.version}`;
          cardTitle.appendChild(versionSpan);
        }

        if (isBuiltin) {
          const badge = document.createElement('span');
          badge.style.cssText = 'margin-left: 8px; font-size: 10px; padding: 2px 6px; background: var(--bg-tertiary); border-radius: 4px; color: var(--text-tertiary);';
          badge.textContent = 'built-in';
          cardTitle.appendChild(badge);
        }

        // Show "required" badge for cmd extension (cannot be disabled)
        if (isCmdExtension) {
          const requiredBadge = document.createElement('span');
          requiredBadge.style.cssText = 'margin-left: 8px; font-size: 10px; padding: 2px 6px; background: var(--base0E, #c678dd); border-radius: 4px; color: white;';
          requiredBadge.textContent = 'required';
          cardTitle.appendChild(requiredBadge);
        }

        // Status indicator: running or stopped
        const statusBadge = document.createElement('span');
        if (ext.isRunning) {
          statusBadge.style.cssText = 'margin-left: 8px; font-size: 10px; padding: 2px 6px; background: #22c55e; border-radius: 4px; color: white;';
          statusBadge.textContent = 'running';
        } else {
          statusBadge.style.cssText = 'margin-left: 8px; font-size: 10px; padding: 2px 6px; background: #6b7280; border-radius: 4px; color: white;';
          statusBadge.textContent = 'stopped';
        }
        cardTitle.appendChild(statusBadge);

        leftSide.appendChild(cardTitle);
        header.appendChild(leftSide);

        // Right side: actions
        const actions = document.createElement('div');
        actions.style.cssText = 'display: flex; gap: 8px; align-items: center;';

        // Reload button (only when running)
        if (ext.isRunning) {
          const reloadBtn = document.createElement('button');
          reloadBtn.textContent = 'Reload';
          reloadBtn.style.cssText = `
            padding: 4px 8px;
            font-size: 11px;
            background: var(--bg-tertiary);
            border: 1px solid var(--border-primary);
            border-radius: 4px;
            color: var(--text-secondary);
            cursor: pointer;
          `;
          reloadBtn.addEventListener('click', async () => {
            reloadBtn.textContent = '...';
            reloadBtn.disabled = true;
            try {
              const result = await api.extensions.reload(ext.id);
              reloadBtn.textContent = result.success ? '✓' : '✗';
            } catch (err) {
              reloadBtn.textContent = '✗';
            }
            setTimeout(() => {
              reloadBtn.textContent = 'Reload';
              reloadBtn.disabled = false;
              refreshExtensionsList();
            }, 1000);
          });
          actions.appendChild(reloadBtn);
        }

        // Remove button (only for external extensions)
        if (!isBuiltin) {
          const removeBtn = document.createElement('button');
          removeBtn.textContent = 'Remove';
          removeBtn.style.cssText = `
            padding: 4px 8px;
            font-size: 11px;
            background: var(--bg-tertiary);
            border: 1px solid #ef4444;
            border-radius: 4px;
            color: #ef4444;
            cursor: pointer;
          `;
          removeBtn.addEventListener('click', async () => {
            if (!confirm(`Remove extension "${manifest.name || ext.id}"?`)) return;

            removeBtn.textContent = '...';
            removeBtn.disabled = true;

            // Unload if running
            if (ext.isRunning) {
              await api.extensions.unload(ext.id);
            }

            // Remove from datastore
            const result = await api.extensions.remove(ext.id);
            if (result.success) {
              refreshExtensionsList();
            } else {
              removeBtn.textContent = 'Error';
              setTimeout(() => {
                removeBtn.textContent = 'Remove';
                removeBtn.disabled = false;
              }, 2000);
            }
          });
          actions.appendChild(removeBtn);
        }

        header.appendChild(actions);
        card.appendChild(header);

        // Body
        const body = document.createElement('div');
        body.className = 'item-card-body';

        if (manifest.description) {
          const desc = document.createElement('div');
          desc.className = 'help-text';
          desc.style.marginBottom = '8px';
          desc.textContent = manifest.description;
          body.appendChild(desc);
        }

        // Show path for external extensions
        if (ext.path && !isBuiltin) {
          const pathInfo = document.createElement('div');
          pathInfo.className = 'help-text';
          pathInfo.style.cssText = 'font-family: monospace; font-size: 11px; margin-bottom: 4px;';
          pathInfo.textContent = ext.path;
          body.appendChild(pathInfo);
        }

        // Show URL
        const urlInfo = document.createElement('div');
        urlInfo.className = 'help-text';
        urlInfo.style.cssText = 'font-family: monospace; font-size: 11px;';
        urlInfo.textContent = `peek://ext/${manifest.shortname || ext.id}/`;
        body.appendChild(urlInfo);

        // Show error if any
        if (ext.lastError) {
          const errorInfo = document.createElement('div');
          errorInfo.className = 'extension-error';
          errorInfo.style.cssText = 'margin-top: 8px; padding: 8px; background: var(--error-bg, #fef2f2); border: 1px solid var(--error-border, #fecaca); border-radius: 4px; font-size: 12px; color: var(--error-text, #dc2626);';
          errorInfo.textContent = `Error: ${ext.lastError}`;
          body.appendChild(errorInfo);
        }

        card.appendChild(body);
        extSection.appendChild(card);
      });

      listContainer.appendChild(extSection);
    } catch (err) {
      loading.remove();
      const error = document.createElement('div');
      error.className = 'help-text';
      error.textContent = `Error loading extensions: ${err.message}`;
      listContainer.appendChild(error);
    }
  };

  // Initial load (may be incomplete if extensions still loading)
  await refreshExtensionsList();

  // Store refresh function for external access (ext:all-loaded is subscribed once in main init)
  window._refreshExtensionsList = refreshExtensionsList;

  return container;
};

// Render feature settings (Peeks, Slides, etc.)
// Reads/writes from datastore extension_settings table
const renderFeatureSettings = async (feature) => {
  const { id, labels, schemas, storageKeys, defaults } = feature;

  // Use extension shortname for datastore key (e.g., 'peeks', 'slides', 'groups')
  const extId = labels.name.toLowerCase();

  // Load from datastore
  const store = await createDatastoreStore(extId, defaults);

  let prefs = store.get(storageKeys.PREFS);
  let items = store.get(storageKeys.ITEMS);

  const container = document.createElement('div');

  // Topic for notifying feature of settings changes (e.g., 'peeks:settings-changed')
  const settingsChangedTopic = `${labels.name.toLowerCase()}:settings-changed`;

  const save = async () => {
    // Save to datastore
    await store.set(storageKeys.PREFS, prefs);
    if (items) {
      await store.set(storageKeys.ITEMS, items);
    }

    // Notify feature to hot-reload with new settings (GLOBAL for cross-process)
    api.publish(settingsChangedTopic, {}, api.scopes.GLOBAL);
  };

  // Preferences
  if (schemas.prefs && schemas.prefs.properties && Object.keys(schemas.prefs.properties).length > 0) {
    const prefsSection = document.createElement('div');
    prefsSection.className = 'form-section';

    const title = document.createElement('h3');
    title.className = 'form-section-title';
    title.textContent = 'Preferences';
    prefsSection.appendChild(title);

    const pProps = schemas.prefs.properties;

    Object.keys(pProps).forEach(k => {
      const s = pProps[k];
      const v = (prefs && prefs.hasOwnProperty(k)) ? prefs[k] : s.default;

      if (s.type === 'boolean') {
        const checkbox = createCheckbox(k, v, (newVal) => {
          prefs[k] = newVal;
          save();
        });
        prefsSection.appendChild(checkbox);
      } else if (s.type === 'integer' || s.type === 'number') {
        const input = createInput(k, v, (newVal) => {
          prefs[k] = newVal;
          save();
        }, {
          type: 'number',
          step: s.type === 'integer' ? 1 : 0.1,
          helpText: s.description
        });
        prefsSection.appendChild(input);
      } else {
        const input = createInput(k, v, (newVal) => {
          prefs[k] = newVal;
          save();
        }, {
          helpText: s.description
        });
        prefsSection.appendChild(input);
      }
    });

    container.appendChild(prefsSection);
  }

  // Items
  if (items && items.length > 0) {
    const itemsSection = document.createElement('div');
    itemsSection.className = 'form-section';

    const title = document.createElement('h3');
    title.className = 'form-section-title';
    title.textContent = schemas.item?.title || 'Items';
    itemsSection.appendChild(title);

    items.forEach((item, i) => {
      const card = document.createElement('div');
      card.className = 'item-card collapsed';

      const header = document.createElement('div');
      header.className = 'item-card-header';

      const cardTitle = document.createElement('div');
      cardTitle.className = 'item-card-title';
      cardTitle.textContent = item.title || item.name || `Item ${i + 1}`;
      header.appendChild(cardTitle);

      const wrapper = document.createElement('div');
      wrapper.className = 'checkbox-wrapper';

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.enabled || false;
      checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        items[i].enabled = e.target.checked;
        save();
      });

      wrapper.appendChild(checkbox);
      header.appendChild(wrapper);
      card.appendChild(header);

      // Toggle collapse on header click
      header.addEventListener('click', (e) => {
        if (e.target === checkbox) return;
        card.classList.toggle('collapsed');
      });

      const body = document.createElement('div');
      body.className = 'item-card-body';

      // Render item fields based on schema
      const itemProps = schemas.item?.properties || {};
      Object.keys(itemProps).forEach(k => {
        // Skip enabled (already in header) and id/version
        if (k === 'enabled' || k === 'id' || k === 'version') return;

        const s = itemProps[k];
        const v = item[k];

        if (s.type === 'boolean') {
          const checkbox = createCheckbox(k, v, (newVal) => {
            items[i][k] = newVal;
            save();
          });
          body.appendChild(checkbox);
        } else if (s.type === 'integer' || s.type === 'number') {
          const input = createInput(k, v, (newVal) => {
            items[i][k] = newVal;
            save();
          }, {
            type: 'number',
            step: s.type === 'integer' ? 1 : 0.1,
            helpText: s.description,
            disabled: s.readOnly
          });
          body.appendChild(input);
        } else {
          const input = createInput(k, v, (newVal) => {
            items[i][k] = newVal;
            save();
          }, {
            type: k.includes('address') || k.includes('url') ? 'url' : 'text',
            helpText: s.description,
            disabled: s.readOnly
          });
          body.appendChild(input);
        }
      });

      card.appendChild(body);
      itemsSection.appendChild(card);
    });

    container.appendChild(itemsSection);
  }

  return container;
};

// Navigation handling
const showSection = (sectionId) => {
  // Hide all sections
  document.querySelectorAll('.section').forEach(s => {
    s.classList.remove('active');
  });

  // Remove active from all nav items
  document.querySelectorAll('.nav-item').forEach(n => {
    n.classList.remove('active');
  });

  // Show selected section
  const section = document.getElementById(`section-${sectionId}`);
  if (section) {
    section.classList.add('active');
  }

  // Mark nav item as active
  const navItem = document.querySelector(`[data-section="${sectionId}"]`);
  if (navItem) {
    navItem.classList.add('active');
  }
};

// Helper to check if a feature is enabled (reads from cached store)
// Note: Needs pre-loaded coreStore passed in, or use async version
let _coreStore = null;
const isFeatureEnabled = (featureName) => {
  if (!_coreStore) return false;
  const features = _coreStore.get(appConfig.storageKeys.ITEMS) || [];
  const feature = features.find(f => f.name.toLowerCase() === featureName.toLowerCase());
  return feature ? feature.enabled : false;
};

// Render profiles settings
const renderProfilesSettings = async () => {
  const container = document.createElement('div');

  // Get current profile and all profiles
  let currentProfile = null;
  let profiles = [];

  try {
    const currentResult = await api.profiles.getCurrent();
    if (currentResult.success && currentResult.data) {
      currentProfile = currentResult.data;
    }

    const listResult = await api.profiles.list();
    if (listResult.success && listResult.data) {
      profiles = listResult.data;
    }
  } catch (err) {
    console.error('[settings] Failed to load profiles:', err);
  }

  // Current profile section
  const currentSection = document.createElement('div');
  currentSection.className = 'form-section';

  const currentTitle = document.createElement('h3');
  currentTitle.className = 'form-section-title';
  currentTitle.textContent = 'Current Profile';
  currentSection.appendChild(currentTitle);

  const currentName = document.createElement('p');
  currentName.textContent = currentProfile ? currentProfile.name : 'Unknown';
  currentName.style.cssText = 'margin: 8px 0; font-weight: 500;';
  currentSection.appendChild(currentName);

  container.appendChild(currentSection);

  // Add Profile button
  const addSection = document.createElement('div');
  addSection.className = 'form-section';
  addSection.style.cssText = 'border-top: 1px solid var(--border-primary); padding-top: 16px;';

  const addBtn = document.createElement('button');
  addBtn.textContent = 'Add Profile';
  addBtn.className = 'btn-primary';
  addBtn.style.cssText = `
    padding: 8px 16px;
    background: var(--accent-primary);
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 13px;
    cursor: pointer;
  `;
  addBtn.addEventListener('click', () => showAddProfileDialog(container));
  addSection.appendChild(addBtn);

  container.appendChild(addSection);

  // Profiles list section
  const listSection = document.createElement('div');
  listSection.className = 'form-section';
  listSection.style.cssText = 'border-top: 1px solid var(--border-primary); padding-top: 16px;';

  const listTitle = document.createElement('h3');
  listTitle.className = 'form-section-title';
  listTitle.textContent = 'All Profiles';
  listSection.appendChild(listTitle);

  const profilesList = document.createElement('div');
  profilesList.className = 'profiles-list';
  profilesList.style.cssText = 'display: flex; flex-direction: column; gap: 12px;';

  for (const profile of profiles) {
    const card = document.createElement('div');
    card.style.cssText = `
      padding: 12px;
      background: var(--bg-secondary);
      border: 1px solid var(--border-primary);
      border-radius: 6px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;

    // Profile header (radio + name + delete)
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; gap: 8px;';

    // Radio button for switching
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'profile-switch';
    const isCurrentProfile = currentProfile && profile.id === currentProfile.id;
    radio.checked = isCurrentProfile;
    radio.style.cursor = 'pointer';
    radio.addEventListener('change', () => {
      if (radio.checked) {
        console.log(`[profiles] Switching to profile: ${profile.name} (slug: ${profile.slug})`);

        // Double check we're not already on this profile
        if (isCurrentProfile) {
          console.log('[profiles] Already on this profile, skipping switch');
          return;
        }

        if (confirm(`Switch to "${profile.name}"?\n\nThe app will restart to apply the change.`)) {
          console.log('[profiles] User confirmed switch');
          api.profiles.switch(profile.slug).then(result => {
            if (!result.success) {
              console.error('[profiles] Switch failed:', result.error);
              alert(`Failed to switch profile: ${result.error}`);
              radio.checked = false;
            }
          });
        } else {
          console.log('[profiles] User cancelled switch');
          radio.checked = false;
        }
      }
    });
    header.appendChild(radio);

    // Profile name
    const nameEl = document.createElement('span');
    nameEl.textContent = profile.name;
    nameEl.style.cssText = 'flex: 1; font-weight: 500;';
    header.appendChild(nameEl);

    // Delete button (disabled for default or active)
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Delete';
    deleteBtn.disabled = profile.isDefault || (currentProfile && profile.id === currentProfile.id);
    deleteBtn.style.cssText = `
      padding: 4px 12px;
      background: var(--bg-tertiary);
      border: 1px solid var(--border-primary);
      border-radius: 4px;
      color: var(--text-secondary);
      font-size: 12px;
      cursor: pointer;
    `;
    if (deleteBtn.disabled) {
      deleteBtn.style.opacity = '0.5';
      deleteBtn.style.cursor = 'not-allowed';
    }
    deleteBtn.addEventListener('click', async () => {
      if (confirm(`Delete profile "${profile.name}"? Data will be preserved but the profile record will be removed.`)) {
        const result = await api.profiles.delete(profile.id);
        if (result.success) {
          card.remove();
        } else {
          alert(`Failed to delete profile: ${result.error}`);
        }
      }
    });
    header.appendChild(deleteBtn);

    card.appendChild(header);

    // Sync configuration section
    const syncSection = document.createElement('div');
    syncSection.style.cssText = `
      padding: 8px;
      background: var(--bg-tertiary);
      border-radius: 4px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    `;

    const syncTitle = document.createElement('div');
    syncTitle.textContent = 'Sync Configuration';
    syncTitle.style.cssText = 'font-size: 12px; font-weight: 500; color: var(--text-secondary);';
    syncSection.appendChild(syncTitle);

    // Check if sync is enabled
    let syncConfig = null;
    try {
      const configResult = await api.profiles.getSyncConfig(profile.id);
      if (configResult.success && configResult.data) {
        syncConfig = configResult.data;
      }
    } catch (err) {
      console.error('[settings] Failed to get sync config for profile:', err);
    }

    if (syncConfig) {
      // Sync enabled - show details and disable button
      const syncDetails = document.createElement('div');
      syncDetails.style.cssText = 'font-size: 12px; color: var(--text-secondary);';
      syncDetails.innerHTML = `
        <div>✓ Sync enabled</div>
        <div>Server profile: <strong>${syncConfig.serverProfileSlug}</strong></div>
      `;
      syncSection.appendChild(syncDetails);

      const disableBtn = document.createElement('button');
      disableBtn.textContent = 'Disable Sync';
      disableBtn.style.cssText = `
        padding: 4px 12px;
        background: var(--bg-tertiary);
        border: 1px solid var(--border-primary);
        border-radius: 4px;
        color: var(--text-secondary);
        font-size: 12px;
        cursor: pointer;
        align-self: flex-start;
      `;
      disableBtn.addEventListener('click', async () => {
        if (confirm(`Disable sync for profile "${profile.name}"?`)) {
          const result = await api.profiles.disableSync(profile.id);
          if (result.success) {
            // Refresh the profiles section
            const newContent = await renderProfilesSettings();
            container.replaceWith(newContent);
          } else {
            alert(`Failed to disable sync: ${result.error}`);
          }
        }
      });
      syncSection.appendChild(disableBtn);
    } else {
      // Sync not enabled - show enable button
      const syncDisabled = document.createElement('div');
      syncDisabled.style.cssText = 'font-size: 12px; color: var(--text-secondary);';
      syncDisabled.textContent = 'Sync not configured';
      syncSection.appendChild(syncDisabled);

      const enableBtn = document.createElement('button');
      enableBtn.textContent = 'Enable Sync';
      enableBtn.style.cssText = `
        padding: 4px 12px;
        background: var(--accent-primary);
        border: none;
        border-radius: 4px;
        color: white;
        font-size: 12px;
        cursor: pointer;
        align-self: flex-start;
      `;
      enableBtn.addEventListener('click', () => showEnableSyncDialog(profile, container));
      syncSection.appendChild(enableBtn);
    }

    card.appendChild(syncSection);
    profilesList.appendChild(card);
  }

  listSection.appendChild(profilesList);
  container.appendChild(listSection);

  return container;
};

// Show add profile dialog
const showAddProfileDialog = async (parentContainer) => {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: var(--bg-primary);
    padding: 24px;
    border-radius: 8px;
    width: 400px;
    max-width: 90%;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

  const title = document.createElement('h3');
  title.textContent = 'Add Profile';
  title.style.cssText = 'margin: 0 0 16px 0;';
  content.appendChild(title);

  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Profile name (e.g., Work, Personal)';
  input.style.cssText = `
    width: 100%;
    padding: 8px;
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 14px;
    margin-bottom: 16px;
  `;
  content.appendChild(input);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding: 8px 16px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
  `;
  cancelBtn.addEventListener('click', () => dialog.remove());
  buttons.appendChild(cancelBtn);

  const createBtn = document.createElement('button');
  createBtn.textContent = 'Create';
  createBtn.style.cssText = `
    padding: 8px 16px;
    background: var(--accent-primary);
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 13px;
    cursor: pointer;
  `;
  createBtn.addEventListener('click', async () => {
    const name = input.value.trim();
    if (!name) {
      alert('Please enter a profile name');
      return;
    }

    const result = await api.profiles.create(name);
    if (result.success) {
      dialog.remove();
      // Refresh the profiles section
      const newContent = await renderProfilesSettings();
      parentContainer.replaceWith(newContent);
    } else {
      alert(`Failed to create profile: ${result.error}`);
    }
  });
  buttons.appendChild(createBtn);

  content.appendChild(buttons);
  dialog.appendChild(content);
  document.body.appendChild(dialog);

  input.focus();
};

// Show enable sync dialog
const showEnableSyncDialog = async (profile, parentContainer) => {
  const dialog = document.createElement('div');
  dialog.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 10000;
  `;

  const content = document.createElement('div');
  content.style.cssText = `
    background: var(--bg-primary);
    padding: 24px;
    border-radius: 8px;
    width: 500px;
    max-width: 90%;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
  `;

  const title = document.createElement('h3');
  title.textContent = `Enable Sync for "${profile.name}"`;
  title.style.cssText = 'margin: 0 0 16px 0;';
  content.appendChild(title);

  const description = document.createElement('p');
  description.textContent = 'Enter your server API key and the server profile slug to sync to.';
  description.style.cssText = 'margin: 0 0 16px 0; font-size: 13px; color: var(--text-secondary);';
  content.appendChild(description);

  const apiKeyInput = document.createElement('input');
  apiKeyInput.type = 'password';
  apiKeyInput.placeholder = 'API Key';
  apiKeyInput.style.cssText = `
    width: 100%;
    padding: 8px;
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 14px;
    margin-bottom: 12px;
  `;
  content.appendChild(apiKeyInput);

  const slugInput = document.createElement('input');
  slugInput.type = 'text';
  slugInput.placeholder = 'Server profile slug (e.g., default, work, personal)';
  slugInput.style.cssText = `
    width: 100%;
    padding: 8px;
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    background: var(--bg-secondary);
    color: var(--text-primary);
    font-size: 14px;
    margin-bottom: 16px;
  `;
  content.appendChild(slugInput);

  const buttons = document.createElement('div');
  buttons.style.cssText = 'display: flex; gap: 8px; justify-content: flex-end;';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = `
    padding: 8px 16px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
  `;
  cancelBtn.addEventListener('click', () => dialog.remove());
  buttons.appendChild(cancelBtn);

  const enableBtn = document.createElement('button');
  enableBtn.textContent = 'Enable';
  enableBtn.style.cssText = `
    padding: 8px 16px;
    background: var(--accent-primary);
    border: none;
    border-radius: 4px;
    color: white;
    font-size: 13px;
    cursor: pointer;
  `;
  enableBtn.addEventListener('click', async () => {
    const apiKey = apiKeyInput.value.trim();
    const serverProfileSlug = slugInput.value.trim();

    if (!apiKey) {
      alert('Please enter an API key');
      return;
    }

    if (!serverProfileSlug) {
      alert('Please enter a server profile slug');
      return;
    }

    const result = await api.profiles.enableSync(profile.id, apiKey, serverProfileSlug);
    if (result.success) {
      dialog.remove();
      // Refresh the profiles section
      const newContent = await renderProfilesSettings();
      parentContainer.replaceWith(newContent);
    } else {
      alert(`Failed to enable sync: ${result.error}`);
    }
  });
  buttons.appendChild(enableBtn);

  content.appendChild(buttons);
  dialog.appendChild(content);
  document.body.appendChild(dialog);

  apiKeyInput.focus();
};

// Initialize
const init = async () => {
  const sidebarNav = document.getElementById('sidebarNav');
  const contentArea = document.getElementById('settingsContent');

  // Pre-load core store for isFeatureEnabled checks
  _coreStore = await createDatastoreStore('core', appConfig.defaults);

  // Add Core section
  const coreNav = document.createElement('a');
  coreNav.className = 'nav-item active';
  coreNav.textContent = 'Core';
  coreNav.dataset.section = 'core';
  coreNav.addEventListener('click', () => showSection('core'));
  sidebarNav.appendChild(coreNav);

  const coreSection = await createSection('core', 'Core Settings', renderCoreSettings);
  coreSection.classList.add('active');
  contentArea.appendChild(coreSection);

  // Track feature nav items and sections for dynamic updates
  const featureElements = new Map();

  // Add CORE feature sections (cmd, scripts - features that run in peek://app context)
  for (const i in fc) {
    const feature = fc[i];
    const name = feature.labels.name;
    const sectionId = name.toLowerCase().replace(/\s+/g, '-');
    const enabled = isFeatureEnabled(name);

    // Add nav item
    const navItem = document.createElement('a');
    navItem.className = 'nav-item';
    navItem.textContent = name;
    navItem.dataset.section = sectionId;
    navItem.dataset.featureName = name;
    navItem.addEventListener('click', () => showSection(sectionId));
    if (!enabled) navItem.style.display = 'none';
    sidebarNav.appendChild(navItem);

    // Add section
    const section = await createSection(sectionId, name, () => renderFeatureSettings(feature));
    if (!enabled) section.style.display = 'none';
    contentArea.appendChild(section);

    featureElements.set(name.toLowerCase(), { navItem, section });
  }

  // Listen for feature toggle events to update sidebar (core features only)
  api.subscribe('core:feature:toggle', (msg) => {
    const featureName = msg.featureId?.toLowerCase();
    const elements = featureElements.get(featureName);
    if (elements) {
      const display = msg.enabled ? '' : 'none';
      elements.navItem.style.display = display;
      elements.section.style.display = display;

      // If currently viewing a disabled section, switch to Core
      if (!msg.enabled && elements.section.classList.contains('active')) {
        showSection('core');
      }
    }
  });

  // Add Extensions management section (must be created before loading extension settings)
  const extNav = document.createElement('a');
  extNav.className = 'nav-item';
  extNav.textContent = 'Extensions';
  extNav.dataset.section = 'extensions';
  extNav.addEventListener('click', () => showSection('extensions'));
  sidebarNav.appendChild(extNav);

  // Create extensions section with async content
  const extSection = document.createElement('div');
  extSection.className = 'section';
  extSection.id = 'section-extensions';

  const extTitle = document.createElement('h2');
  extTitle.className = 'section-title';
  extTitle.textContent = 'Extensions';
  extSection.appendChild(extTitle);

  // Load extensions content async
  renderExtensionsSettings().then(content => {
    extSection.appendChild(content);
  });

  contentArea.appendChild(extSection);

  // Add EXTENSION settings sections (peeks, slides, groups - run in isolated peek://ext contexts)
  // Load schemas dynamically from extension manifests
  // Track which extensions we've already added to avoid duplicates
  const addedExtensions = new Set();

  const loadExtensionSettings = async () => {
    try {
      const result = await api.extensions.list();
      if (result.success && result.data) {
        for (const ext of result.data) {
          // Only show extensions that have schemas defined
          if (!ext.manifest?.schemas) continue;

          // Skip if already added
          const extName = ext.manifest.name.toLowerCase();
          if (addedExtensions.has(extName)) continue;
          addedExtensions.add(extName);

          // Construct feature-like object from manifest
          const feature = {
            id: ext.manifest.id,
            labels: { name: ext.manifest.name },
            schemas: ext.manifest.schemas,
            storageKeys: ext.manifest.storageKeys || { PREFS: 'prefs', ITEMS: 'items' },
            defaults: ext.manifest.defaults || {}
          };

          const name = feature.labels.name;
          const sectionId = name.toLowerCase().replace(/\s+/g, '-');

          // Add nav item (insert before Extensions nav item)
          const navItem = document.createElement('a');
          navItem.className = 'nav-item';
          navItem.textContent = name;
          navItem.dataset.section = sectionId;
          navItem.dataset.featureName = name;
          navItem.dataset.isExtension = 'true';
          navItem.addEventListener('click', () => showSection(sectionId));

          // Insert before the Extensions section in nav
          const extNavItem = sidebarNav.querySelector('[data-section="extensions"]');
          if (extNavItem) {
            sidebarNav.insertBefore(navItem, extNavItem);
          } else {
            sidebarNav.appendChild(navItem);
          }

          // Add section (insert before extensions section)
          const section = await createSection(sectionId, name, () => renderFeatureSettings(feature));
          const extSectionEl = document.getElementById('section-extensions');
          if (extSectionEl) {
            contentArea.insertBefore(section, extSectionEl);
          } else {
            contentArea.appendChild(section);
          }

          featureElements.set(name.toLowerCase(), { navItem, section });
        }
      }
    } catch (err) {
      console.error('[settings] Failed to load extension schemas:', err);
    }
  };

  // Load extensions that are already running
  await loadExtensionSettings();

  // Listen for all extensions loaded event to catch any we missed
  // NOTE: Only ONE ext:all-loaded subscription per source - pubsub overwrites duplicates
  api.subscribe('ext:all-loaded', () => {
    loadExtensionSettings();
    // Also refresh the Extensions list if it's been rendered
    if (window._refreshExtensionsList) {
      window._refreshExtensionsList();
    }
  }, api.scopes.GLOBAL);

  // Add Sync management section (between Extensions and Themes)
  const syncNav = document.createElement('a');
  syncNav.className = 'nav-item';
  syncNav.textContent = 'Sync';
  syncNav.dataset.section = 'sync';
  syncNav.addEventListener('click', () => showSection('sync'));
  sidebarNav.appendChild(syncNav);

  // Create sync section with async content
  const syncSection = document.createElement('div');
  syncSection.className = 'section';
  syncSection.id = 'section-sync';

  const syncTitle = document.createElement('h2');
  syncTitle.className = 'section-title';
  syncTitle.textContent = 'Sync';
  syncSection.appendChild(syncTitle);

  // Load sync content async
  renderSyncSettings().then(content => {
    syncSection.appendChild(content);
  });

  contentArea.appendChild(syncSection);

  // Add Profiles management section
  const profilesNav = document.createElement('a');
  profilesNav.className = 'nav-item';
  profilesNav.textContent = 'Profiles';
  profilesNav.dataset.section = 'profiles';
  profilesNav.addEventListener('click', () => showSection('profiles'));
  sidebarNav.appendChild(profilesNav);

  // Create profiles section with async content
  const profilesSection = document.createElement('div');
  profilesSection.className = 'section';
  profilesSection.id = 'section-profiles';

  const profilesTitle = document.createElement('h2');
  profilesTitle.className = 'section-title';
  profilesTitle.textContent = 'Profiles';
  profilesSection.appendChild(profilesTitle);

  // Load profiles content async
  renderProfilesSettings().then(content => {
    profilesSection.appendChild(content);
  });

  contentArea.appendChild(profilesSection);

  // Add Themes management section
  const themesNav = document.createElement('a');
  themesNav.className = 'nav-item';
  themesNav.textContent = 'Themes';
  themesNav.dataset.section = 'themes';
  themesNav.addEventListener('click', () => showSection('themes'));
  sidebarNav.appendChild(themesNav);

  // Create themes section with async content
  const themesSection = document.createElement('div');
  themesSection.className = 'section';
  themesSection.id = 'section-themes';

  const themesTitle = document.createElement('h2');
  themesTitle.className = 'section-title';
  themesTitle.textContent = 'Themes';
  themesSection.appendChild(themesTitle);

  // Load themes content async
  renderThemesSettings().then(content => {
    themesSection.appendChild(content);
  });

  contentArea.appendChild(themesSection);

  // Add Datastore link
  const datastoreNav = document.createElement('a');
  datastoreNav.className = 'nav-item';
  datastoreNav.textContent = 'Datastore';
  datastoreNav.style.cursor = 'pointer';
  datastoreNav.addEventListener('click', () => {
    api.window.open('peek://app/datastore/viewer.html', {
      width: 900,
      height: 600,
      key: 'datastore-viewer'
    });
  });
  sidebarNav.appendChild(datastoreNav);

  // Add Diagnostic link
  const diagnosticNav = document.createElement('a');
  diagnosticNav.className = 'nav-item';
  diagnosticNav.textContent = 'Diagnostic';
  diagnosticNav.style.cursor = 'pointer';
  diagnosticNav.addEventListener('click', () => {
    api.window.open('peek://app/diagnostic.html', {
      width: 900,
      height: 700,
      key: 'diagnostic-tool'
    });
  });
  sidebarNav.appendChild(diagnosticNav);

  // Add Quit button at the very bottom
  const quitBtn = document.createElement('button');
  quitBtn.textContent = 'Quit';
  quitBtn.style.cssText = `
    margin: auto 20px 20px 20px;
    padding: 8px 16px;
    background: var(--bg-tertiary);
    border: 1px solid var(--border-primary);
    border-radius: 4px;
    color: var(--text-secondary);
    font-size: 13px;
    cursor: pointer;
    width: calc(100% - 40px);
  `;
  quitBtn.addEventListener('mouseenter', () => {
    quitBtn.style.background = 'var(--bg-hover)';
  });
  quitBtn.addEventListener('mouseleave', () => {
    quitBtn.style.background = 'var(--bg-tertiary)';
  });
  quitBtn.addEventListener('click', () => {
    api.quit();
  });
  sidebarNav.appendChild(quitBtn);
};

window.addEventListener('load', init);

window.addEventListener('blur', () => {
  console.log('core settings blur');
});

// Listen for navigation requests from commands
api.subscribe('settings:navigate', (msg) => {
  if (msg.section) {
    showSection(msg.section);
  }
}, api.scopes.GLOBAL);

// Expose showSection for external navigation
window.showSettingsSection = showSection;
