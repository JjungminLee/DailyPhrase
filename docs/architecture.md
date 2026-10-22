# Architecture

`src/handler.mjs` contains the API routes. `src/local.mjs` serves them locally, and
`scripts/dev.mjs` starts the API together with the Vite dashboard. The API calls the
configured local Ollama model, defaulting to Qwen. Feed collection uses RSS/Atom and
bounded article fetches; HTTPS requests use Node's system certificate store.

The active study workflow pins the model and prompt, evaluates reviewed examples in
four languages, and compares the baseline with prompt or parameter-efficient tuning
such as LoRA. Training examples stay separate from the held-out evaluation set. The
quality measures include source grounding, target-language correctness, beginner
usefulness, pronunciation fields, and Korean explanations. Latency and memory are
tracked separately from quality. Feed subscriptions, article metadata, and study
history use the local data store and Google Drive integration described in the README.
