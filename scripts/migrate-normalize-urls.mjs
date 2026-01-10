/**
 * Migration script to normalize URLs and merge duplicate addresses
 * Run with: node scripts/migrate-normalize-urls.mjs
 */

import sqlite3 from 'sqlite3';
import path from 'path';
import os from 'os';

const dbPath = process.argv[2] || path.join(
  os.homedir(),
  'Library/Application Support/Peek/dev/datastore.sqlite'
);

console.log('Opening database:', dbPath);

// Normalize URL helper
const normalizeUrl = (uri) => {
  try {
    const url = new URL(uri);
    if (!url.pathname || url.pathname === '') {
      url.pathname = '/';
    }
    return url.toString();
  } catch (e) {
    return uri;
  }
};

const run = () => new Promise((resolve, reject) => {
  const db = new sqlite3.Database(dbPath);

  db.get('SELECT store FROM tinybase', (err, row) => {
    if (err) {
      reject(err);
      return;
    }

    const data = JSON.parse(row.store)[0];

    console.log('\n=== Before Migration ===');
    console.log('Addresses:', Object.keys(data.addresses).length);
    console.log('Visits:', Object.keys(data.visits).length);
    console.log('Address tags:', Object.keys(data.address_tags || {}).length);

    // Find duplicates (same normalized URL)
    const normalizedMap = new Map();
    for (const [id, addr] of Object.entries(data.addresses)) {
      const normalized = normalizeUrl(addr.uri);
      if (!normalizedMap.has(normalized)) {
        normalizedMap.set(normalized, []);
      }
      normalizedMap.get(normalized).push({ id, ...addr });
    }

    // Find entries with duplicates
    const duplicates = [...normalizedMap.entries()].filter(([, addrs]) => addrs.length > 1);
    console.log('\nDuplicates found:', duplicates.length);

    for (const [normalizedUri, addrs] of duplicates) {
      console.log(`\nDuplicate: ${normalizedUri}`);
      addrs.forEach(a => console.log(`  - ${a.id}: ${a.uri} (${a.visitCount} visits)`));

      // Check which one has tags
      const addressTags = data.address_tags || {};
      const withTags = addrs.filter(a =>
        Object.values(addressTags).some(link => link.addressId === a.id)
      );

      // Keep: prefer one with tags, then one already normalized, then most visits
      const sorted = addrs.sort((a, b) => {
        const aHasTags = withTags.some(t => t.id === a.id);
        const bHasTags = withTags.some(t => t.id === b.id);
        if (aHasTags && !bHasTags) return -1;
        if (bHasTags && !aHasTags) return 1;
        if (a.uri === normalizedUri && b.uri !== normalizedUri) return -1;
        if (b.uri === normalizedUri && a.uri !== normalizedUri) return 1;
        return (b.visitCount || 0) - (a.visitCount || 0);
      });

      const keep = sorted[0];
      const remove = sorted.slice(1);

      console.log(`  Keeping: ${keep.id} (${keep.uri})`);
      console.log(`  Removing: ${remove.map(r => r.id).join(', ')}`);

      let totalVisits = keep.visitCount || 0;
      let latestVisit = keep.lastVisitAt || 0;

      for (const r of remove) {
        totalVisits += r.visitCount || 0;
        latestVisit = Math.max(latestVisit, r.lastVisitAt || 0);

        // Update visits to point to kept address
        for (const [visitId, visit] of Object.entries(data.visits)) {
          if (visit.addressId === r.id) {
            console.log(`  Updating visit ${visitId} -> ${keep.id}`);
            data.visits[visitId].addressId = keep.id;
          }
        }

        // Update address_tags
        for (const [linkId, link] of Object.entries(data.address_tags || {})) {
          if (link.addressId === r.id) {
            const alreadyHasTag = Object.values(data.address_tags).some(
              l => l.addressId === keep.id && l.tagId === link.tagId
            );
            if (alreadyHasTag) {
              console.log(`  Removing duplicate tag link ${linkId}`);
              delete data.address_tags[linkId];
            } else {
              console.log(`  Updating tag link ${linkId} -> ${keep.id}`);
              data.address_tags[linkId].addressId = keep.id;
            }
          }
        }

        delete data.addresses[r.id];
      }

      data.addresses[keep.id].uri = normalizedUri;
      data.addresses[keep.id].visitCount = totalVisits;
      data.addresses[keep.id].lastVisitAt = latestVisit;
      data.addresses[keep.id].updatedAt = Date.now();

      console.log(`  Merged: ${totalVisits} total visits`);
    }

    // Normalize remaining URIs
    let normalizedCount = 0;
    for (const [id, addr] of Object.entries(data.addresses)) {
      const normalized = normalizeUrl(addr.uri);
      if (addr.uri !== normalized) {
        console.log(`\nNormalizing: ${addr.uri} -> ${normalized}`);
        data.addresses[id].uri = normalized;
        normalizedCount++;
      }
    }

    console.log('\n=== After Migration ===');
    console.log('Addresses:', Object.keys(data.addresses).length);
    console.log('Visits:', Object.keys(data.visits).length);
    console.log('Normalized:', normalizedCount);

    // Write back
    const newJson = JSON.stringify([data, {}]);
    db.run('UPDATE tinybase SET store = ?', [newJson], (err) => {
      if (err) {
        reject(err);
        return;
      }
      console.log('\nMigration complete!');
      db.close();
      resolve();
    });
  });
});

run().catch(console.error);
