#!/usr/bin/env python3
"""Run a small code-verifiable GRPO pilot from the week-6 SFT LoRA adapter."""

import argparse
import json
import platform
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

import psutil
import torch
from datasets import Dataset
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import GRPOConfig, GRPOTrainer


ROOT = Path(__file__).resolve().parents[1]
MODEL_ID = "Qwen/Qwen3-0.6B"
MODEL_REVISION = "c1899de289a04d12100db370d81485cdf75e47ca"
SFT_ADAPTER = ROOT / "results/week6-sft-20261113T023817Z/adapter"


def code_reward(completions, source_text, language, **kwargs):
    rows = []
    for completion, source, lang in zip(completions, source_text, language):
        if isinstance(completion, list):
            text = "".join(str(message.get("content", "")) for message in completion if isinstance(message, dict))
        else:
            text = str(completion)
        rows.append({"source_text": source, "language": lang, "raw_output": text})
    result = subprocess.run(
        ["node", "scripts/week6_reward_batch.mjs"], cwd=ROOT,
        input=json.dumps(rows, ensure_ascii=False), text=True, capture_output=True, check=True,
    )
    return [row["reward"] for row in json.loads(result.stdout)]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-steps", type=int, default=8)
    args = parser.parse_args()
    prepared = json.loads(subprocess.check_output(
        ["node", "scripts/prepare_week6_sft.mjs"], cwd=ROOT, text=True, stderr=subprocess.PIPE
    ))
    if not SFT_ADAPTER.is_dir():
        raise FileNotFoundError(f"Required SFT starting adapter is missing: {SFT_ADAPTER}")

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    dtype = torch.float16 if device == "mps" else torch.float32
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = ROOT / "results" / f"week6-grpo-{timestamp}"
    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    base = AutoModelForCausalLM.from_pretrained(
        MODEL_ID, revision=MODEL_REVISION, dtype=dtype, device_map={"": device}
    )
    model = PeftModel.from_pretrained(base, str(SFT_ADAPTER), is_trainable=True)
    model.config.use_cache = False

    rows = []
    for source_row, case in zip(prepared["rows"], json.loads((ROOT / "data/week6-training-draft.json").read_text())["cases"]):
        rows.append({
            "prompt": source_row["prompt"],
            "source_text": case["source_text"],
            "language": case["language"],
        })
    dataset = Dataset.from_list(rows)
    config = GRPOConfig(
        output_dir=str(output_dir),
        max_steps=args.max_steps,
        learning_rate=5e-6,
        per_device_train_batch_size=2,
        gradient_accumulation_steps=1,
        num_generations=2,
        max_completion_length=120,
        temperature=0.7,
        beta=0.0,
        optim="adamw_torch",
        gradient_checkpointing=False,
        use_cpu=device == "cpu",
        logging_steps=1,
        save_strategy="no",
        report_to="none",
        seed=42,
        data_seed=42,
        disable_tqdm=True,
        chat_template_kwargs={"enable_thinking": False},
        log_completions=False,
    )
    trainer = GRPOTrainer(
        model=model,
        reward_funcs=code_reward,
        args=config,
        train_dataset=dataset,
        processing_class=tokenizer,
    )
    started = time.perf_counter()
    peak_mps = torch.mps.driver_allocated_memory() if device == "mps" else None
    peak_rss = psutil.Process().memory_info().rss
    result = trainer.train()
    elapsed = time.perf_counter() - started
    trainer.save_model(str(output_dir / "adapter"))
    tokenizer.save_pretrained(output_dir / "adapter")
    if device == "mps":
        torch.mps.synchronize()
        peak_mps = max(peak_mps, torch.mps.driver_allocated_memory())
    peak_rss = max(peak_rss, psutil.Process().memory_info().rss)
    manifest = {
        "kind": "week6-grpo-lora",
        "status": "completed",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "git_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "model_id": MODEL_ID,
        "model_revision": MODEL_REVISION,
        "starting_adapter": str(SFT_ADAPTER.relative_to(ROOT)),
        "dataset_id": prepared["dataset_id"],
        "dataset_sha256": prepared["dataset_sha256"],
        "evaluation_dataset_sha256": prepared["evaluation_dataset_sha256"],
        "dataset_counts": prepared["counts"],
        "evaluation_dataset_used_for_training": False,
        "reward": "src/evaluation/reward.mjs evaluateReward. Eligible completion receives +1; otherwise reward is negative failed-check fraction (0 to -1). Only all-check-pass outputs receive positive reward; no model-judge reward.",
        "reward_revision_sha256": __import__("hashlib").sha256((ROOT / "src/evaluation/reward.mjs").read_bytes()).hexdigest(),
        "trl": __import__("trl").__version__,
        "torch": torch.__version__,
        "device": device,
        "settings": {"max_steps": args.max_steps, "num_generations": 2, "batch_size": 2, "max_completion_length": 120, "temperature": 0.7, "enable_thinking": False, "learning_rate": 5e-6, "beta": 0.0, "seed": 42},
        "peak_mps_driver_allocated_bytes": peak_mps,
        "peak_process_rss_bytes": peak_rss,
        "wall_clock_seconds": elapsed,
        "training": result.metrics,
        "training_log": trainer.state.log_history,
    }
    (output_dir / "run-manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
    print(json.dumps({"output_dir": str(output_dir), "device": device, "elapsed_seconds": elapsed, "metrics": result.metrics}, indent=2))


if __name__ == "__main__":
    main()
