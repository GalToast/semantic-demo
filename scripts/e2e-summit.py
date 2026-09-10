"""e2e-summit.py — end-to-end summit confirmation through the LIVE jam.

Drives the exact radio path: WS to 8083, note_on with pitch-slot state,
/band_mask preset via HTTP, records streamed PCM, writes wav, ear_v10 scores.

Runs:
  summit:   band slots [2,11] (whine-clean summit), state=4 (cond 11) — expect ~100/S
  baseline: band=all (default),   state=1 (cond 8)  — expect ~50s

Usage:
    python scripts/e2e-summit.py [--seconds 45] [--out /c/tmp/radio_e2e/]
"""

import argparse
import base64
import contextlib
import json
import os
import sys
import time
import wave

import numpy as np

with contextlib.suppress(ImportError):
    import websocket  # noqa: F401  (kept for reference; live path uses RawWS below)

JAM_HTTP = os.environ.get("JAM_HTTP_URL", "http://127.0.0.1:8083")
JAM_WS = os.environ.get("JAM_WS_URL", "ws://127.0.0.1:8083/")
CHORD = [45, 52, 57, 64, 71]
RATE = 48000


def post_band(preset=None, slots=None):
    """POST /band_mask over a raw socket (the jam's HTTP server is a minimal
    raw-socket implementation — urllib's framing gets its connection reset)."""
    import socket as _socket

    body = {}
    if preset:
        body["preset"] = preset
    if slots is not None:
        body["slots"] = slots
    payload = json.dumps(body).encode()
    req = (
        b"POST /band_mask HTTP/1.1\r\n"
        b"Host: 127.0.0.1:8083\r\n"
        b"Content-Type: application/json\r\n"
        b"Content-Length: " + str(len(payload)).encode() + b"\r\n"
        b"Connection: close\r\n\r\n" + payload
    )
    s = _socket.create_connection(("127.0.0.1", 8083), timeout=15)
    try:
        s.sendall(req)
        resp = b""
        while True:
            chunk = s.recv(4096)
            if not chunk:
                break
            resp += chunk
    finally:
        s.close()
    text = resp.decode("utf-8", "replace")
    body_text = text.split("\r\n\r\n", 1)[1] if "\r\n\r\n" in text else text
    return json.loads(body_text)


class RawWS:
    """Minimal RFC6455 client that does NOT require Sec-WebSocket-Accept.

    jam_server.py replies 101 without the Accept header, which strict
    clients (browsers, websocket-client) reject. The handshake below sends
    a valid upgrade request and accepts any 101, then speaks masked text
    frames (client->server) and parses unmasked text/binary frames
    (server->client). Good enough for the jam's JSON protocol.
    """

    GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"

    def __init__(self, host="127.0.0.1", port=8083, path="/", timeout=10):
        import hashlib
        import os
        import socket as _socket

        self.sock = _socket.create_connection((host, port), timeout=timeout)
        self.sock.settimeout(timeout)
        self.key = base64.b64encode(os.urandom(16)).decode()
        req = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {self.key}\r\n"
            "Sec-WebSocket-Version: 13\r\n\r\n"
        )
        self.sock.sendall(req.encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise RuntimeError("handshake: connection closed")
            resp += chunk
        status = resp.split(b"\r\n", 1)[0]
        if b"101" not in status:
            raise RuntimeError(f"handshake rejected: {status!r}")
        self._buf = resp.split(b"\r\n\r\n", 1)[1]
        self._expected_accept = base64.b64encode(
            hashlib.sha1((self.key + self.GUID).encode()).digest()
        ).decode()
        self.accept_ok = self._expected_accept.encode() in resp

    def send(self, text):
        import os
        import struct as _struct

        data = text.encode() if isinstance(text, str) else text
        mask = os.urandom(4)
        hdr = bytes([0x81, 0x80 | len(data)]) if len(data) < 126 else None
        if hdr is None:
            hdr = bytes([0x81, 0x80 | 126]) + _struct.pack(">H", len(data))
        masked = bytes(c ^ mask[i % 4] for i, c in enumerate(data))
        self.sock.sendall(hdr + mask + masked)

    def _fill(self, n):
        while len(self._buf) < n:
            chunk = self.sock.recv(1 << 16)
            if not chunk:
                raise ConnectionError("closed")
            self._buf += chunk

    def recv(self, timeout=30):
        import struct as _struct

        self.sock.settimeout(timeout)
        self._fill(2)
        b1, b2 = self._buf[0], self._buf[1]
        self._buf = self._buf[2:]
        opcode = b1 & 0x0F
        length = b2 & 0x7F
        ext = None
        if length == 126:
            self._fill(2)
            (length,) = _struct.unpack(">H", self._buf[:2])
            self._buf = self._buf[2:]
            ext = 126
        elif length == 127:
            self._fill(8)
            (length,) = _struct.unpack(">Q", self._buf[:8])
            self._buf = self._buf[8:]
            ext = 127
        self.last_frame = (opcode, length, ext)
        if b2 & 0x80:
            self._fill(4)
            mask = self._buf[:4]
            self._buf = self._buf[4:]
        else:
            mask = None
        self._fill(length)
        payload = self._buf[:length]
        self._buf = self._buf[length:]
        if mask:
            payload = bytes(c ^ mask[i % 4] for i, c in enumerate(payload))
        if opcode == 0x8:
            raise ConnectionError("server close frame")
        return payload.decode()

    def close(self):
        with contextlib.suppress(Exception):
            self.sock.sendall(bytes([0x88, 0x00]))
        with contextlib.suppress(Exception):
            self.sock.close()


def record_run(state, seconds, out_wav):
    """Hold the chord at `state`, record streamed PCM for `seconds`.

    The jam server acquires its measurement lease when the WebSocket upgrade
    succeeds. Do not reserve it with a separate HTTP request: that request
    uses a different ephemeral peer port and would make the following WS
    upgrade look like a competing client.
    """
    ws = None
    try:
        ws = RawWS()
        if not ws.accept_ok:
            print("  note: server omitted Sec-WebSocket-Accept (known interop gap)")
        ws.send(json.dumps({"type": "uiReady"}))
        for n in CHORD:
            ws.send(json.dumps({"type": "note_on", "note": n, "state": state}))
        # The pump only streams audio frames once the prog engine is playing
        # (jam-radio.ts: prog_play -> engine presses notes -> audio chunks).
        # Without this the e2e receives metrics but zero audio frames
        # (measured: 79 metrics, 0 audio -> "no audio frames received").
        ws.send(
            json.dumps(
                {
                    "type": "prog_set",
                    "spec": "Am 4 | F 4 | C 4 | G 4",
                    "bpm": 100,
                    "loop": True,
                }
            )
        )
        ws.send(json.dumps({"type": "prog_play"}))
        chunks = []
        seen = {}
        shapes = {}
        deadline = time.time() + seconds
        while time.time() < deadline:
            try:
                raw = ws.recv(timeout=5)
            except ConnectionError:
                break
            except Exception:
                continue
            shapes[ws.last_frame] = shapes.get(ws.last_frame, 0) + 1
            with contextlib.suppress(Exception):
                msg = json.loads(raw)
                seen[msg.get("type", "?")] = seen.get(msg.get("type", "?"), 0) + 1
                if msg.get("type") == "audio" and isinstance(msg.get("data"), str):
                    pcm = base64.b64decode(msg["data"])
                    i16 = (
                        np.frombuffer(pcm, dtype=np.int16).astype(np.float32) / 32768.0
                    )
                    chunks.append(i16)
        for n in CHORD:
            with contextlib.suppress(Exception):
                ws.send(json.dumps({"type": "note_off", "note": n}))
        with contextlib.suppress(Exception):
            ws.send(json.dumps({"type": "prog_stop"}))
        print(f"  frames seen: {seen}")
        print(f"  frame shapes (opcode, len, ext): {shapes}")

        if not chunks:
            raise RuntimeError("no audio frames received")
        audio = np.concatenate(chunks)
        stereo = (
            audio.reshape(-1, 2) if audio.size % 2 == 0 else audio[:-1].reshape(-1, 2)
        )
        wav16 = np.clip(stereo, -1, 1) * 16384.0
        with wave.open(out_wav, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(RATE)
            w.writeframes(wav16.astype("<i2").tobytes())
        secs = len(stereo) / RATE
        print(f"  recorded {secs:.1f}s -> {out_wav}")
        return out_wav
    finally:
        if ws is not None:
            with contextlib.suppress(Exception):
                ws.close()


def ear_score(wav):
    import subprocess

    base = r"C:\Users\HP\Desktop\Temp while my comp is at the shop\mrt2\tmp"
    r = subprocess.run(
        [sys.executable, os.path.join(base, "ear_v10.py"), wav],
        cwd=base,
        capture_output=True,
        text=True,
        timeout=300,
    )
    try:
        d = json.loads(r.stdout)
    except Exception:
        print("  ear stdout:", (r.stdout or "")[-500:])
        print("  ear stderr:", (r.stderr or "")[-500:])
        raise
    v7 = d.get("v7_core", {})
    # ear_v10.py emits overall_v10 (fused connoisseur verdict) and music_like,
    # NOT a bare "v10"/"score" key — d.get("v10", d.get("score")) silently
    # resolved to null for every run, which is why e2e reported v10:null
    # while the scorer was actually producing a real verdict.
    return {
        "v10": d.get("overall_v10", d.get("music_like")),
        "v7": v7.get("score", v7),
        "raw": d,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--seconds", type=int, default=45)
    ap.add_argument("--out", default="/c/tmp/radio_e2e")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    results = {}

    print("=== summit: band slots [2,11], state=4 ===", flush=True)
    print(" ", post_band(slots=[2, 11]), flush=True)
    wav = os.path.join(args.out, "summit_state4_slots2_11.wav")
    record_run(4, args.seconds, wav)
    s = ear_score(wav)
    print(
        f"  summit score: {json.dumps({k: v for k, v in s.items() if k != 'raw'})}",
        flush=True,
    )
    results["summit"] = {
        "band": "slots [2,11]",
        "state": 4,
        "wav": wav,
        "score": {k: v for k, v in s.items() if k != "raw"},
    }

    print("=== baseline: band=all, state=1 ===", flush=True)
    print(" ", post_band(preset="all"), flush=True)
    wav = os.path.join(args.out, "baseline_state1_all.wav")
    record_run(1, args.seconds, wav)
    s = ear_score(wav)
    print(
        f"  baseline score: {json.dumps({k: v for k, v in s.items() if k != 'raw'})}",
        flush=True,
    )
    results["baseline"] = {
        "band": "all",
        "state": 1,
        "wav": wav,
        "score": {k: v for k, v in s.items() if k != "raw"},
    }

    # leave the server in the summit configuration for the radio default
    print(" restoring summit band for the radio default", flush=True)
    print(" ", post_band(slots=[2, 11]), flush=True)

    with open(os.path.join(args.out, "e2e_results.json"), "w") as f:
        json.dump(results, f, indent=2)
    print("wrote", os.path.join(args.out, "e2e_results.json"))


if __name__ == "__main__":
    main()
