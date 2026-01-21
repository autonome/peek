#!/usr/bin/env node

/**
 * Railway Log Verification Helper
 *
 * Checks Railway logs for sync markers from e2e tests.
 *
 * Usage:
 *   node backend/tests/verify-railway-logs.js [marker]
 *   yarn test:sync:verify-logs [marker]
 *
 * Examples:
 *   # Check for a specific test run
 *   node backend/tests/verify-railway-logs.js "E2E-TEST-1737481234567"
 *
 *   # Check for recent sync activity
 *   node backend/tests/verify-railway-logs.js
 *
 * Note: Requires Railway CLI to be installed and linked to the project.
 *   cd backend/server && railway link -p amusing-courtesy
 */

import { spawn } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = join(__dirname, '..', 'server');

const marker = process.argv[2] || 'Sync Item Received';
const lineCount = process.argv[3] || '100';

console.log('='.repeat(60));
console.log('Railway Log Verification');
console.log('='.repeat(60));
console.log(`Searching for: ${marker}`);
console.log(`Log lines: ${lineCount}`);
console.log('');

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(`Command failed with code ${code}: ${stderr}`));
      }
    });

    proc.on('error', (err) => {
      reject(err);
    });
  });
}

async function checkRailwayCli() {
  try {
    await runCommand('which', ['railway']);
    return true;
  } catch {
    return false;
  }
}

async function fetchRailwayLogs() {
  console.log('Fetching Railway logs...');
  console.log('');

  try {
    const logs = await runCommand('railway', [
      'logs',
      '-n', lineCount,
      '--service', 'peek-node'
    ], { cwd: SERVER_DIR });

    return logs;
  } catch (error) {
    console.error('Failed to fetch Railway logs:', error.message);
    console.error('');
    console.error('Make sure you have Railway CLI installed and linked:');
    console.error('  1. Install: npm install -g @railway/cli');
    console.error('  2. Login: railway login');
    console.error('  3. Link: cd backend/server && railway link -p amusing-courtesy');
    console.error('');
    process.exit(1);
  }
}

async function main() {
  // Check Railway CLI is installed
  const hasRailway = await checkRailwayCli();
  if (!hasRailway) {
    console.error('Railway CLI not found.');
    console.error('');
    console.error('Install with: npm install -g @railway/cli');
    console.error('');
    process.exit(1);
  }

  // Fetch logs
  const logs = await fetchRailwayLogs();

  // Filter for marker
  const lines = logs.split('\n');
  const matchingLines = lines.filter(line =>
    line.includes(marker)
  );

  if (matchingLines.length === 0) {
    console.log(`No log entries found matching: ${marker}`);
    console.log('');
    console.log('This could mean:');
    console.log('  1. The test items haven\'t been synced yet');
    console.log('  2. The server hasn\'t been deployed with sync logging');
    console.log('  3. The logs have rotated past the search window');
    console.log('');
    console.log('Full logs (last 20 lines):');
    console.log('-'.repeat(60));
    console.log(lines.slice(-20).join('\n'));
    console.log('-'.repeat(60));
    process.exit(1);
  }

  console.log(`Found ${matchingLines.length} matching log entries:`);
  console.log('-'.repeat(60));

  // Group by sync blocks
  let inBlock = false;
  let currentBlock = [];

  for (const line of lines) {
    if (line.includes('=== Sync Item Received ===')) {
      inBlock = true;
      currentBlock = [line];
    } else if (line.includes('==========================')) {
      currentBlock.push(line);
      inBlock = false;

      // Check if this block matches our marker
      const blockText = currentBlock.join('\n');
      if (blockText.includes(marker)) {
        console.log(blockText);
        console.log('');
      }
      currentBlock = [];
    } else if (inBlock) {
      currentBlock.push(line);
    } else if (line.includes(marker)) {
      // Non-block match
      console.log(line);
    }
  }

  console.log('-'.repeat(60));
  console.log('');
  console.log(`Total matches: ${matchingLines.length}`);
  console.log('');
  console.log('='.repeat(60));
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
