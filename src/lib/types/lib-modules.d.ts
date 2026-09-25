/**
 * @lib/types/lib-modules.d.ts — Ambient declarations for @lib/* imports
 * that TypeScript cannot resolve via path aliases alone.
 *
 * Resolution: Explicit tsconfig paths now map every @lib/*.svelte.ts
 * module to its real source file. This file is kept purely as a fallback
 * for any remaining @lib/* imports that don't yet have a path alias or
 * are imported via wildcards.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// --- Catch-all wildcards for @lib/* ---

declare module '@lib/stores/*.svelte' {
  const mod: any;
  export default mod;
}

declare module '@lib/*.svelte' {
  const mod: any;
  export default mod;
}

declare module '@lib/*/*.svelte' {
  const mod: any;
  export default mod;
}

declare module '@lib/*' {
  const mod: any;
  export default mod;
}
