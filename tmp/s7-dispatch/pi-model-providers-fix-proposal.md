# PI-MODEL-PROVIDERS FIX PROPOSAL

## Current Behavior

The current code at `C:/Users/HP/.pi/agent/local-packages/pi-model-providers/index.ts` lines 880-900 includes the following gate:

```ts
const activeKeys = route.status?.activeKeys;
if (activeKeys !== undefined && Number(activeKeys || 0) <= 0) return undefined;
if (activeKeys === undefined && Number(route.status?.keys || 0) <= 0) return undefined;
```

This gate early-returns `undefined` for routes where either:

1. `activeKeys` is defined and <= 0, or
2. `activeKeys` is undefined and `route.status?.keys` is <= 0

## Root Cause

As identified in Sprint-6's W2 ZYDIT-SYNC-INVESTIGATE worker, the `/zydit/v4` route is being dropped from the catalog because it reports 0 active keys. This is a momentary cooldown state, but the current gate prevents the route from appearing in the catalog.

## Candidate Fixes

### Option A: Drop the Gate Entirely

**Proposal:**

```diff
--- a/C:/Users/HP/.pi/agent/local-packages/pi-model-providers/index.ts
+++ b/C:/Users/HP/.pi/agent/local-packages/pi-model-providers/index.ts
@@ -880,6 +880,6 @@
 const activeKeys = route.status?.activeKeys;
-if (activeKeys !== undefined && Number(activeKeys || 0) <= 0) return undefined;
-if (activeKeys === undefined && Number(route.status?.keys || 0) <= 0) return undefined;
```

**Tradeoffs:**
- **Pros:** Simple to implement, ensures all routes are visible in the catalog.
- **Cons:** Includes routes that are momentarily unavailable, which may confuse users.

### Option B: Keep the Gate but Add a Trail of WARN Log

**Proposal:**

```diff
--- a/C:/Users/HP/.pi/agent/local-packages/pi-model-providers/index.ts
+++ b/C:/Users/HP/.pi/agent/local-packages/pi-model-providers/index.ts
@@ -880,6 +880,8 @@
 const activeKeys = route.status?.activeKeys;
 if (activeKeys !== undefined && Number(activeKeys || 0) <= 0) {
+  console.warn(`Dropping route ${route.baseUrl} due to 0 active keys`);
   return undefined;
 }
 if (activeKeys === undefined && Number(route.status?.keys || 0) <= 0) {
+  console.warn(`Dropping route ${route.baseUrl} due to 0 keys`);
   return undefined;
 }
```

**Tradeoffs:**
- **Pros:** Maintains the current behavior but provides visibility into why routes are being dropped.
- **Cons:** Still drops routes, which may not be ideal for users.

### Option C: Return Route with disabled:true Flag

**Proposal:**

```diff
--- a/C:/Users/HP/.pi/agent/local-packages/pi-model-providers/index.ts
+++ b/C:/Users/HP/.pi/agent/local-packages/pi-model-providers/index.ts
@@ -880,8 +880,10 @@
 const activeKeys = route.status?.activeKeys;
 if (activeKeys !== undefined && Number(activeKeys || 0) <= 0) {
-  return undefined;
+  return { ...route, disabled: true };
 }
 if (activeKeys === undefined && Number(route.status?.keys || 0) <= 0) {
-  return undefined;
+  return { ...route, disabled: true };
 }
```

**Tradeoffs:**
- **Pros:** Allows downstream handlers to decide whether to display or hide disabled routes.
- **Cons:** Requires downstream handlers to respect the `disabled` flag.

### Option D: Add a Coarse Bypass Allow-List

**Proposal:**

```diff
--- a/C:/Users/HP/.pi/agent/local-packages/pi-model-providers/index.ts
+++ b/C:/Users/HP/.pi/agent/local-packages/pi-model-providers/index.ts
@@ -880,6 +880,10 @@
 const activeKeys = route.status?.activeKeys;
+const bypassRoutes = new Set(['/zydit/v4']); // Add other known noisy-but-real routes here
+if (bypassRoutes.has(route.baseUrl)) {
+  return route;
+}
 if (activeKeys !== undefined && Number(activeKeys || 0) <= 0) return undefined;
 if (activeKeys === undefined && Number(route.status?.keys || 0) <= 0) return undefined;
```

**Tradeoffs:**
- **Pros:** Targeted solution for known problematic routes.
- **Cons:** Requires maintenance to keep the allow-list up-to-date.

## Preferred Fix

**Option C: Return Route with disabled:true Flag**

This option allows downstream handlers to decide whether to display or hide disabled routes, providing flexibility without dropping routes entirely. It also requires minimal changes to the existing code.

## Anti-Pattern Warnings

- **Do not drop the gate entirely** if downstream assumes it. Read the consumer code at line X+ to ensure compatibility.

## Impact Map

- **Routes with 0 active keys:** Will now appear in the catalog with a `disabled: true` flag.
- **Routes with active keys:** Will appear normally in the catalog.

## Verification Steps

1. Save a backup of the current `index.ts`.
2. Apply the patch via the `edit` tool.
3. Restart the Pi session.
4. Verify that `/zydit/v4` appears in the catalog endpoints.
5. Check that downstream handlers respect the `disabled` flag.

## Bonus: Package.json Check

The `package.json` file does not exist in the specified directory, so there is no need to regenerate it via `pi update`. The patch would survive a `pi update` as long as the file is not overwritten by the update process.