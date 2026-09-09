import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
dist_dir = os.path.join(ROOT, "dist", "svelte")

bundle_text = ""
bundle_files = []
for dirpath, _dirs, files in os.walk(dist_dir):
    for name in files:
        if name.endswith(".js"):
            p = os.path.join(dirpath, name)
            bundle_files.append(p)
            with open(p, encoding="utf-8") as f:
                bundle_text += f.read()

print(f"bundle files: {len(bundle_files)}")
for needle in [
    "sonic-note-state",
    "setRadioNoteState",
    "STATE_LABELS",
    "cycleNoteState",
    "startJamRadioAt",
    "best 95/S",
]:
    print(f"  {needle}: {'FOUND' if needle in bundle_text else 'MISSING'}")

# also verify index.html references resolve
index = os.path.join(dist_dir, "index.html")
if os.path.exists(index):
    with open(index, encoding="utf-8") as f:
        html = f.read()
    missing = []
    for tok in ['"', "'"]:
        pass
    import re

    refs = re.findall(r'(?:src|href)="([^"]+)"', html)
    for ref in refs:
        if ref.startswith("http") or ref.startswith("//"):
            continue
        path = ref.lstrip("/")
        full = os.path.join(dist_dir, path)
        if not os.path.exists(full):
            missing.append(ref)
    print(f"index.html refs: {len(refs)}, missing on disk: {len(missing)}")
    for m in missing:
        print("   MISSING:", m)
else:
    print("no index.html")
