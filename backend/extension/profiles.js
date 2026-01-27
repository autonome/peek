/**
 * Browser Extension Profiles Module
 *
 * Manages user profiles using chrome.storage.local.
 * Mirrors backend/electron/profiles.ts data model.
 */

const PROFILES_KEY = 'peek_profiles';
const ACTIVE_PROFILE_KEY = 'peek_active_profile';

// ==================== Internal Helpers ====================

async function getProfiles() {
  const data = await chrome.storage.local.get({ [PROFILES_KEY]: [] });
  return data[PROFILES_KEY];
}

async function saveProfiles(profiles) {
  await chrome.storage.local.set({ [PROFILES_KEY]: profiles });
}

async function getActiveSlug() {
  const data = await chrome.storage.local.get({ [ACTIVE_PROFILE_KEY]: 'default' });
  return data[ACTIVE_PROFILE_KEY];
}

async function setActiveSlug(slug) {
  await chrome.storage.local.set({ [ACTIVE_PROFILE_KEY]: slug });
}

function slugify(name) {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

// ==================== Public API ====================

export async function ensureDefaultProfile() {
  const profiles = await getProfiles();
  const hasDefault = profiles.some(p => p.slug === 'default');

  if (!hasDefault) {
    const timestamp = Date.now();
    profiles.push({
      id: crypto.randomUUID(),
      name: 'Default',
      slug: 'default',
      syncEnabled: false,
      apiKey: null,
      serverProfileId: null,
      lastSyncAt: null,
      createdAt: timestamp,
      lastUsedAt: timestamp,
      isDefault: true,
    });
    await saveProfiles(profiles);
  }

  return { success: true };
}

export async function listProfiles() {
  const profiles = await getProfiles();
  // Sort by lastUsedAt descending
  profiles.sort((a, b) => (b.lastUsedAt || 0) - (a.lastUsedAt || 0));
  return { success: true, data: profiles };
}

export async function createProfile(name) {
  const profiles = await getProfiles();
  const slug = slugify(name);

  if (profiles.some(p => p.slug === slug)) {
    return { success: false, error: `Profile with slug '${slug}' already exists` };
  }

  const timestamp = Date.now();
  const profile = {
    id: crypto.randomUUID(),
    name,
    slug,
    syncEnabled: false,
    apiKey: null,
    serverProfileId: null,
    lastSyncAt: null,
    createdAt: timestamp,
    lastUsedAt: timestamp,
    isDefault: false,
  };

  profiles.push(profile);
  await saveProfiles(profiles);

  return { success: true, data: profile };
}

export async function getProfile(slug) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.slug === slug);
  return { success: true, data: profile || null };
}

export async function getProfileById(id) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.id === id);
  return { success: true, data: profile || null };
}

export async function getCurrentProfile() {
  const slug = await getActiveSlug();
  const profiles = await getProfiles();

  let profile = profiles.find(p => p.slug === slug);

  if (!profile) {
    // Fallback to default
    profile = profiles.find(p => p.isDefault);
  }

  if (!profile && profiles.length > 0) {
    profile = profiles[0];
  }

  if (!profile) {
    return { success: false, error: 'No profiles found. Call ensureDefaultProfile first.' };
  }

  return { success: true, data: profile };
}

export async function switchProfile(slug) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.slug === slug);

  if (!profile) {
    return { success: false, error: `Profile '${slug}' not found` };
  }

  profile.lastUsedAt = Date.now();
  await saveProfiles(profiles);
  await setActiveSlug(slug);

  return { success: true, data: profile };
}

export async function deleteProfile(id) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.id === id);

  if (!profile) {
    return { success: false, error: 'Profile not found' };
  }
  if (profile.isDefault) {
    return { success: false, error: 'Cannot delete default profile' };
  }

  const activeSlug = await getActiveSlug();
  if (profile.slug === activeSlug) {
    return { success: false, error: 'Cannot delete active profile' };
  }

  const updated = profiles.filter(p => p.id !== id);
  await saveProfiles(updated);

  return { success: true };
}

export async function enableSync(profileId, apiKey, serverProfileId) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.id === profileId);

  if (!profile) {
    return { success: false, error: 'Profile not found' };
  }

  profile.syncEnabled = true;
  profile.apiKey = apiKey;
  profile.serverProfileId = serverProfileId;
  await saveProfiles(profiles);

  return { success: true };
}

export async function disableSync(profileId) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.id === profileId);

  if (!profile) {
    return { success: false, error: 'Profile not found' };
  }

  profile.syncEnabled = false;
  profile.apiKey = null;
  profile.serverProfileId = null;
  profile.lastSyncAt = null;
  await saveProfiles(profiles);

  return { success: true };
}

export async function getSyncConfig(profileId) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.id === profileId);

  if (!profile || !profile.syncEnabled || !profile.apiKey || !profile.serverProfileId) {
    return { success: true, data: null };
  }

  return {
    success: true,
    data: {
      apiKey: profile.apiKey,
      serverProfileId: profile.serverProfileId,
    },
  };
}

export async function updateLastSyncTime(profileId, timestamp) {
  const profiles = await getProfiles();
  const profile = profiles.find(p => p.id === profileId);

  if (!profile) {
    return { success: false, error: 'Profile not found' };
  }

  profile.lastSyncAt = timestamp;
  await saveProfiles(profiles);

  return { success: true };
}
