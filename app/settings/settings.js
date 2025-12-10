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

  // Features
  if (features && features.length > 0) {
    const featuresSection = document.createElement('div');
    featuresSection.className = 'form-section';

    const title = document.createElement('h3');
    title.className = 'form-section-title';
    title.textContent = 'Features';
    featuresSection.appendChild(title);

    features.forEach((feature, i) => {
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

// Render feature settings (Peeks, Slides, etc.)
const renderFeatureSettings = (feature) => {
  const { id, labels, schemas, storageKeys, defaults } = feature;
  const store = openStore(id, defaults, clear);

  let prefs = store.get(storageKeys.PREFS);
  let items = store.get(storageKeys.ITEMS);

  const container = document.createElement('div');

  const save = () => {
    store.set(storageKeys.PREFS, prefs);
    store.set(storageKeys.ITEMS, items);
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
      card.className = 'item-card';

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
        items[i].enabled = e.target.checked;
        save();
      });

      wrapper.appendChild(checkbox);
      header.appendChild(wrapper);
      card.appendChild(header);

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

// Initialize
const init = () => {
  const sidebarNav = document.getElementById('sidebarNav');
  const contentArea = document.getElementById('settingsContent');

  // Add Core section
  const coreNav = document.createElement('a');
  coreNav.className = 'nav-item active';
  coreNav.textContent = 'Core';
  coreNav.dataset.section = 'core';
  coreNav.addEventListener('click', () => showSection('core'));
  sidebarNav.appendChild(coreNav);

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

  const coreSection = createSection('core', 'Core Settings', renderCoreSettings);
  coreSection.classList.add('active');
  contentArea.appendChild(coreSection);

  // Add feature sections
  for (const i in fc) {
    const feature = fc[i];
    const name = feature.labels.name;
    const sectionId = name.toLowerCase().replace(/\s+/g, '-');

    // Add nav item
    const navItem = document.createElement('a');
    navItem.className = 'nav-item';
    navItem.textContent = name;
    navItem.dataset.section = sectionId;
    navItem.addEventListener('click', () => showSection(sectionId));
    sidebarNav.appendChild(navItem);

    // Add section
    const section = createSection(sectionId, name, () => renderFeatureSettings(feature));
    contentArea.appendChild(section);
  }
};

window.addEventListener('load', init);

window.addEventListener('blur', () => {
  console.log('core settings blur');
});
