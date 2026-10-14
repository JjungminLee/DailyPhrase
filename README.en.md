# Daily Phrase 🌱

[한국어](README.md) | [English](README.en.md)

### A little practice, every day.

![Daily Phrase screenshot](readme_image.png)

Daily Phrase is a language-learning app for studying useful expressions found in articles. A local Ollama model selects natural expressions from the source text and presents them with context and Korean meanings.

## Features

- **Daily phrases** — Choose English, Chinese, French, or Japanese and select how many expressions to study.
- **Expressions grounded in the source** — The app checks that selected expressions appear in the article and shows the original sentence for context.
- **Chinese pinyin** — See tone-marked pinyin for Chinese expressions.
- **Japanese readings** — See kana readings for Japanese expressions containing kanji.
- **Article library** — Browse collected articles and open an article detail page in a new tab.
- **Paste article text** — If the source website blocks access, paste the text to extract expressions locally. Pasted text is not stored.
- **Feed settings** — Add and verify RSS/Atom feeds at `/admin`.
- **Study history** — Save an article and its expressions to Google Drive, then review them from the navigation bar.

## Pages

| Page | URL | Description |
| --- | --- | --- |
| Daily phrases | `/` | Choose languages and study expressions |
| Article library | `/articles` | Browse collected articles |
| Article details | `/articles/:articleId` | Open the source and extract expressions |
| Study history | `/studied` | Review saved articles and expressions |
| Feed settings | `/admin` | Add, verify, and manage feeds |

## Getting started

Requirements: Node.js 22.19 or later, [Ollama](https://ollama.com/), and a model installed locally.

```sh
npm install
ollama pull qwen3.5:9b
ollama pull qwen3.5:4b
```

Create the environment file and configure local Ollama:

```powershell
Copy-Item .env.example .env
```

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:9b
OLLAMA_ARTICLE_MODEL=qwen3.5:4b
MODEL_TIMEOUT_MS=120000
```

Start Ollama, then run the app:

```sh
npm run dev
```

Open the app at [http://localhost:5173](http://localhost:5173). The API health endpoint is [http://localhost:3000/api/health](http://localhost:3000/api/health). One development command starts the local API and Vite frontend. `.env` can contain secrets; do not commit it.

### Choosing models

- `OLLAMA_MODEL` is the default local model for daily phrase generation.
- `OLLAMA_ARTICLE_MODEL` is used to extract expressions from article details. It defaults to the smaller `qwen3.5:4b` model.
- To use Kimi or another Ollama model, pull it with Ollama and set `OLLAMA_MODEL` or `OLLAMA_ARTICLE_MODEL` to its installed tag.
- Model downloads use disk space. Local Ollama inference has no per-request model API fee; power and memory use depend on your computer.

## Cloud architecture

Terraform defines an **API Gateway → Lambda** API. Lambda does not run Ollama. It sends requests to a network-accessible Ollama service configured through `ollama_base_url`; the Qwen models must already be installed on that Ollama host.

You can set up an Ollama host on EC2 or elsewhere, but the current Terraform configuration does not create that host, its network route, authentication, or model installation. Terraform alone therefore does not provide cloud inference. Configure and secure the Ollama endpoint, then review the Terraform plan before deployment. Local development uses local Ollama by default; hosted inference may incur infrastructure costs.

## Feeds and article text

Add an RSS/Atom URL or a website that publishes a feed. The app does not crawl arbitrary webpages. Article text is fetched only while extracting expressions; article bodies and RSS preview text are not saved as app data. If a source returns an access-check page, extraction stops and the app asks you to paste the text yourself.

Feed settings are stored locally in `data/subscriptions.json`. The current day's collected articles are stored in `data/articles.json`.

## Daily collection and study history

The app collects feed entries on the first app connection of each Seoul calendar day. Starting the API alone does not collect anything. If your computer is off all day, opening the app later starts that day's collection. Further visits and API restarts on the same day do not collect again. Before collection on a new day, the local article list is cleared. Study history saved to Google Drive is kept separately.

To enable study history, create a Google Cloud OAuth web client, enable the Google Drive API, and add `http://localhost:3000/api/drive/callback` as an authorized redirect URI. Put the client ID and client secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, and set `GOOGLE_REDIRECT_URI=http://localhost:3000/api/drive/callback`. Restart the app and connect Google Drive from the Study History navigation item. Study records are stored in Drive's private `appDataFolder`. OAuth tokens remain in the ignored local file `data/google-drive-auth.json`. Google Drive integration is currently available through the local development API.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the local API and frontend |
| `npm run build` | Build the frontend and Lambda ZIP |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript checks |
| `npm run batch:poll` | Collect feeds once, subject to the daily limit |
| `npm run crawler` | Start the feed collector process with the daily limit |
| `npm run study:batch` | Measure feed polling concurrency |

Terraform is an unapplied deployment scaffold in `infra/`. Review the deployment configuration before running `npm run deploy` or `npm run destroy`.

## Configuration files

- `config/languages.json` — Phrase length and difficulty rules by language
- `config/feeds.json` — Optional project-level feeds
- `config/default-feeds.json` — Default feeds seeded into the local feed store
- `.env.example` — Example local Ollama and Google Drive settings
- `infra/` — API Gateway and Lambda Terraform configuration
