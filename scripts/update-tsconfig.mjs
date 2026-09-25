import fs from 'fs';
import path from 'path';

const explicitPaths = {};

function walk(dir, prefix) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.isDirectory()) {
      walk(path.join(dir, item.name), prefix ? `${prefix}/${item.name}` : item.name);
    } else if (item.name.endsWith('.svelte.ts')) {
      const base = item.name.replace(/\.svelte\.ts$/, '');
      const importPath = prefix ? `@lib/${prefix}/${base}` : `@lib/${base}`;
      const tsPath = `./${path.join('src/lib', prefix, item.name).replace(/\\/g, '/')}`;
      explicitPaths[importPath] = [tsPath];
    }
  }
}

walk('src/lib', '');

function updateTsconfig(filePath, baseDir, stripBase) {
  const raw = fs.readFileSync(filePath, 'utf-8');
  const config = JSON.parse(raw);

  const existing = config.compilerOptions?.paths || {};
  const paths = {};

  // Preserve existing non-overlapping entries
  for (const [k, v] of Object.entries(existing)) {
    paths[k] = v;
  }

  // Add explicit .svelte.ts entries
  for (const [k, v] of Object.entries(explicitPaths)) {
    if (stripBase) {
      // For src/tsconfig.json, paths are relative to src/
      const rel = v[0].replace(/^\.\/src\//, './');
      paths[k] = [rel];
    } else {
      paths[k] = v;
    }
  }

  config.compilerOptions = config.compilerOptions || {};
  config.compilerOptions.paths = paths;

  fs.writeFileSync(filePath, JSON.stringify(config, null, 2) + '\n');
  console.log(`Updated ${filePath}`);
}

updateTsconfig('tsconfig.json', 'src/lib', false);
updateTsconfig('src/tsconfig.json', 'src/lib', true);
