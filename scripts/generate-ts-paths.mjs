import fs from 'fs';
import path from 'path';

const libRoot = 'src/lib';
const entries = {};

function walk(dir, prefix) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      walk(path.join(dir, item.name), prefix ? `${prefix}/${item.name}` : item.name);
    } else if (item.name.endsWith('.svelte.ts')) {
      const base = item.name.replace(/\.svelte\.ts$/, '');
      const importPath = prefix ? `@lib/${prefix}/${base}` : `@lib/${base}`;
      const tsPath = `./${path.join(libRoot, prefix, item.name).replace(/\\/g, '/')}`;
      entries[importPath] = [tsPath];
    }
  }
}

walk(libRoot, '');

console.log(JSON.stringify(entries, null, 2));
