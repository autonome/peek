/**
 * Pre-configure sync settings and run initial sync for test profile
 *
 * This script must be run with Electron (not Node) because better-sqlite3
 * is compiled for Electron's Node version.
 *
 * Usage: electron scripts/preconfigure-sync.mjs
 *
 * Environment variables:
 * - PROFILE: Profile name (required)
 * - SERVER_URL: Sync server URL (required)
 * - API_KEY: Server API key (required)
 */

import { app } from 'electron';
import { join } from 'path';
import { mkdirSync, existsSync } from 'fs';
import { homedir } from 'os';

// Prevent Electron from showing a window
app.disableHardwareAcceleration();

const PROFILE = process.env.PROFILE;
const SERVER_URL = process.env.SERVER_URL;
const API_KEY = process.env.API_KEY;

if (!PROFILE || !SERVER_URL || !API_KEY) {
  console.error('Missing required environment variables: PROFILE, SERVER_URL, API_KEY');
  process.exit(1);
}

app.whenReady().then(async () => {
  // Import compiled modules (after app is ready)
  const datastore = await import('../dist/backend/electron/datastore.js');
  const sync = await import('../dist/backend/electron/sync.js');
  const profiles = await import('../dist/backend/electron/profiles.js');

  // Paths
  const userDataPath = join(homedir(), 'Library', 'Application Support', 'Peek');
  const profileDir = join(userDataPath, PROFILE);
  const dbPath = join(profileDir, 'datastore.sqlite');

  console.log(`  Profile: ${PROFILE}`);
  console.log(`  Database: ${dbPath}`);
  console.log(`  Server: ${SERVER_URL}`);

  // Create profile directory if needed
  if (!existsSync(profileDir)) {
    mkdirSync(profileDir, { recursive: true });
    console.log('  Created profile directory');
  }

  // Initialize profiles database (uses .dev-profiles.db for dev builds)
  profiles.initProfilesDb(userDataPath, '.dev-profiles.db');
  profiles.migrateExistingProfiles();
  profiles.ensureDefaultProfile();

  // Create the test profile if it doesn't exist
  try {
    const existingProfile = profiles.getProfile(PROFILE);
    if (!existingProfile) {
      profiles.createProfile(PROFILE);
      console.log('  Created test profile in profiles.db');
    }
  } catch (error) {
    // Profile might already exist with different name
    console.log(`  Profile setup: ${error.message}`);
  }

  // Set this profile as active
  try {
    profiles.setActiveProfile(PROFILE);
    console.log('  Set active profile');
  } catch (error) {
    console.log(`  Could not set active profile: ${error.message}`);
  }

  // Initialize datastore
  datastore.initDatabase(dbPath);
  console.log('  Database initialized');

  // Enable sync for this profile
  const activeProfile = profiles.getActiveProfile();
  profiles.enableSync(activeProfile.id, API_KEY, 'default');

  // Set server URL globally
  sync.setSyncConfig({
    serverUrl: SERVER_URL,
    apiKey: API_KEY,
    lastSyncTime: 0,
    autoSync: false,
  });
  console.log('  Sync configured');

  // Run initial sync (pull from server)
  try {
    const result = await sync.pullFromServer(SERVER_URL, API_KEY);
    console.log(`  Pulled ${result.pulled} items from server`);
  } catch (error) {
    console.error('  Sync failed:', error.message);
    datastore.closeDatabase();
    profiles.closeProfilesDb();
    app.exit(1);
    return;
  }

  // Close databases
  datastore.closeDatabase();
  profiles.closeProfilesDb();
  console.log('  Pre-configuration complete');

  app.exit(0);
});

// Handle window-all-closed to prevent default behavior
app.on('window-all-closed', () => {
  // Do nothing - we'll exit manually
});
