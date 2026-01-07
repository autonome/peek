// features
// Note: groups is now an extension (./extensions/groups/)
import cmd from './cmd/index.js';
import peeks from './peeks/index.js';
import scripts from './scripts/index.js';
import slides from './slides/index.js';

const fc = {};
fc[cmd.id] = cmd,
fc[peeks.id] = peeks,
fc[scripts.id] = scripts,
fc[slides.id] = slides

export default fc;
