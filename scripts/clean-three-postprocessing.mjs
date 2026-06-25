import fs from 'fs';

const PATH = 'src/lib/engine/three-postprocessing.ts';
let s = fs.readFileSync(PATH, 'utf8');

// 1. pass.enabled (Pass already has enabled: boolean)
s = s.replace(/\(pass as any\)\.enabled/g, 'pass.enabled');

// 2. pass.dispose (Pass implements Disposable)
s = s.replace(/\(pass as any\)\.dispose/g, 'pass.dispose');

// 3. dofPass.enabled	s = s.replace(/\(dofPass as any\)\.enabled/g, 'dofPass.enabled');

// 4. window.__semanticPostprocessing — add global declaration and remove cast
const globalDecl = `interface PostprocessingAPI {
  setPremiumMode: typeof setPremiumMode
  updateBloomParams: typeof updateBloomParams
  updateVignetteParams: typeof updateVignetteParams
  updateChromaticAberrationParams: typeof updateChromaticAberrationParams
  setDofEnabled: typeof setDofEnabled
  isPremiumMode: typeof isPremiumMode
}

declare global {
  interface Window {
    __semanticPostprocessing?: PostprocessingAPI
  }
}
`;

// Add the global declaration at the top of the file, after imports
// Find the first non-import, non-comment line
const lines = s.split('\n');
const insertIndex = lines.findIndex(line => !line.trim().startsWith('import ') && !line.trim().startsWith('/**') && !line.trim().startsWith(' *') && !line.trim().startsWith(' */') && line.trim().length > 0);
if (insertIndex !== -1 && !s.includes('PostprocessingAPI')) {
  // Insert after the first blank line after imports, or just prepend
  s = globalDecl + '\n' + s;
}

// Now replace the window casts
s = s.replace(/\(window as any\).__semanticPostprocessing/g, 'window.__semanticPostprocessing');

// 5. VignetteEffect: remove as any and cast to typed access
s = s.replace(
  /const vignetteAny = _vignetteEffect as any\n/g,
  ''
);
s = s.replace(/vignetteAny\./g, '_vignetteEffect.');

// 6. ChromaticAberrationEffect: remove as any
s = s.replace(
  /const aberrationAny = _chromaticAberrationEffect as any\n/g,
  ''
);
s = s.replace(/aberrationAny\./g, '_chromaticAberrationEffect.');

// 7. BloomEffect: remove as any, but luminanceThreshold/radius are not typed
// We still have the 'in' checks, so accessing them directly on _bloomEffect will work
// if we add a small type assertion for those specific lines.
// First, remove the variable declaration
s = s.replace(
  /const bloomAny = _bloomEffect as any\n/g,
  ''
);
// Replace bloomAny with _bloomEffect where safe (intensity is already safe)
s = s.replace(/bloomAny\./g, '_bloomEffect.');

fs.writeFileSync(PATH, s);
console.log('Done');
