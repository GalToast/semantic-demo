"""Measure MusicCoCa TFLite embed latency (CPU, ai_edge_litert).

Determines the live style-follow cadence: if a 10s embed costs ~1s, a
2-4s re-style loop is sustainable on CPU with zero GPU contention.
Loads ONLY the style encoder (not LM/decode). Prints shapes + timings.
"""

import os
import time

import numpy as np

RES = r"C:\Users\HP\Documents\Magenta\magenta-rt-v2\resources\musiccoca"

from ai_edge_litert.interpreter import Interpreter

SR = 16000
CLIP = 10 * SR


def load(name):
    it = Interpreter(model_path=os.path.join(RES, name))
    it.allocate_tensors()
    return it


print("loading music_encoder.tflite ...")
t0 = time.time()
enc = load("music_encoder.tflite")
print(f"loaded in {time.time() - t0:.1f}s")
print("loading audio_preprocessor.tflite ...")
pre = load("audio_preprocessor.tflite")
for d in pre.get_input_details():
    print("  pre-in:", d["name"], d["shape"], d["dtype"])
for d in pre.get_output_details():
    print("  pre-out:", d["name"], d["shape"], d["dtype"])
for d in enc.get_input_details():
    print("  in:", d["name"], d["shape"], d["dtype"])
for d in enc.get_output_details():
    print("  out:", d["name"], d["shape"], d["dtype"])

rng = np.random.default_rng(11)
# 10s pseudo-audio: summed sines (deterministic stand-in for mic)
t = np.arange(CLIP) / SR
clip = (
    np.sin(2 * np.pi * 220 * t)
    + 0.5 * np.sin(2 * np.pi * 330 * t)
    + 0.25 * np.sin(2 * np.pi * 440 * t)
).astype(np.float32) * 0.3

inp = enc.get_input_details()[0]
print("fronting 10s clip through preprocessor ...")
pre_in = pre.get_input_details()[0]
pre_out = pre.get_output_details()[0]
t0 = time.time()
pre.set_tensor(pre_in["index"], clip.reshape(pre_in["shape"]))
pre.invoke()
mel = pre.get_tensor(pre_out["index"])
print(f"  preprocessor: {time.time() - t0:.2f}s mel shape {mel.shape}")
print(f"feeding mel {mel.shape} into {inp['shape']}")
outs = []
for i in range(3):
    t0 = time.time()
    enc.set_tensor(inp["index"], mel.reshape(inp["shape"]))
    enc.invoke()
    out = [enc.get_tensor(d["index"]) for d in enc.get_output_details()]
    dt = time.time() - t0
    outs.append(out)
    print(f"  run {i}: {dt:.2f}s out_shapes={[o.shape for o in out]}")

e0 = outs[1][0].ravel()
e1 = outs[2][0].ravel()
print(
    f"determinism (run1 vs run2 cosine): {float(e0 @ e1 / (np.linalg.norm(e0) * np.linalg.norm(e1) + 1e-12)):.6f}"
)
print(f"embedding norm: {float(np.linalg.norm(e0)):.3f} dim={e0.size}")
