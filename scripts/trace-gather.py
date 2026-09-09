"""Trace how encoder.onnx indexes regular_embedding [1536,256].

Goal: derive the EXACT index formula (not the doc's claim) and compute
which table rows any driver can ever address. CPU-only, no GPU/stack.
"""
import os

import numpy as np

BASE = r"C:\Users\HP\Desktop\Temp while my comp is at the shop\mrt2"
ONX = os.path.join(BASE, "mrt2_onnx", "fp16")

import onnx

model = onnx.load(os.path.join(ONX, "encoder.onnx"), load_external_data=False)
g = model.graph

inits = {i.name: i for i in g.initializer}


def const_val(name):
    """Return numpy value of an initializer, or None."""
    init = inits.get(name)
    if init is None:
        return None
    from onnx import numpy_helper

    try:
        return numpy_helper.to_array(init)
    except Exception:
        return None


print("=== Gather nodes touching regular_embedding ===")
for node in g.node:
    if node.op_type == "Gather":
        data, idx = node.input[0], node.input[1]
        print(f"Gather {node.name}: data={data} indices={idx} axis={node.attribute[0].i if node.attribute else '?'}")

print("\n=== nodes feeding Gather indices (walk back 6 levels) ===")


def producers(tensor):
    return [n for n in g.node if tensor in n.output]


def describe(tensor, depth=0, seen=None):
    if seen is None:
        seen = set()
    if depth > 6 or tensor in seen:
        return
    seen.add(tensor)
    for n in producers(tensor):
        ins = ", ".join(
            f"{i}={const_val(i).tolist() if const_val(i) is not None and const_val(i).size <= 8 else const_val(i).shape if const_val(i) is not None else '?'}"
            for i in n.input
        )
        print("  " * depth + f"{n.op_type} {n.name}({ins}) -> {list(n.output)}")
        for i in n.input:
            if const_val(i) is None:
                describe(i, depth + 1, seen)


for node in g.node:
    if node.op_type == "Gather" and "regular_embedding" in node.input[0]:
        describe(node.input[1])

print("\n=== Constant_9 and small int constants ===")
for name in inits:
    v = const_val(name)
    if v is not None and v.size <= 4 and np.issubdtype(v.dtype, np.integer):
        print(f"  {name} = {v.tolist()}")
