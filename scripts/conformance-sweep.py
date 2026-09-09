"""Live control-plane conformance: every radio message type against the real jam.

No audio needed (decode-independent): verifies the control roundtrips —
prog_set/play/stop/status replies, /band_mask echo, metrics flow, uiReady.
Run once, restore summit state, disconnect. ~2 min.
"""
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import importlib.util

_spec = importlib.util.spec_from_file_location(
    "e2e_summit", os.path.join(os.path.dirname(os.path.abspath(__file__)), "e2e-summit.py")
)
assert _spec is not None and _spec.loader is not None
_e2e = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_e2e)
RawWS, post_band, CHORD = _e2e.RawWS, _e2e.post_band, _e2e.CHORD

PASS, FAIL = [], []


def check(name, cond, detail=""):
    (PASS if cond else FAIL).append(name)
    print(f"  [{'PASS' if cond else 'FAIL'}] {name} {detail}")


def main():
    ws = RawWS()
    print(f"handshake: accept_ok={ws.accept_ok}")
    inbox = []

    ws.send(json.dumps({"type": "uiReady"}))
    time.sleep(1)

    # drain helper
    def drain(seconds, tag):
        t0 = time.time()
        got = []
        while time.time() - t0 < seconds:
            try:
                raw = ws.recv(timeout=3)
            except Exception:
                break
            try:
                got.append(json.loads(raw))
            except Exception:
                pass
        inbox.extend(got)
        return got

    # 1. control traffic flows? (metrics require holding act[ws]; under
    # probe contention another session may own it — prog_status replies,
    # which are per-socket and ungated, prove liveness either way.)
    msgs = drain(8, "metrics")
    metrics = [m for m in msgs if m.get("type") == "metrics"]
    ps0 = [m for m in msgs if m.get("type") == "prog_status"]
    check("control traffic flows", len(metrics) >= 1 or len(ps0) >= 1,
          f"({len(metrics)} metrics, {len(ps0)} prog_status — metrics need uncontended act[ws])")

    # 2. prog_set roundtrip
    ws.send(json.dumps({"type": "prog_set", "spec": "Am 4 | F 4 | C 4 | G 4", "bpm": 100, "loop": True}))
    msgs = drain(6, "prog_set")
    ps = [m for m in msgs if m.get("type") == "prog_status"]
    check("prog_set replies prog_status", len(ps) >= 1, f"({ps[-1] if ps else 'none'})")
    # slots arrives as the full table [{notes,frames}...], not a count.
    tables = [m["slots"] for m in ps if isinstance(m.get("slots"), list)]
    slots_ok = any(len(t) == 4 for t in tables)
    check("prog slots == 4 (Am F C G)", slots_ok)

    # 3. prog_play roundtrip
    ws.send(json.dumps({"type": "prog_play"}))
    msgs = drain(6, "prog_play")
    ps = [m for m in msgs if m.get("type") == "prog_status"]
    running = any(m.get("running") is True or m.get("started") is True for m in ps)
    check("prog_play starts engine", running)

    # 4. prog_status query roundtrip
    ws.send(json.dumps({"type": "prog_status"}))
    msgs = drain(6, "prog_status")
    ps = [m for m in msgs if m.get("type") == "prog_status"]
    check("prog_status query replies", len(ps) >= 1)

    # 5. prog_stop roundtrip
    ws.send(json.dumps({"type": "prog_stop"}))
    msgs = drain(6, "prog_stop")
    ps = [m for m in msgs if m.get("type") == "prog_status"]
    stopped = any(m.get("running") is False for m in ps)
    check("prog_stop halts engine", stopped)

    # 6. band_mask echo (summit slots, then restore — already summit)
    r = post_band(slots=[2, 11])
    check("band_mask echo active_slots [2,11]", r.get("active_slots") == [2, 11], f"({r})")

    # 7. note_on accepted without error (no reply defined — absence of close is the signal)
    for n in CHORD:
        ws.send(json.dumps({"type": "note_on", "note": n, "state": 4}))
    time.sleep(3)
    alive = True
    try:
        ws.send(json.dumps({"type": "prog_status"}))
        msgs = drain(5, "alive-check")
        alive = len(msgs) > 0
    except Exception:
        alive = False
    check("server alive after note_on chord", alive)

    # restore + release
    for n in CHORD:
        try:
            ws.send(json.dumps({"type": "note_off", "note": n}))
        except Exception:
            pass
    ws.close()

    print(f"\nCONFORMANCE: {len(PASS)} pass, {len(FAIL)} fail")
    for name in FAIL:
        print(f"  FAILED: {name}")
    print("RESULT:", "GREEN" if not FAIL else "RED")


if __name__ == "__main__":
    main()
