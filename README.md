# Daily Phrase

Local-first Node.js 22 API scaffold for extracting short, source-grounded language learning phrases from verified RSS feeds. The same `handler` serves API Gateway REST API events and the local HTTP server.

## Run locally

```sh
npm install
```

Before requesting phrases, copy `.env.example` to `.env` and set `OPENAI_API_KEY` to an OpenAI API key available to your project. Keep `.env` private; it is ignored by Git. `OPENAI_MODEL` defaults to `gpt-6-astra` and can be changed to a model enabled for your API project.

```sh
npm run dev
```

Open `http://localhost:5173` for the React + Vite dashboard. The dev script starts both the API (`127.0.0.1:3000`) and Vite, and proxies `/api/*` to the API. Run `npm start` only when you want the API by itself. The API routes are `GET /api/health`, `GET /api/config`, `POST /api/phrases`, and `POST /api/phrases/daily`.

## React pages and routes

The React UI uses React Router. With `npm run dev` running, open these page URLs:

| Page         | URL                              | Purpose                                                                  |
| ------------ | -------------------------------- | ------------------------------------------------------------------------ |
| Daily Phrase | `http://localhost:5173/`         | Choose languages and study today's phrases.                              |
| Articles     | `http://localhost:5173/articles` | Browse discovered articles and open an article's original publication.   |
| Admin        | `http://localhost:5173/admin`    | Separate local workspace for feed subscriptions and collection controls. |

The learner sidebar only links to Daily Phrase and Articles. Admin is intentionally omitted from learner navigation and is opened directly at `/admin`; it renders without the learner sidebar or top bar. Unknown UI paths redirect to `/`. API endpoints remain under `/api/*` and are not React pages.

The UI is written in TypeScript. `ui/main.tsx` is only the browser entry point; `ui/App.tsx` owns routing, `ui/pages/` contains route-specific screens, `ui/components/` contains reusable interface pieces, `ui/hooks/` owns page data and interactions, `ui/api.ts` centralizes API requests, and `ui/types.ts` defines shared response types. Admin stays outside the learner navigation, and its API/state logic lives in `ui/hooks/useAdmin.ts`. Reusable component styles use Emotion in `ui/components/primitives.tsx`; shared visual tokens remain in `ui/design-system.css`, and page-specific layout rules remain in `ui/style.css`. Use the `--dp-*` tokens with Emotion primitives so colors, type, spacing, surfaces, controls, and focus states stay consistent. Run `npm run lint` or `npm run lint:fix` for ESLint, `npm run format` to format supported files with Prettier, and `npm run typecheck` to check the UI types. The project includes `.editorconfig` and `.vscode/settings.json` for local editor defaults and format-on-save.

The API and feed crawler use Node's HTTPS/TLS stack with certificate verification enabled. Local commands enable Node's system CA support through `NODE_USE_SYSTEM_CA=1`, which trusts certificates installed in the Windows or macOS system keychain and requires Node.js 22.19 or newer. For a private company proxy CA, install the approved root certificate in the system trust store; do not disable TLS certificate checks.

The dashboard can request a daily collection and study phrases one at a time with pronunciation, hidden/revealed meanings, and previous/next controls. When generating phrases, the API fetches article text temporarily, sends it to OpenAI with response storage disabled, validates that phrases and context sentences occur in the source, and returns only the phrases plus article metadata. Full article text and RSS preview descriptions are not stored or shown in the app. The Articles page lists titles and links to publications. The Admin view lets you add, verify, pause, and remove RSS/Atom subscriptions. It can scan feeds on demand, and the new-article inbox is used as the source queue for daily phrase requests. The first scan establishes a baseline; subsequent scans add unseen articles.

`npm run batch:poll` runs a one-time poll. `npm run crawler` runs a local polling loop (default 15 minutes; set `CRAWL_INTERVAL_SECONDS` to change it). `npm run study:batch` compares polling concurrency 1, 2, and 4 over configured subscriptions and saves a read-only report under `results/`. The Admin comparison button runs one sample per concurrency level. These timings include network conditions and are a learning benchmark, not a cloud batch-service benchmark.

Subscriptions and the article inbox are stored in ignored local files (`data/subscriptions.json`, `data/articles.json`). Admin endpoints are enabled only by the local API process. This prototype does not synchronize settings to AWS or provide authentication. See [open questions](docs/open-questions.md) and [admin/crawler questions](docs/open-questions-admin.md).

## Configuration

- `config/languages.json` is the source of language codes and phrase length rules.
- `config/feeds.json` contains optional project-managed feed records. It is intentionally empty.
- `data/subscriptions.json` and `data/articles.json` are local, ignored state managed by the Admin view and crawler.
- Admin accepts RSS/Atom URLs or website URLs that advertise an RSS/Atom feed using HTML autodiscovery. It does not scrape arbitrary website pages without a feed.
- `MAX_INPUT_CHARS`, `MAX_FETCH_BYTES`, `FETCH_TIMEOUT_MS`, and `DAILY_CONCURRENCY` can be set in the environment.
- `OPENAI_API_KEY`, `OPENAI_MODEL`, and `OPENAI_TIMEOUT_MS` configure phrase extraction. The API uses OpenAI's Responses API with `store: false`.

The app enables Node's system certificate store for HTTPS. `EACCES`/`EPERM` means the operating system or execution environment denied outbound networking; changing TLS settings cannot fix that permission. If it recurs, start `npm run dev` in a terminal that has outbound HTTPS access and allow that Node process through local endpoint/firewall controls. The API reports denied network access separately from TLS certificate errors.

## Local commands

`npm run quality` checks the 20 input cases once they are populated. `npm run baseline` and `npm run load` currently exercise the local handler and write JSON under `results/`; these are harness smoke measurements, not AWS Lambda performance results. `npm run build` packages `src/` and `config/` into `dist/lambda.zip` using Windows `tar` ZIP support.

Terraform files are an un-applied deployment scaffold. Do not run `deploy` or `destroy` until the open deployment questions are answered and a reviewed plan is available.
