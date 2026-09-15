#!/usr/bin/env node
// Non-destructive setup script for Hearth PocketBase collections.
// This creates ONLY the 3 Hearth collections ('hearth_settings', 'hearth_items', 'hearth_events')
// without modifying or deleting ANY existing collections or data in your PocketBase instance.

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const schemaPath = path.resolve(__dirname, '../pocketbase/pb_schema.json');

async function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}

async function authenticateAdmin(baseUrl, email, password) {
  // PocketBase v0.23+ uses _superusers collection; older versions use /api/admins
  const endpoints = [
    '/api/collections/_superusers/auth-with-password',
    '/api/admins/auth-with-password'
  ];

  for (const ep of endpoints) {
    try {
      const res = await fetch(baseUrl + ep, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identity: email, password })
      });
      if (res.ok) {
        const data = await res.json();
        return data.token;
      }
    } catch {}
  }
  throw new Error(`Could not authenticate with PocketBase at ${baseUrl}. Check your URL, email, and password.`);
}

async function main() {
  console.log('\n--- Hearth PocketBase Safe Setup ---');
  console.log('This script safely adds Hearth collections without touching any of your other PocketBase data.\n');

  let [,, urlArg, emailArg, passArg] = process.argv;

  let url = urlArg || await prompt('PocketBase Server URL (e.g. http://localhost:8090): ');
  if (!url) url = 'http://localhost:8090';
  url = url.replace(/\/+$/, '');

  let email = emailArg || await prompt('Admin / Superuser Email: ');
  let pass = passArg || await prompt('Admin / Superuser Password: ');

  if (!email || !pass) {
    console.error('Error: Admin email and password are required.');
    process.exit(1);
  }

  console.log(`\nConnecting to ${url}...`);
  const adminToken = await authenticateAdmin(url, email, pass);
  console.log('✓ Successfully authenticated as admin.\n');

  // Fetch current collections
  const collectionsRes = await fetch(`${url}/api/collections?perPage=200`, {
    headers: { 'Authorization': adminToken }
  });
  if (!collectionsRes.ok) {
    throw new Error('Failed to retrieve existing collections: ' + collectionsRes.statusText);
  }
  const existingData = await collectionsRes.json();
  const existingCollections = (existingData.items || []).map(c => c.name);

  console.log('Existing collections in your PocketBase instance:');
  console.log(' ', existingCollections.join(', ') || '(none)');
  console.log('These collections will remain 100% untouched.\n');

  // Load Hearth schema
  const hearthSchema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

  for (const col of hearthSchema) {
    if (existingCollections.includes(col.name)) {
      console.log(`[✓] Collection "${col.name}" already exists. (Skipped to preserve existing data)`);
      continue;
    }

    console.log(`[+] Creating collection "${col.name}"...`);
    const payload = {
      name: col.name,
      type: col.type || 'base',
      schema: col.schema || [],
      indexes: col.indexes || [],
      listRule: col.listRule,
      viewRule: col.viewRule,
      createRule: col.createRule,
      updateRule: col.updateRule,
      deleteRule: col.deleteRule,
      options: col.options || {}
    };

    const createRes = await fetch(`${url}/api/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': adminToken
      },
      body: JSON.stringify(payload)
    });

    if (!createRes.ok) {
      const err = await createRes.json().catch(() => ({}));
      console.error(`[-] Failed to create collection "${col.name}":`, err.message || createRes.statusText);
    } else {
      console.log(`[✓] Created "${col.name}" successfully.`);
    }
  }

  console.log('\n--- Setup Complete! ---');
  console.log('Your existing collections were not modified or deleted.');
  console.log('You can now log into Hearth using your PocketBase user account!\n');
}

main().catch(err => {
  console.error('\nSetup error:', err.message);
  process.exit(1);
});

