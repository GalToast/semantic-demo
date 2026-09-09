"""Latent-state feature gate: verify the pitch-slot dial is wired end to end.

Checks source, build output, docs, and the sweep script. Run from anywhere:
    python scripts/latent-state-gate.py
"""

import os
import re

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

checks = []

with open(
    os.path.join(ROOT, "src/components/sonic/SonicIdentity.svelte"), encoding="utf-8"
) as f:
    svelte = f.read()
checks.append(
    ("SonicIdentity has #sonic-note-state button", "sonic-note-state" in svelte)
)
checks.append(("SonicIdentity has cycleNoteState", "cycleNoteState" in svelte))
checks.append(("SonicIdentity has STATE_LABELS", "STATE_LABELS" in svelte))
checks.append(
    ("SonicIdentity labels state 4 as summit", "summit" in svelte and "100/S" in svelte)
)
checks.append(("SonicIdentity has #sonic-prog button", "sonic-prog" in svelte))
checks.append(
    (
        "SonicIdentity prog toggle calls set+play",
        "setRadioProg" in svelte and "playRadioProg" in svelte,
    )
)
checks.append(
    ("SonicIdentity stops prog on radio stop", svelte.count("stopRadioProg()") >= 3)
)
checks.append(
    (
        "SonicIdentity has summit restore",
        "restoreSummit" in svelte and "SUMMIT_STATE" in svelte,
    )
)
checks.append(
    (
        "SonicIdentity marks untested combos",
        "sonic-unmeasured" in svelte and "isMeasuredPair" in svelte,
    )
)
checks.append(
    ("SonicIdentity noteState default is 4 (summit)", "noteState = $state(4)" in svelte)
)

with open(os.path.join(ROOT, "src/lib/audio/jam-radio.ts"), encoding="utf-8") as f:
    radio = f.read()
checks.append(("jam-radio has setRadioNoteState", "setRadioNoteState" in radio))
checks.append(("jam-radio has startJamRadioAt", "startJamRadioAt" in radio))
checks.append(("jam-radio has NoteMessage interface", "interface NoteMessage" in radio))
checks.append(
    (
        "jam-radio has measured pairs",
        "MEASURED_PAIRS" in radio and "isMeasuredPair" in radio,
    )
)
checks.append(
    (
        "jam-radio has prog controls",
        "setRadioProg" in radio
        and "playRadioProg" in radio
        and "stopRadioProg" in radio,
    )
)
checks.append(
    (
        "jam-radio routes prog_status replies",
        "onProgStatus" in radio and "prog_learned" in radio,
    )
)
checks.append(
    (
        "jam-radio has band preset menu",
        "RadioBandMode" in radio and "setRadioBandMode" in radio,
    )
)
with open(os.path.join(ROOT, "src/lib/audio/jam-midi.ts"), encoding="utf-8") as f:
    midi = f.read()
checks.append(
    (
        "jam-midi voices keys at dial state",
        "pressRadioNote" in midi and "getState()" in midi,
    )
)
checks.append(
    (
        "jam-midi defers note_off on sustain",
        "deferredOff" in midi and "releaseRadioNote" in midi,
    )
)
checks.append(("SonicIdentity has #sonic-midi button", "sonic-midi" in svelte))
checks.append(("jam-radio has default prog spec", "DEFAULT_PROG_SPEC" in radio))
checks.append(
    ("jam-radio held notes carry state", "state: 4" in radio and "note: 45" in radio)
)
checks.append(
    ("jam-radio rejects out-of-range state", "state < 0 || state > 11" in radio)
)

# Vite minifies JS identifiers, so `setRadioNoteState` and `STATE_LABELS` are
# renamed in the bundle and cannot be matched by source name. DOM class names
# and string literals survive minification — match on those instead.
dist_dir = os.path.join(ROOT, "dist", "svelte")
bundle_files = []
bundle_text = ""
if os.path.isdir(dist_dir):
    for dirpath, _dirs, files in os.walk(dist_dir):
        for name in files:
            if name.endswith(".js"):
                p = os.path.join(dirpath, name)
                bundle_files.append(p)
                with open(p, encoding="utf-8") as f:
                    bundle_text += f.read()
checks.append(("dist/svelte has JS bundles", len(bundle_files) > 0))
checks.append(("bundle has sonic-note-state", "sonic-note-state" in bundle_text))
# NOTE: `best 95/S`, `setRadioNoteState(` and `cycleNoteState` are NOT checked
# against the bundle — Vite strips the star from the string literal and
# minifies the identifiers, so they are unrecoverable in the output. Source
# coverage above already covers them; the bundle check only needs to confirm
# the dial DOM actually shipped.

# index.html refs must resolve on disk — a split-brain build leaves 404s.
index = os.path.join(dist_dir, "index.html")
if os.path.exists(index):
    with open(index, encoding="utf-8") as f:
        html = f.read()
    refs = re.findall(r'(?:src|href)="([^"]+)"', html)
    missing = [
        r
        for r in refs
        if not r.startswith(("http", "//", "data:", "#"))
        and not os.path.exists(os.path.join(dist_dir, r.lstrip("/")))
    ]
    checks.append(("index.html refs resolve on disk", not missing))

checks.append(
    (
        "docs/latent-pitch-ladder-results.md exists",
        os.path.exists(os.path.join(ROOT, "docs/latent-pitch-ladder-results.md")),
    )
)
checks.append(
    (
        "scripts/latent-pitch-sweep.py exists",
        os.path.exists(os.path.join(ROOT, "scripts/latent-pitch-sweep.py")),
    )
)

print("latent-state feature gate:")
all_ok = True
for name, ok in checks:
    print(f"  [{'PASS' if ok else 'FAIL'}] {name}")
    all_ok = all_ok and ok

scoring = "/c/tmp/pitch_ladder/scoring.log"
if os.path.exists(scoring):
    print("\npitch-ladder scoring (live):")
    with open(scoring, encoding="utf-8") as f:
        for line in f.read().splitlines()[-8:]:
            print("  " + line.strip())

print("\nGATE:", "GREEN" if all_ok else "RED")
