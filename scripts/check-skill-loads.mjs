import os from 'node:os';
import path from 'node:path';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const LOADER_PATH = 'file:///C:/Users/HP/AppData/Roaming/npm/node_modules/@earendil-works/pi-coding-agent/dist/core/skills.js';
const REPO_ROOT = process.cwd();

function resolveLoadSkills() {
  try {
    const url = new URL(LOADER_PATH);
    const loaderFsPath = fileURLToPath(url);
    // Basic sanity: the module should exist as a file we can import.
    if (!existsSync(loaderFsPath)) {
      throw new Error(`Loader path not found: ${loaderFsPath}`);
    }
    return import(url);
  } catch (error) {
    const hint = error.code === 'ERR_MODULE_NOT_FOUND' || error.message.includes('Loader path not found')
      ? `\n  Fix: update LOADER_PATH in this script to the installed pi dist/core/skills.js path.`
      : '';
    console.error(`Failed to load skill loader from:\n  ${LOADER_PATH}${hint}`);
    console.error(`Reason: ${error.message}`);
    process.exit(101);
  }
}

function listSkillDirectories(dir) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function countSks(dir) {
  if (!existsSync(dir)) return 0;
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name === 'SKILL.md') count++;
  }
  return count;
}

async function main() {
  const { loadSkills } = await resolveLoadSkills();

  const skillPaths = [
    path.join(os.homedir(), '.pi', 'agent', 'skills'),
    path.join(os.homedir(), '.pi', 'agent', 'pi-hermes-memory', 'skills'),
    path.join(os.homedir(), '.pi', 'agent', 'projects-memory', 'semantic-explorer', 'skills'),
  ];

  const result = loadSkills({
    cwd: REPO_ROOT,
    skillPaths,
    includeDefaults: true,
  });

  const onDisk = new Map();
  for (const dir of skillPaths) {
    if (!existsSync(dir)) continue;
    const subdirs = listSkillDirectories(dir);
    for (const name of subdirs) {
      const skDir = path.join(dir, name);
      const hasSkillMd = existsSync(path.join(skDir, 'SKILL.md'));
      if (!hasSkillMd) continue;
      onDisk.set(name, (onDisk.get(name) ?? []).concat(dir));
    }
  }

  const loadedPaths = new Set(result.skills.map((skill) => skill.filePath));
  const missingFromLoad = [];
  for (const [name, paths] of onDisk.entries()) {
    for (const dir of paths) {
      const skillPath = path.join(dir, name, 'SKILL.md');
      if (!loadedPaths.has(skillPath)) {
        missingFromLoad.push({ name, dir, skillPath });
        break;
      }
    }
  }

  const cleanedDiagnostics = [];
  for (const diag of result.diagnostics) {
    const lines = (diag.message ?? '').split('\n').filter((line) => line.trim().length > 0);
    const firstLine = lines[0] ?? '';
    // Keep representation short to humane-ness while preserving helpful content.
    const message = lines.length > 3 ? lines.slice(0, 3).join('\n') + '...' : firstLine;
    cleanedDiagnostics.push({ type: diag.type, message, path: diag.path });
  }

  const missingCount = missingFromLoad.length;
  const diagCount = cleanedDiagnostics.length;

  console.log(`skills loaded: ${result.skills.length}`);

  if (missingCount > 0) {
    console.log('\nON DISK BUT NOT LOADED');
    for (const item of missingFromLoad) {
      console.log(`  [missing] ${item.name}\tfrom ${item.dir}`);
      console.log(`    candidate path: ${item.skillPath}`);
    }
  }

  for (const item of cleanedDiagnostics) {
    console.log(`\nDIAGNOSTIC ${item.type} in ${item.path}`);
    console.log(`  ${item.message}`);
  }

  process.exit(missingCount === 0 && diagCount === 0 ? 0 : 1);

  process.exit(1);
}

main().catch((error) => {
  console.error(`Unexpected check failure: ${error.message}`);
  process.exit(102);
});
