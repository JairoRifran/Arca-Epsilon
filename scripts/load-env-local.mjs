import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export async function loadEnvLocal(projectRoot, allowedKeys) {
  let source;
  try {
    source = await readFile(join(projectRoot, '.env.local'), 'utf8');
  } catch {
    return false;
  }

  const allowed = new Set(allowedKeys);
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf('=');
    if (separator <= 0) continue;
    const key = line.slice(0, separator).trim();
    if (!allowed.has(key)) continue;
    let value = line.slice(separator + 1).trim();
    if (
      value.length >= 2 &&
      ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'")))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
  return true;
}

