# three-engine-frame-updates contract — drift verdict (2026-08-24)

VERDICT: INTENTIONAL re-tune (all 3 assertions) — contract baselines were stale;
source values carry dated in-code rationale.

| Assertion | Was | Now | Why |
|---|---|---|---|
| fog density @p=1 | 0.0028 | 0.0034 | W60 (2026-08-19) re-tune; served via SCENE_ATMOSPHERE.fogDensity in node-manager.ts:61, consumed as PORT_SCENE_ATMOSPHERE alias after wave-9b 33820e4d |
| spore opacity no-focus | 0.078 (base 0.65) | 0.0696 (base 0.58) | focus-hero restraint wave 2026-08-08; SCENE_ATMOSPHERE.sporeOpacity 0.65->0.58 (long in-code rationale at three-engine-frame-updates.ts:386-402) |
| points opacity no-focus | 0.32 | 0.2496 | SCENE_ATMOSPHERE.pointOpacityScale 0.78 multiplier added (node-manager.ts:68); focused case 0.1472 -> 0.114816 |

All values re-derived from source formulas and verified by rerun: 11/11 green.
Journey-webgl-lazy contract handled separately (6322a6a3, task-186 dynamic import intent).
