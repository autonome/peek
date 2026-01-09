import appConfig from '../config.js';
import { openStore } from '../utils.js';
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

// Create a settings section
const createSection = (sectionId, title, contentFn) => {
  const section = document.createElement('div');
  section.className = 'section';
  section.id = `section-${sectionId}`;

  const titleEl = document.createElement('h2');
  titleEl.className = 'section-title';
  titleEl.textContent = title;
  section.appendChild(titleEl);

  const content = contentFn();
  if (content) {
    section.appendChild(content);
  }

  return section;
};

// Render core settings
const renderCoreSettings = () => {
  const { id, labels, schemas, storageKeys, defaults } = appConfig;
  const store = openStore(id, defaults, clear);

  let prefs = store.get(storageKeys.PREFS);
  let features = store.get(storageKeys.ITEMS);

  const container = document.createElement('div');

  const save = () => {
    store.set(storageKeys.PREFS, prefs);
    store.set(storageKeys.ITEMS, features);
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
      const manifest = validateResult.manifest || {};
      const isValid = validateResult.valid === true;

      addBtn.textContent = 'Adding...';

      // Add to datastore (disabled if invalid)
      const addResult = await api.extensions.add(folderPath, manifest, false);

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
      const store = openStore(appConfig.id, appConfig.defaults, false);
      const features = store.get(appConfig.storageKeys.ITEMS) || [];

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
      const builtinExtIds = ['groups', 'peeks', 'slides'];

      // Add builtin extensions (whether running or not)
      builtinExtIds.forEach(extId => {
        const running = runningById.get(extId);
        // Find matching feature to get enabled state
        const feature = features.find(f => f.name.toLowerCase() === extId);
        const isEnabled = feature ? feature.enabled : false;

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
      datastoreExts.forEach(ext => {
        const running = runningById.get(ext.id);
        allExtensions.push({
          id: ext.id,
          manifest: {
            id: ext.id,
            name: ext.name,
            shortname: JSON.parse(ext.metadata || '{}').shortname || ext.id,
            description: ext.description,
            version: ext.version,
            builtin: ext.builtin === 1
          },
          path: ext.path,
          source: 'datastore',
          isRunning: !!running,
          enabled: ext.enabled === 1,
          status: ext.status,
          lastError: ext.lastError
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
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.checked = ext.enabled;
        checkbox.style.cssText = 'width: 16px; height: 16px; cursor: pointer;';
        checkbox.addEventListener('change', async (e) => {
          const newEnabled = e.target.checked;
          checkbox.disabled = true;

          if (isBuiltin) {
            // Update features storage for persistence
            const store = openStore(appConfig.id, appConfig.defaults, false);
            const featuresList = store.get(appConfig.storageKeys.ITEMS) || [];
            const featureIndex = featuresList.findIndex(f => f.name.toLowerCase() === ext.id);
            if (featureIndex >= 0) {
              featuresList[featureIndex].enabled = newEnabled;
              store.set(appConfig.storageKeys.ITEMS, featuresList);
            }

            // Use the feature toggle mechanism to load/unload
            // This triggers the core:feature:toggle handler in app/index.js
            api.publish('core:feature:toggle', {
              featureId: ext.id,
              enabled: newEnabled
            });
          } else if (ext.source === 'datastore') {
            // Update in datastore
            await api.extensions.update(ext.id, {
              enabled: newEnabled ? 1 : 0,
              status: newEnabled ? 'installed' : 'disabled'
            });

            // Load or unload the extension
            if (newEnabled) {
              await api.extensions.load(ext.id);
            } else {
              await api.extensions.unload(ext.id);
            }
          }

          checkbox.disabled = false;
          // Small delay to let the extension load/unload
          setTimeout(refreshExtensionsList, 500);
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
          errorInfo.style.cssText = 'margin-top: 8px; padding: 8px; background: #fef2f2; border: 1px solid #fecaca; border-radius: 4px; font-size: 12px; color: #dc2626;';
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
// Now reads/writes from datastore extension_settings table for isolated extensions
const renderFeatureSettings = (feature) => {
  const { id, labels, schemas, storageKeys, defaults } = feature;

  // Use extension shortname for datastore key (e.g., 'peeks', 'slides', 'groups')
  const extId = labels.name.toLowerCase();

  // Read from localStorage (legacy source)
  const store = openStore(id, defaults, clear);

  let prefs = store.get(storageKeys.PREFS);
  let items = store.get(storageKeys.ITEMS);

  // Migrate localStorage to datastore if datastore is empty
  // This ensures extensions (which read from datastore) get the user's settings
  const migrateToDatastore = async () => {
    try {
      const rowIdPrefs = `${extId}:prefs`;
      const tableResult = await api.datastore.getTable('extension_settings');
      const table = tableResult.success ? (tableResult.data || {}) : {};

      // Check if this extension already has prefs in datastore
      const hasPrefs = Object.values(table).some(row => row.extensionId === extId && row.key === 'prefs');

      // If datastore doesn't have prefs yet, migrate from localStorage
      if (!hasPrefs) {
        console.log(`[settings] Migrating ${extId} settings to datastore`);
        const now = Date.now();

        await api.datastore.setRow('extension_settings', rowIdPrefs, {
          extensionId: extId,
          key: 'prefs',
          value: JSON.stringify(prefs),
          updatedAt: now
        });

        if (items) {
          const rowIdItems = `${extId}:items`;
          await api.datastore.setRow('extension_settings', rowIdItems, {
            extensionId: extId,
            key: 'items',
            value: JSON.stringify(items),
            updatedAt: now
          });
        }

        // Notify extension to reload settings
        const settingsChangedTopic = `${extId}:settings-changed`;
        api.publish(settingsChangedTopic, {}, api.scopes.GLOBAL);
      }
    } catch (err) {
      console.error(`[settings] Migration error for ${extId}:`, err);
    }
  };

  // Run migration async (don't block UI)
  migrateToDatastore();

  const container = document.createElement('div');

  // Topic for notifying feature of settings changes (e.g., 'peeks:settings-changed')
  const settingsChangedTopic = `${labels.name.toLowerCase()}:settings-changed`;

  const save = async () => {
    // Save to localStorage (legacy)
    store.set(storageKeys.PREFS, prefs);
    store.set(storageKeys.ITEMS, items);

    // Also save to datastore for isolated extensions
    const rowIdPrefs = `${extId}:prefs`;
    const rowIdItems = `${extId}:items`;
    const now = Date.now();

    await api.datastore.setRow('extension_settings', rowIdPrefs, {
      extensionId: extId,
      key: 'prefs',
      value: JSON.stringify(prefs),
      updatedAt: now
    });

    if (items) {
      await api.datastore.setRow('extension_settings', rowIdItems, {
        extensionId: extId,
        key: 'items',
        value: JSON.stringify(items),
        updatedAt: now
      });
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

// Helper to check if a feature is enabled
const isFeatureEnabled = (featureName) => {
  const store = openStore(appConfig.id, appConfig.defaults, false);
  const features = store.get(appConfig.storageKeys.ITEMS) || [];
  const feature = features.find(f => f.name.toLowerCase() === featureName.toLowerCase());
  return feature ? feature.enabled : false;
};

// Initialize
const init = async () => {
  const sidebarNav = document.getElementById('sidebarNav');
  const contentArea = document.getElementById('settingsContent');

  // Add Core section
  const coreNav = document.createElement('a');
  coreNav.className = 'nav-item active';
  coreNav.textContent = 'Core';
  coreNav.dataset.section = 'core';
  coreNav.addEventListener('click', () => showSection('core'));
  sidebarNav.appendChild(coreNav);

  const coreSection = createSection('core', 'Core Settings', renderCoreSettings);
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
    const section = createSection(sectionId, name, () => renderFeatureSettings(feature));
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
          const section = createSection(sectionId, name, () => renderFeatureSettings(feature));
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
