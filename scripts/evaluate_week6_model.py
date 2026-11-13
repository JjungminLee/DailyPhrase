#!/usr/bin/env python3
"""Run the fixed 40-case held-out evaluation using a Qwen3-0.6B base or LoRA adapter."""

import argparse
import json
import platform
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import psutil
import torch
from peft import PeftModel
import transformers.tokenization_utils as tokenization_utils
from transformers.tokenization_utils_base import PreTrainedTokenizerBase

# lm-format-enforcer 0.11 imports this class from a path moved by Transformers 5.
if not hasattr(tokenization_utils, "PreTrainedTokenizerBase"):
    tokenization_utils.PreTrainedTokenizerBase = PreTrainedTokenizerBase

from lmformatenforcer import JsonSchemaParser
from lmformatenforcer.integrations.transformers import (
    build_token_enforcer_tokenizer_data,
    build_transformers_prefix_allowed_tokens_fn,
)
from transformers import AutoModelForCausalLM, AutoTokenizer


ROOT = Path(__file__).resolve().parents[1]
MODEL_ID = "Qwen/Qwen3-0.6B"
MODEL_REVISION = "c1899de289a04d12100db370d81485cdf75e47ca"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--adapter", default=None)
    args = parser.parse_args()

    prepared = json.loads(subprocess.check_output(
        ["node", "scripts/prepare_week6_evaluation.mjs"], cwd=ROOT, text=True
    ))
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    dtype = torch.float16 if device == "mps" else torch.float32
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
        dtype=dtype,
        device_map={"": device},
    )
    if args.adapter:
        model = PeftModel.from_pretrained(model, args.adapter, is_trainable=False)
    model.eval()
    tokenizer_data = build_token_enforcer_tokenizer_data(tokenizer)
    schema_constraints = {
        language: build_transformers_prefix_allowed_tokens_fn(
            tokenizer_data,
            JsonSchemaParser(next(item["schema"] for item in prepared["cases"] if item["language"] == language)),
        )
        for language in {item["language"] for item in prepared["cases"]}
    }

    results = []
    process = psutil.Process()
    peak_rss_bytes = process.memory_info().rss
    peak_mps_bytes = torch.mps.driver_allocated_memory() if device == "mps" else 0
    for index, item in enumerate(prepared["cases"], start=1):
        torch.manual_seed(42)
        if device == "mps":
            torch.mps.manual_seed(42)
        encoded = tokenizer.apply_chat_template(
            item["prompt"],
            tokenize=True,
            add_generation_prompt=True,
            enable_thinking=False,
            return_dict=True,
            return_tensors="pt",
        )
        encoded = {key: value.to(device) for key, value in encoded.items()}
        input_ids = encoded["input_ids"]
        started = time.perf_counter()
        with torch.inference_mode():
            output_ids = model.generate(
                **encoded,
                max_new_tokens=500,
                do_sample=True,
                temperature=0.1,
                pad_token_id=tokenizer.pad_token_id or tokenizer.eos_token_id,
                eos_token_id=tokenizer.eos_token_id,
                prefix_allowed_tokens_fn=schema_constraints[item["language"]],
            )
        if device == "mps":
            torch.mps.synchronize()
        elapsed_ms = round((time.perf_counter() - started) * 1000, 2)
        completion_ids = output_ids[0, input_ids.shape[-1]:]
        raw_output = tokenizer.decode(completion_ids, skip_special_tokens=True)
        results.append({
            "id": item["id"],
            "language": item["language"],
            "source_text": item["source_text"],
            "reference": item["reference"],
            "status": "success" if raw_output.strip() else "empty",
            "elapsed_ms": elapsed_ms,
            "input_tokens": int(input_ids.shape[-1]),
            "output_tokens": int(completion_ids.shape[-1]),
            "raw_output": raw_output,
        })
        peak_rss_bytes = max(peak_rss_bytes, process.memory_info().rss)
        if device == "mps":
            peak_mps_bytes = max(peak_mps_bytes, torch.mps.driver_allocated_memory())
        print(f"Evaluated {index}/{len(prepared['cases'])}: {item['id']}", flush=True)

    raw_report = {
        "kind": "week6-transformers-evaluation-raw",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "git_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "model": {
            "requested": MODEL_ID,
            "revision": MODEL_REVISION,
            "adapter": str(Path(args.adapter).resolve()) if args.adapter else None,
            "variant": "sft_lora" if args.adapter else "base",
            "license": "Apache-2.0",
        },
        "dataset": prepared["dataset"],
        "prompt_sha256_by_language": prepared["prompt_sha256_by_language"],
        "generation": {
            "temperature": 0.1,
            "max_tokens": 500,
            "seed": 42,
            "do_sample": True,
            "constrained_json_schema": True,
        },
        "machine": {
            "platform": f"{platform.system()} {platform.release()} {platform.machine()}",
            "cpu": platform.processor() or "Apple M4",
            "logical_cpu_count": psutil.cpu_count(),
            "total_memory_bytes": psutil.virtual_memory().total,
            "device": device,
            "peak_process_rss_bytes": peak_rss_bytes,
            "peak_mps_driver_allocated_bytes": peak_mps_bytes if device == "mps" else None,
        },
        "torch_version": torch.__version__,
        "transformers_version": __import__("transformers").__version__,
        "results": results,
    }
    completed = subprocess.run(
        ["node", "scripts/score_week6_evaluation.mjs"],
        cwd=ROOT,
        input=json.dumps(raw_report, ensure_ascii=False),
        text=True,
        check=True,
        capture_output=True,
    )
    print(completed.stdout, end="")


if __name__ == "__main__":
    main()
