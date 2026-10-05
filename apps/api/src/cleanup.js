import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { db } from './server.js';
import { storageDirectory } from './server.js';

const expired = db.prepare('SELECT id, object_key, request_id FROM request_attachments WHERE deleted_at IS NULL AND expires_at <= ?').all(new Date().toISOString());
for (const attachment of expired) {
  const filePath = resolve(storageDirectory, attachment.object_key);
  if (filePath.startsWith(resolve(storageDirectory)) && existsSync(filePath)) rmSync(filePath, { force: true });
  db.prepare('UPDATE request_attachments SET deleted_at = ? WHERE id = ?').run(new Date().toISOString(), attachment.id);
}
console.log(JSON.stringify({ event: 'attachment.cleanup.complete', removed: expired.length }));
