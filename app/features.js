/**
 * Features Collection
 *
 * This module provides core feature schemas for the Settings UI.
 *
 * Architecture (Jan 2025):
 * - cmd and scripts are CORE features (run in peek://app context)
 * - Extensions (peeks, slides, groups) run in isolated peek://ext contexts
 *   and their schemas are loaded dynamically from manifest.json
 */

// Core features only
import cmd from './cmd/index.js';
import scripts from './scripts/index.js';

const fc = {};

fc[cmd.id] = cmd;
fc[scripts.id] = scripts;

export default fc;
