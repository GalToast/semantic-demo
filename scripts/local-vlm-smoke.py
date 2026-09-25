import argparse
import json
import os
import sys
from pathlib import Path

import torch
from qwen_vl_utils import process_vision_info
from transformers import AutoModelForImageTextToText, AutoProcessor


DEFAULT_MODEL = os.environ.get("LOCAL_VLM_MODEL", "Qwen/Qwen3-VL-4B-Instruct")
DEFAULT_PROMPT = """You are a strict UI visual QA reviewer.
Inspect this screenshot and return compact JSON with:
surface, visible_problems, clipped_text, overlap_risk, hierarchy_notes, suggested_fix.
Be concrete and do not invent hidden interactions."""


def find_default_image() -> Path | None:
    audit_root = Path("tmp/semantic-ui-visual-audit")
    if not audit_root.exists():
        return None

    for run_dir in sorted((p for p in audit_root.iterdir() if p.is_dir()), reverse=True):
        preferred = run_dir / "17-mobile-thread-inspector.png"
        if preferred.exists():
            return preferred
        screenshots = sorted(run_dir.glob("*.png"))
        if screenshots:
            return screenshots[0]
    return None


def first_tensor_device(inputs) -> torch.device:
    for value in inputs.values():
        if hasattr(value, "device"):
            return value.device
    return torch.device("cuda" if torch.cuda.is_available() else "cpu")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    parser = argparse.ArgumentParser(description="Run a local Qwen vision-language UI smoke test.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--image", default=None)
    parser.add_argument("--prompt", default=DEFAULT_PROMPT)
    parser.add_argument("--max-new-tokens", type=int, default=220)
    parser.add_argument("--max-pixels", type=int, default=512 * 512)
    parser.add_argument("--output", default=None)
    parser.add_argument("--gpu-memory", default="5200MiB")
    parser.add_argument("--cpu-memory", default="24GiB")
    args = parser.parse_args()

    image_path = Path(args.image) if args.image else find_default_image()
    if not image_path or not image_path.exists():
        raise SystemExit("No screenshot found. Pass --image path/to/screenshot.png")

    print(json.dumps({
        "model": args.model,
        "image": str(image_path),
        "cuda": torch.cuda.is_available(),
        "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else None,
        "gpu_memory_limit": args.gpu_memory,
    }, indent=2))

    processor = AutoProcessor.from_pretrained(args.model)
    model = AutoModelForImageTextToText.from_pretrained(
        args.model,
        dtype="auto",
        device_map="auto",
        max_memory={0: args.gpu_memory, "cpu": args.cpu_memory} if torch.cuda.is_available() else {"cpu": args.cpu_memory},
        attn_implementation="sdpa",
    )

    messages = [
        {
            "role": "user",
            "content": [
                {"type": "image", "image": str(image_path), "max_pixels": args.max_pixels},
                {"type": "text", "text": args.prompt},
            ],
        }
    ]
    text = processor.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
    image_inputs, video_inputs = process_vision_info(messages)
    inputs = processor(
        text=[text],
        images=image_inputs,
        videos=video_inputs,
        padding=True,
        return_tensors="pt",
    )

    target_device = first_tensor_device(inputs)
    if torch.cuda.is_available():
        target_device = torch.device("cuda")
    inputs = inputs.to(target_device)

    with torch.inference_mode():
        generated_ids = model.generate(
            **inputs,
            max_new_tokens=args.max_new_tokens,
            do_sample=False,
        )

    generated_ids_trimmed = [
        output_ids[len(input_ids):] for input_ids, output_ids in zip(inputs.input_ids, generated_ids)
    ]
    output_text = processor.batch_decode(
        generated_ids_trimmed,
        skip_special_tokens=True,
        clean_up_tokenization_spaces=False,
    )[0].strip()
    if args.output:
        Path(args.output).write_text(f"{output_text}\n", encoding="utf-8")
    print(output_text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
