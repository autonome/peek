/**
 * Features Collection
 *
 * This module provides feature schemas for the Settings UI.
 *
 * Architecture note (Jan 2025):
 * - cmd and scripts are CORE features (run in peek://app context)
 * - peeks, slides, groups are EXTENSIONS (run in isolated peek://ext contexts)
 *
 * Extensions are now loaded by the main process ExtensionManager, not by
 * importing them here. However, this module still exports extension schemas
 * for the Settings UI to render settings forms.
 *
 * TODO: Settings UI should load extension schemas from manifest.json instead,
 * then app/peeks/ and app/slides/ can be deleted.
 */

// Core features
import cmd from './cmd/index.js';
import scripts from './scripts/index.js';

// Extension schemas (for Settings UI only - extensions run in isolated processes)
import peeks from './peeks/index.js';
import slides from './slides/index.js';

const fc = {};

// Core features
fc[cmd.id] = cmd;
fc[scripts.id] = scripts;

// Extension schemas for Settings UI
fc[peeks.id] = peeks;
fc[slides.id] = slides;

export default fc;
