/**
 * Peek Component Version Management
 *
 * Semantic versioning, compatibility checking, and migration support.
 *
 * Usage:
 *   import { version, checkCompatibility, migrate } from 'peek://app/components/version.js';
 *
 *   console.log(version.current); // '1.0.0'
 *   checkCompatibility('>=0.9.0'); // true
 */

// Current library version
export const LIBRARY_VERSION = '1.0.0';

// Minimum supported version for migrations
export const MIN_SUPPORTED_VERSION = '0.1.0';

// Version history for changelog/migrations
const VERSION_HISTORY = [
  {
    version: '1.0.0',
    date: '2026-01-29',
    changes: [
      'Initial stable release',
      'Phase 1-4 components complete',
      'Theme system with light/dark built-in',
      'Extension system for content scripts',
      'Component registry with lazy loading'
    ],
    breaking: []
  }
];

/**
 * Parse semantic version string
 * @param {string} version - Version string (e.g., '1.2.3')
 * @returns {{ major: number, minor: number, patch: number, prerelease?: string }}
 */
export function parseVersion(version) {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!match) {
    throw new Error(`Invalid version format: ${version}`);
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null
  };
}

/**
 * Compare two versions
 * @param {string} a - First version
 * @param {string} b - Second version
 * @returns {number} -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a, b) {
  const va = parseVersion(a);
  const vb = parseVersion(b);

  if (va.major !== vb.major) return va.major - vb.major;
  if (va.minor !== vb.minor) return va.minor - vb.minor;
  if (va.patch !== vb.patch) return va.patch - vb.patch;

  // Prerelease versions are lower than release
  if (va.prerelease && !vb.prerelease) return -1;
  if (!va.prerelease && vb.prerelease) return 1;
  if (va.prerelease && vb.prerelease) {
    return va.prerelease.localeCompare(vb.prerelease);
  }

  return 0;
}

/**
 * Check if version satisfies a constraint
 * @param {string} version - Version to check
 * @param {string} constraint - Constraint (e.g., '>=1.0.0', '^1.2.0', '~1.2.3')
 * @returns {boolean}
 */
export function satisfies(version, constraint) {
  const v = parseVersion(version);

  // Exact match
  if (!constraint.match(/^[<>=^~]/)) {
    return compareVersions(version, constraint) === 0;
  }

  // Range operators
  if (constraint.startsWith('>=')) {
    return compareVersions(version, constraint.slice(2)) >= 0;
  }
  if (constraint.startsWith('<=')) {
    return compareVersions(version, constraint.slice(2)) <= 0;
  }
  if (constraint.startsWith('>')) {
    return compareVersions(version, constraint.slice(1)) > 0;
  }
  if (constraint.startsWith('<')) {
    return compareVersions(version, constraint.slice(1)) < 0;
  }

  // Caret (^) - compatible with version (same major)
  if (constraint.startsWith('^')) {
    const c = parseVersion(constraint.slice(1));
    return v.major === c.major && compareVersions(version, constraint.slice(1)) >= 0;
  }

  // Tilde (~) - approximately equivalent (same major.minor)
  if (constraint.startsWith('~')) {
    const c = parseVersion(constraint.slice(1));
    return v.major === c.major && v.minor === c.minor && v.patch >= c.patch;
  }

  return false;
}

/**
 * Check compatibility with current library version
 * @param {string} constraint - Version constraint
 * @returns {boolean}
 */
export function checkCompatibility(constraint) {
  return satisfies(LIBRARY_VERSION, constraint);
}

/**
 * Check if a version is deprecated
 * @param {string} version - Version to check
 * @returns {boolean}
 */
export function isDeprecated(version) {
  return compareVersions(version, MIN_SUPPORTED_VERSION) < 0;
}

/**
 * Get changelog for a version range
 * @param {string} fromVersion - Starting version
 * @param {string} toVersion - Ending version (default: current)
 * @returns {Array}
 */
export function getChangelog(fromVersion, toVersion = LIBRARY_VERSION) {
  return VERSION_HISTORY.filter(entry => {
    const cmp = compareVersions(entry.version, fromVersion);
    const cmpTo = compareVersions(entry.version, toVersion);
    return cmp > 0 && cmpTo <= 0;
  });
}

/**
 * Get breaking changes for a version range
 * @param {string} fromVersion - Starting version
 * @param {string} toVersion - Ending version (default: current)
 * @returns {Array}
 */
export function getBreakingChanges(fromVersion, toVersion = LIBRARY_VERSION) {
  const changelog = getChangelog(fromVersion, toVersion);
  return changelog.flatMap(entry =>
    entry.breaking.map(change => ({
      version: entry.version,
      change
    }))
  );
}

/**
 * Migration registry
 */
const migrations = new Map();

/**
 * Register a migration
 * @param {string} fromVersion - Source version
 * @param {string} toVersion - Target version
 * @param {Function} migrateFn - Migration function
 */
export function registerMigration(fromVersion, toVersion, migrateFn) {
  const key = `${fromVersion}->${toVersion}`;
  migrations.set(key, {
    from: fromVersion,
    to: toVersion,
    migrate: migrateFn
  });
}

/**
 * Find migration path between versions
 * @param {string} fromVersion - Source version
 * @param {string} toVersion - Target version
 * @returns {Array} Array of migration steps
 */
export function findMigrationPath(fromVersion, toVersion) {
  // Simple direct path lookup for now
  // Could be extended to find multi-step paths
  const key = `${fromVersion}->${toVersion}`;
  const migration = migrations.get(key);
  return migration ? [migration] : [];
}

/**
 * Run migrations
 * @param {Object} data - Data to migrate
 * @param {string} fromVersion - Source version
 * @param {string} toVersion - Target version (default: current)
 * @returns {Object} Migrated data
 */
export async function migrate(data, fromVersion, toVersion = LIBRARY_VERSION) {
  const path = findMigrationPath(fromVersion, toVersion);

  if (path.length === 0 && fromVersion !== toVersion) {
    console.warn(`No migration path from ${fromVersion} to ${toVersion}`);
    return data;
  }

  let result = data;
  for (const step of path) {
    result = await step.migrate(result);
  }

  return result;
}

/**
 * Version object for easy access
 */
export const version = {
  current: LIBRARY_VERSION,
  min: MIN_SUPPORTED_VERSION,
  parse: parseVersion,
  compare: compareVersions,
  satisfies,
  checkCompatibility,
  isDeprecated,
  getChangelog,
  getBreakingChanges,
  migrate,
  registerMigration,
  history: VERSION_HISTORY
};

/**
 * Runtime version check - warns if incompatible
 * @param {string} requiredVersion - Required version constraint
 * @param {string} context - Context for warning message
 */
export function requireVersion(requiredVersion, context = '') {
  if (!checkCompatibility(requiredVersion)) {
    const msg = `Version mismatch${context ? ` in ${context}` : ''}: requires ${requiredVersion}, current is ${LIBRARY_VERSION}`;
    console.warn(msg);
    return false;
  }
  return true;
}

/**
 * Decorator for version-gated features
 * @param {string} minVersion - Minimum version required
 * @returns {Function} Decorator
 */
export function sinceVersion(minVersion) {
  return function(target, propertyKey, descriptor) {
    const original = descriptor.value;
    descriptor.value = function(...args) {
      if (!satisfies(LIBRARY_VERSION, `>=${minVersion}`)) {
        throw new Error(`${propertyKey} requires version >=${minVersion}, current is ${LIBRARY_VERSION}`);
      }
      return original.apply(this, args);
    };
    return descriptor;
  };
}

export default version;
