import fs from 'fs';
import path from 'path';

function walk(dir) {
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      walk(fullPath);
    } else if (item.name.endsWith('.svelte.ts')) {
      const base = item.name.replace(/\.svelte\.ts$/, '');
      const wrapperName = `${base}.ts`;
      const wrapperPath = path.join(dir, wrapperName);
      const relImport = `./${item.name}`;
      const content = `// Auto-generated wrapper to aid Vite / TS resolution
export * from '${relImport}';
`;
      if (!fs.existsSync(wrapperPath)) {
        fs.writeFileSync(wrapperPath, content);
        console.log(`Created ${wrapperPath}`);
      } else {
        console.log(`Skipped (exists) ${wrapperPath}`);
      }
    }
  }
}

walk(path.resolve('src'));
