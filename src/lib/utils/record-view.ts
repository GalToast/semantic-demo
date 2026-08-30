/**
 * record-view.ts — one auditable seam for string-keyed views over typed objects.
 *
 * TS interfaces carry no implicit index signatures, so generic-key indexing
 * (`obj[key]` where key: string) needs a Record view. Modules that diff or
 * patch state by key name previously scattered `as unknown as Record<string,
 * unknown>` casts at every site; they should import this helper instead so
 * the single unavoidable cast lives in exactly one greppable place.
 */
export function asRecord(obj: object): Record<string, unknown> {
    return obj as Record<string, unknown>
}
