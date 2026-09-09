"""LATENT_PITCH_LADDER sweep — drive all 12 pitch-slot states through the live jam.

The MRT2 encoder pitch embedding (encoder.regular_embedding, [1536,256] =
128 slots x 12 states) is fed by jam_server.lm_steer(pr, drum), which takes a
128-element int32 pitch vector and returns 12 tokens. Google's sampler emits
only 3 states (silence/held/onset). States 3..11 are trained but undocumented.

This script holds a fixed A-minor chord and sweeps pr[p] = state for state in
0..11, decoding each through the live stack and writing a wav + metrics row.

Usage (after lm_server 8796 + decode_server 8797 + jam_server 8083 are up):
    python latent_pitch_sweep.py [--states 0,1,2,3,4,5,6,7,8,9,10,11]
                                  [--frames 120] [--out tmp/latent_sweep/]

Wire contract (jam_server.py lm_steer):
    send:  uint32 len  +  int32[128] pr  +  int32 drum
    recv:  uint32 len  +  int32[12]  tokens
"""

import json
import os
import socket
import struct
import sys
import numpy as np

LM_PORT = int(os.environ.get("LM_PORT", "8806"))
DEC_PORT = int(os.environ.get("DEC_PORT", "8797"))
BASE = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, os.path.join(BASE, "tmp"))

# A-minor add9 voicing held across the radio (MIDI indices into the 128 vector).
CHORD = [45, 52, 57, 64, 71]


def _read(sock, n):
    buf = b""
    while len(buf) < n:
        d = sock.recv(1 << 20)
        if not d:
            raise ConnectionError("closed")
        buf += d
    out = buf[:n]
    return out, buf[n:]


class LMClient:
    def __init__(self, port):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=60)
        self.sock.settimeout(120)
        self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.buf = b""
        self.reset()

    def reset(self):
        self.sock.sendall(struct.pack("<I", 0))
        self._drain(4)

    def steer(self, pr, drum):
        payload = np.concatenate([pr, [drum]]).astype(np.int32)
        self.sock.sendall(struct.pack("<I", len(payload) * 4) + payload.tobytes())
        n = struct.unpack("<I", self._drain(4))[0]
        if n == 0:
            raise ConnectionError("LM zero-length response")
        return np.frombuffer(self._drain(n), np.int32).reshape(12)

    def _drain(self, n):
        while len(self.buf) < n:
            d = self.sock.recv(1 << 20)
            if not d:
                raise ConnectionError("closed")
            self.buf += d
        out = self.buf[:n]
        self.buf = self.buf[n:]
        return out


class DecClient:
    def __init__(self, port):
        self.sock = socket.create_connection(("127.0.0.1", port), timeout=120)
        self.sock.settimeout(300)
        self.sock.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
        self.buf = b""

    def decode(self, rows):
        p = np.ascontiguousarray(rows, np.int32).tobytes()
        self.sock.sendall(struct.pack("<I", len(p)) + p)
        n = struct.unpack("<I", self._drain(4))[0]
        return np.frombuffer(self._drain(n), np.float32).reshape(-1)

    def _drain(self, n):
        while len(self.buf) < n:
            d = self.sock.recv(1 << 20)
            if not d:
                raise ConnectionError("closed")
            self.buf += d
        out = self.buf[:n]
        self.buf = self.buf[n:]
        return out


def rms(a):
    return float(np.sqrt(np.mean(a**2))) if len(a) else 0.0


def spectral_centroid(a, sr=48000):
    if len(a) < 2:
        return 0.0
    win = np.hanning(min(len(a), 4096)) * a[:4096]
    spec = np.abs(np.fft.rfft(win))
    freqs = np.fft.rfftfreq(len(win), 1.0 / sr)
    s = spec.sum()
    return float((freqs * spec).sum() / s) if s > 0 else 0.0


def onset_density(a, sr=48000, hop=256):
    if len(a) < 512:
        return 0.0
    env = np.abs(a)
    env = np.convolve(env, np.hanning(256), mode="same")
    env = env[::hop]
    d = np.diff(env)
    thr = 0.05 * env.mean() + 1e-9
    return float((d > thr).sum()) / max(1, len(d))


def main():
    states = [
        int(s)
        for s in (sys.argv[sys.argv.index("--states") + 1].split(","))
        if "--states" in sys.argv
    ] or list(range(12))
    frames = (
        int(sys.argv[sys.argv.index("--frames") + 1]) if "--frames" in sys.argv else 120
    )
    outdir = (
        sys.argv[sys.argv.index("--out") + 1]
        if "--out" in sys.argv
        else "tmp/latent_sweep"
    )
    os.makedirs(outdir, exist_ok=True)

    print(f"connecting LM 127.0.0.1:{LM_PORT} ...")
    lm = LMClient(LM_PORT)
    print(f"connecting DEC 127.0.0.1:{DEC_PORT} ...")
    dec = DecClient(DEC_PORT)

    rows_out = []
    for state in states:
        print(f"\n=== state {state} ({frames} frames) ===", flush=True)
        tokens = []
        for f in range(frames):
            pr = np.zeros(128, np.int32)
            for p in CHORD:
                pr[p] = state
            drum = 1 if (f % 25) < 13 else 0
            tok = lm.steer(pr, drum)
            # codes = tok - (6 + level*1024), level 0..11
            codes = tok - (6 + np.arange(12) * 1024)
            tokens.append(codes[None, :])
        block = np.concatenate(tokens, 0)
        wav = dec.decode(block)
        wav16 = np.clip(wav, -1, 1) * 16384.0
        path = os.path.join(outdir, f"state_{state:02d}.wav")
        import wave

        with wave.open(path, "wb") as w:
            w.setnchannels(2)
            w.setsampwidth(2)
            w.setframerate(48000)
            w.writeframes(wav16.astype("<i2").tobytes())
        m = {
            "state": state,
            "frames": frames,
            "samples": int(len(wav)),
            "rms": round(rms(wav), 6),
            "centroid_hz": round(spectral_centroid(wav), 1),
            "onset_density": round(onset_density(wav), 4),
            "peak": round(float(np.abs(wav).max()), 6),
            "file": path,
        }
        print(json.dumps(m, indent=2), flush=True)
        rows_out.append(m)

    with open(os.path.join(outdir, "sweep.json"), "w") as f:
        json.dump({"states": states, "frames": frames, "rows": rows_out}, f, indent=2)
    print("\nwrote", os.path.join(outdir, "sweep.json"))


if __name__ == "__main__":
    main()
