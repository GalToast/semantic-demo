"""Read Constant node values + Slice params feeding the pitch Gather."""

import os


BASE = r"C:\Users\HP\Desktop\Temp while my comp is at the shop\mrt2"
ONX = os.path.join(BASE, "mrt2_onnx", "fp16")

import onnx
from onnx import numpy_helper

model = onnx.load(os.path.join(ONX, "encoder.onnx"), load_external_data=False)
g = model.graph
nodes = {n.name: n for n in g.node}


def const_of(name):
    n = nodes.get(
        name.rsplit("_output_0", 1)[0] if name.endswith("_output_0") else name
    )
    if n is None or n.op_type != "Constant":
        # try direct tensor name match against initializers
        for i in g.initializer:
            if i.name == name:
                return numpy_helper.to_array(i)
        return None
    for attr in n.attribute:
        if attr.name == "value":
            return numpy_helper.to_array(attr.t)
    return None


for c in ["Constant_4", "Constant_5", "Constant_6", "Constant_7", "Constant_9"]:
    full = f"/encoder/{c}_output_0"
    v = const_of(f"/encoder/{c}")
    print(f"{c}: {v.tolist() if v is not None else '(not found)'}")

# also dump every Constant node's value (small ones) to catch the stride
print("\nall small Constant node values:")
for n in g.node:
    if n.op_type == "Constant":
        for attr in n.attribute:
            if attr.name == "value":
                v = numpy_helper.to_array(attr.t)
                if v.size <= 8:
                    print(f"  {n.name}: {v.tolist()}")
