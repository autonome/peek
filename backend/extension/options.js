/**
 * Peek Options Page Logic
 *
 * Imports the API module directly (same extension origin).
 */

import { openDatabase } from './datastore.js';
import app from './api.js';

// ==================== Init ====================

async function init() {
  try {
    await openDatabase();
    await app.profiles.ensureDefault();
  } catch (error) {
    console.error('[options] Init error:', error);
  }

  await loadConfig();
  await refreshDiagnostics();

  // Wire up buttons
  document.getElementById('save-config').addEventListener('click', saveConfig);
  document.getElementById('btn-pull').addEventListener('click', doPull);
  document.getElementById('btn-push').addEventListener('click', doPush);
  document.getElementById('btn-sync-all').addEventListener('click', doSyncAll);
  document.getElementById('btn-refresh').addEventListener('click', refreshDiagnostics);
}

// ==================== Sync Config ====================

async function loadConfig() {
  const result = await app.sync.getConfig();
  const config = result.data;
  if (!config) return;

  document.getElementById('server-url').value = config.serverUrl || '';
  document.getElementById('auto-sync').checked = !!config.autoSync;

  // Load profile-specific config
  const profileResult = await app.profiles.getCurrent();
  if (profileResult.success && profileResult.data) {
    const profile = profileResult.data;
    document.getElementById('api-key').value = profile.apiKey || '';
    document.getElementById('server-profile-id').value = profile.serverProfileId || '';
  }
}

async function saveConfig() {
  const serverUrl = document.getElementById('server-url').value.trim();
  const apiKey = document.getElementById('api-key').value.trim();
  const serverProfileId = document.getElementById('server-profile-id').value.trim();
  const autoSync = document.getElementById('auto-sync').checked;

  const statusEl = document.getElementById('config-status');

  try {
    // Save global config
    await app.sync.setConfig({ serverUrl, autoSync });

    // Save per-profile sync config
    const profileResult = await app.profiles.getCurrent();
    if (profileResult.success && profileResult.data) {
      const profile = profileResult.data;
      if (apiKey) {
        await app.profiles.enableSync(profile.id, apiKey, serverProfileId);
      } else {
        await app.profiles.disableSync(profile.id);
      }
    }

    statusEl.textContent = 'Configuration saved.';
    statusEl.className = 'status-msg success';
  } catch (error) {
    statusEl.textContent = `Error: ${error.message}`;
    statusEl.className = 'status-msg error';
  }

  setTimeout(() => { statusEl.textContent = ''; }, 3000);
}

// ==================== Diagnostics ====================

async function refreshDiagnostics() {
  try {
    const statsResult = await app.datastore.getStats();
    const stats = statsResult.data;
    if (stats) {
      document.getElementById('diag-items').textContent = stats.totalItems;
      document.getElementById('diag-tags').textContent = stats.totalTags;
    }

    const statusResult = await app.sync.getStatus();
    const status = statusResult.data;
    if (status) {
      document.getElementById('diag-pending').textContent = status.pendingCount;
      document.getElementById('diag-last-sync').textContent =
        status.lastSyncTime ? new Date(status.lastSyncTime).toLocaleString() : 'Never';
      document.getElementById('diag-configured').textContent = status.configured ? 'Yes' : 'No';
    }

    const profileResult = await app.profiles.getCurrent();
    if (profileResult.success && profileResult.data) {
      document.getElementById('diag-profile').textContent = profileResult.data.name;
    }

    document.getElementById('diag-ds-version').textContent = app.version.datastore;
    document.getElementById('diag-proto-version').textContent = app.version.protocol;

    const envResult = await app.environment.get();
    if (envResult) {
      document.getElementById('diag-device-id').textContent = envResult.deviceId || '--';
      document.getElementById('diag-browser').textContent =
        [envResult.browser, envResult.browserVersion].filter(Boolean).join(' ');
      document.getElementById('diag-build-id').textContent = envResult.browserBuildId || '--';
      document.getElementById('diag-os-arch').textContent =
        [envResult.os, envResult.arch].filter(Boolean).join(' / ') || envResult.platform || '--';
      document.getElementById('diag-ext-version').textContent = envResult.extensionVersion || '--';
    }
  } catch (error) {
    console.error('[options] Diagnostics error:', error);
  }
}

// ==================== Sync Actions ====================

async function doPull() {
  const statusEl = document.getElementById('diag-status');
  statusEl.textContent = 'Pulling...';
  statusEl.className = 'status-msg';

  try {
    const result = await app.sync.pull();
    if (result.success) {
      statusEl.textContent = `Pulled ${result.data.pulled} items, ${result.data.conflicts} conflicts.`;
      statusEl.className = 'status-msg success';
    } else {
      statusEl.textContent = `Pull failed: ${result.error}`;
      statusEl.className = 'status-msg error';
    }
  } catch (error) {
    statusEl.textContent = `Pull error: ${error.message}`;
    statusEl.className = 'status-msg error';
  }

  await refreshDiagnostics();
}

async function doPush() {
  const statusEl = document.getElementById('diag-status');
  statusEl.textContent = 'Pushing...';
  statusEl.className = 'status-msg';

  try {
    const result = await app.sync.push();
    if (result.success) {
      statusEl.textContent = `Pushed ${result.data.pushed} items, ${result.data.failed} failed.`;
      statusEl.className = 'status-msg success';
    } else {
      statusEl.textContent = `Push failed: ${result.error}`;
      statusEl.className = 'status-msg error';
    }
  } catch (error) {
    statusEl.textContent = `Push error: ${error.message}`;
    statusEl.className = 'status-msg error';
  }

  await refreshDiagnostics();
}

async function doSyncAll() {
  const statusEl = document.getElementById('diag-status');
  statusEl.textContent = 'Syncing...';
  statusEl.className = 'status-msg';

  try {
    const result = await app.sync.syncAll();
    if (result.success) {
      const d = result.data;
      statusEl.textContent = `Sync complete: ${d.pulled} pulled, ${d.pushed} pushed, ${d.conflicts} conflicts.`;
      statusEl.className = 'status-msg success';
    } else {
      statusEl.textContent = `Sync failed: ${result.error}`;
      statusEl.className = 'status-msg error';
    }
  } catch (error) {
    statusEl.textContent = `Sync error: ${error.message}`;
    statusEl.className = 'status-msg error';
  }

  await refreshDiagnostics();
}

// ==================== Start ====================

init();
