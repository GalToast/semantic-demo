"""Dump every initializer (name, shape, dtype) in the MRT2 ONNX graphs.

The pitch ladder came from ONE table (encoder.regular_embedding [1536,256]
= 128 slots x 12 states, Google uses 3). Question: do other tables hide the
same 12-state structure? CPU-only, no GPU, no stack needed.
"""

import os


BASE = r"C:\Users\HP\Desktop\Temp while my comp is at the shop\mrt2"
ONX = os.path.join(BASE, "mrt2_onnx", "fp16")

import onnxruntime as ort

so = ort.SessionOptions()
so.log_severity_level = 3

for graph in ["encoder.onnx", "temporal_step.onnx", "depth_step.onnx", "embed.onnx"]:
    path = os.path.join(ONX, graph)
    if not os.path.exists(path):
        print(f"{graph}: MISSING")
        continue
    sess = ort.InferenceSession(path, so, providers=["CPUExecutionProvider"])
    print(f"=== {graph} ===")
    print("  inputs:", [(i.name, list(i.shape), i.type) for i in sess.get_inputs()])
    print("  outputs:", [(o.name, list(o.shape), o.type) for o in sess.get_outputs()])
    print("  initializers (via onnx lib):")
    try:
        import onnx

        model = onnx.load(path, load_external_data=False)
        for init in model.graph.initializer:
            dims = list(init.dims)
            n = 1
            for d in dims:
                n *= d
            tag = ""
            if len(dims) == 2 and dims[0] % 128 == 0 and dims[1] in (256, 512, 1024):
                tag = "  <-- pitch-table-shaped?" if dims[0] % 12 == 0 else ""
            if len(dims) == 2 and dims[0] == 1536:
                tag = "  <-- 1536-row table (12-state candidate)"
            print(f"    {init.name}: {dims} ({n} elems){tag}")
    except ImportError:
        print("    (onnx lib missing — install to list initializers)")
