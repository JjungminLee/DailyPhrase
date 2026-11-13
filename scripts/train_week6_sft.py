#!/usr/bin/env python3
"""Train a small, reviewed multilingual SFT-LoRA pilot for week 6."""

import argparse
import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig
from transformers import AutoModelForCausalLM, AutoTokenizer
from trl import SFTConfig, SFTTrainer


ROOT = Path(__file__).resolve().parents[1]
MODEL_ID = "Qwen/Qwen3-0.6B"
MODEL_REVISION = "c1899de289a04d12100db370d81485cdf75e47ca"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", default=None)
    parser.add_argument("--epochs", type=int, default=3)
    args = parser.parse_args()

    prepared_raw = subprocess.check_output(
        ["node", "scripts/prepare_week6_sft.mjs"], cwd=ROOT, text=True, stderr=subprocess.PIPE
    )
    prepared = json.loads(prepared_raw)
    device = "mps" if torch.backends.mps.is_available() else "cpu"
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    output_dir = Path(args.output_dir) if args.output_dir else ROOT / "results" / f"week6-sft-{timestamp}"
    if not output_dir.is_absolute():
        output_dir = ROOT / output_dir

    tokenizer = AutoTokenizer.from_pretrained(MODEL_ID, revision=MODEL_REVISION)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_ID,
        revision=MODEL_REVISION,
        dtype=torch.float16 if device == "mps" else torch.float32,
        device_map={"": device},
    )
    training_args = SFTConfig(
        output_dir=str(output_dir),
        num_train_epochs=args.epochs,
        learning_rate=1e-4,
        per_device_train_batch_size=1,
        gradient_accumulation_steps=4,
        max_length=512,
        logging_steps=1,
        save_strategy="epoch",
        report_to="none",
        use_cpu=device == "cpu",
    )
    trainer = SFTTrainer(
        model=model,
        args=training_args,
        train_dataset=Dataset.from_list(prepared["rows"]),
        processing_class=tokenizer,
        peft_config=LoraConfig(
            r=8,
            lora_alpha=16,
            lora_dropout=0.05,
            target_modules=["q_proj", "k_proj", "v_proj", "o_proj"],
            task_type="CAUSAL_LM",
        ),
    )
    train_result = trainer.train()
    trainer.save_model(str(output_dir / "adapter"))
    tokenizer.save_pretrained(output_dir / "adapter")

    manifest = {
        "kind": "week6-sft-lora",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "git_sha": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "model_id": MODEL_ID,
        "model_revision": MODEL_REVISION,
        "model_license": "Apache-2.0",
        "dataset_id": prepared["dataset_id"],
        "dataset_sha256": prepared["dataset_sha256"],
        "evaluation_dataset_sha256": prepared["evaluation_dataset_sha256"],
        "prompt_sha256_by_language": prepared["prompt_sha256_by_language"],
        "dataset_counts": prepared["counts"],
        "evaluation_dataset_used_for_training": False,
        "torch": torch.__version__,
        "device": device,
        "lora": {"r": 8, "alpha": 16, "dropout": 0.05},
        "training": train_result.metrics,
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "run-manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    print(json.dumps({"output_dir": str(output_dir), "device": device, "dataset_counts": prepared["counts"]}, indent=2))


if __name__ == "__main__":
    main()
