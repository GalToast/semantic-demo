"""Probe DEC 8797 liveness with a minimal valid request (read-only diagnosis).

The e2e (scripts/e2e-summit.py) showed steering alive (79 metrics) but zero
audio frames — pointing at a starved decode leg. This sends one tiny
(1,4,12) int32 block over the same wire protocol jam_server.dec_decode
uses and measures whether anything comes back.

No kills, no restarts, no config changes. One small request (~100ms of
shared decode time).
"""
import socket
import struct
import sys
import time

import numpy as np

HOST, PORT = "127.0.0.1", 8797

t0 = time.time()
s = socket.create_connection((HOST, PORT), timeout=10)
print(f"connected in {time.time()-t0:.2f}s")
s.settimeout(90)

codes = np.zeros((1, 4, 12), dtype=np.int32)
payload = codes.tobytes()
s.sendall(struct.pack("<I", len(payload)) + payload)
print(f"sent {len(payload)} bytes, waiting...")

buf = b""


def drain(n):
    global buf
    while len(buf) < n:
        d = s.recv(1 << 20)
        if not d:
            raise ConnectionError("closed")
        buf += d
    out, buf = buf[:n], buf[n:]
    return out


t1 = time.time()
n = struct.unpack("<I", drain(4))[0]
print(f"length prefix in {time.time()-t1:.1f}s: n={n}")
if n == 0:
    print("VERDICT: decode responded zero-length (error path, but ALIVE)")
    sys.exit(0)
audio = drain(n)
dt = time.time() - t1
print(f"received {len(audio)} bytes in {dt:.1f}s")
a = np.frombuffer(audio, dtype=np.float32)
print(f"samples={len(a)} peak={np.abs(a).max():.4f} rms={np.sqrt(np.mean(a**2)):.6f}")
print(f"VERDICT: decode ALIVE (+{dt:.1f}s for a 4-frame block)")
