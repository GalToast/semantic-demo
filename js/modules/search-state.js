export * from './search-state.ts';
export * from '../../src/lib/search-engine.ts';
export async function search(query, options = {}) {
  const mod = await import('../../src/lib/search-engine.ts');
  if (typeof mod.searchBusinesses === 'function') return mod.searchBusinesses(query, options);
  return [];
}
export function clearSearch() {}
