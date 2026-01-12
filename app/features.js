/**
 * Features Collection
 *
 * This module provides core feature schemas for the Settings UI.
 *
 * Architecture (Jan 2025):
 * - scripts is the only CORE feature (runs in peek://app context)
 * - Extensions (cmd, peeks, slides, groups) run in isolated peek://ext contexts
 *   and their schemas are loaded dynamically from manifest.json
 */

// Core features only
import scripts from './scripts/index.js';

const fc = {};

fc[scripts.id] = scripts;

export default fc;
