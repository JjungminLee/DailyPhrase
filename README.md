# Daily Phrase 🌱

[한국어](README.md) | [English](README.en.md)

### A little practice, every day.

Windows에서 Intel 내장 GPU 가속을 설정하는 방법은 [Ollama GPU 가속 안내](docs/ollama-gpu.md)를 참고하세요.

![alt text](readme_image.png)

아티클을 읽으며 만난 표현을 매일 조금씩 공부하는 언어 학습 앱입니다. 원문에 실제로 나온 자연스러운 표현을 로컬 Ollama 모델이 골라 주고, 문맥과 한국어 뜻을 함께 보여줍니다.

## 이런 걸 할 수 있어요

- **오늘의 표현** — English, 中文, Français, 日本語 중 공부할 언어와 표현 수를 고르고 학습합니다.
- **원문에 근거한 표현** — 모델이 고른 표현이 기사 본문에 있는지 검증하고, 원문 문장을 문맥으로 보여줍니다.
- **중국어 병음** — 중국어 표현과 함께 성조가 표시된 병음을 확인합니다.
- **일본어 읽기** — 한자가 포함된 표현에 히라가나 또는 가타카나 발음을 표시합니다.
- **아티클 보관함** — 수집된 글을 열고 표현을 살펴봅니다. 상세 화면은 새 탭으로도 열 수 있습니다.
- **학습 기록** — 공부한 아티클과 표현을 Google Drive에 저장하고 네비게이션 메뉴에서 다시 확인합니다.
- **본문 직접 붙여넣기** — 원문 사이트에서 기사를 가져오지 못하면 본문을 붙여넣어 로컬 모델로 표현을 추출할 수 있습니다. 입력한 본문은 저장하지 않습니다.
- **피드 설정** — 톱니바퀴에서 `/admin`으로 이동해 RSS/Atom 피드를 추가하고 확인합니다.

## 화면

| 화면          | 주소                   | 설명                         |
| ------------- | ---------------------- | ---------------------------- |
| 오늘의 표현   | `/`                    | 언어와 표현 수를 선택해 학습 |
| 아티클 보관함 | `/articles`            | 수집된 기사 목록             |
| 아티클 상세   | `/articles/:articleId` | 원문 링크와 표현 추출        |
| 학습 기록     | `/studied`             | Drive에 저장한 아티클과 표현 |
| 피드 설정     | `/admin`               | 피드 등록, 확인, 수집 관리   |

## 시작하기

필요한 것: Node.js 22.19 이상, [Ollama](https://ollama.com/)와 로컬에서 실행할 모델.

```sh
npm install
ollama pull qwen3.5:9b
ollama pull qwen3.5:4b
```

환경 파일을 만들고 로컬 Ollama 설정을 확인합니다.

```sh
Copy-Item .env.example .env
```

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_MODEL=qwen3.5:9b
OLLAMA_ARTICLE_MODEL=qwen3.5:4b
OLLAMA_TITLE_MODEL=qwen3.5:4b
MODEL_TIMEOUT_MS=120000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
# Register this exact URI as an authorized redirect URI in Google Cloud OAuth settings.
GOOGLE_REDIRECT_URI=http://localhost:3000/api/drive/callback
```

Google Drive 설정은 선택 사항입니다. 학습 기록을 사용하지 않으면 인증 값을 비워 두세요. Google OAuth 설정 방법은 아래의 학습 기록 절을 참고하세요.

앱을 시작하면 로컬 Ollama API가 이미 실행 중인지 확인합니다. 꺼져 있으면 `ollama serve`로 시작합니다. macOS에서는 Ollama가 Apple GPU를 Metal로 자동 사용하므로 별도의 Vulkan 설정은 필요하지 않습니다.

```sh
npm run dev
```

앱은 [http://localhost:5173](http://localhost:5173), API 상태 확인은 [http://localhost:3000/api/health](http://localhost:3000/api/health)에서 할 수 있습니다. 개발 명령 하나로 로컬 API와 Vite 프론트엔드가 함께 실행됩니다. `.env`에는 비밀 값을 넣을 수 있으므로 Git에 커밋하지 마세요.

### 모델 선택

- `OLLAMA_MODEL`은 오늘의 표현 생성에 사용하는 기본 로컬 모델입니다.
- `OLLAMA_ARTICLE_MODEL`은 아티클 상세 표현 추출에 사용하는 로컬 모델입니다. 기본값은 더 가벼운 `qwen3.5:4b`입니다.
- `OLLAMA_TITLE_MODEL`은 아티클 제목 번역과 발음 표시에 사용할 모델입니다. 더 빠른 모델이 설치되어 있다면 이 설정만 바꿔 성능과 결과를 비교할 수 있습니다. 기본값은 `OLLAMA_ARTICLE_MODEL`입니다.
- Kimi 등 다른 Ollama 모델을 사용하려면 Ollama에서 해당 모델을 먼저 내려받고 `OLLAMA_MODEL` 또는 `OLLAMA_ARTICLE_MODEL`을 설치된 모델 태그로 설정하세요.
- 모델 다운로드는 디스크 공간을 사용하지만, 로컬 Ollama 추론에는 모델 API 종량 요금이 발생하지 않습니다. 전력과 메모리 사용은 컴퓨터 환경에 따라 달라집니다.

## 모델 품질 개선 스터디

현재 스터디는 AWS 배포 대신 로컬 Ollama에서 언어 학습용 오픈웨이트 모델의 품질을 비교하고 개선하는 데 집중합니다. 먼저 Qwen과 프롬프트 버전을 고정하고, 영어·중국어·프랑스어·일본어의 검수된 평가 예시에서 기준선을 측정합니다. 학습 예시는 평가셋과 분리하고, LoRA 어댑터를 적용한 결과를 같은 조건으로 비교합니다. 품질과 추론 지연·메모리는 별도 지표로 기록합니다. [8주 계획](Study.md)과 [3주차 스터디 이슈](https://github.com/JjungminLee/DailyPhrase/issues/7)를 참고하세요.

## 피드와 본문 처리

피드는 RSS/Atom URL 또는 피드를 공개하는 웹사이트 URL로 등록합니다. 일반 웹페이지를 무차별 크롤링하지 않습니다. 아티클 본문은 표현 추출 중에만 가져오며, 본문과 RSS 미리보기 텍스트는 앱 데이터로 저장하지 않습니다. 원문 사이트가 접근 확인 페이지를 반환하면 추출을 멈추고, 사용자가 본문을 복사해 붙여넣을 수 있도록 안내합니다.

피드 설정은 로컬 `data/subscriptions.json`에, 그날 수집한 아티클은 `data/articles.json`에 저장됩니다. 매일 서울 시간 기준으로 앱에 처음 접속할 때 수집하며, 다음 날짜의 첫 수집 전에 이전 아티클 목록을 비웁니다. 저장한 학습 기록은 Google Drive의 앱 전용 영역에 보관되고, OAuth 토큰은 Git에서 제외된 `data/google-drive-auth.json`에 저장됩니다.

## 유용한 명령

| 명령                  | 용도                               |
| --------------------- | ---------------------------------- |
| `npm run dev`         | 로컬 API와 프론트엔드 실행         |
| `npm run build`       | 프론트엔드 빌드 |
| `npm run lint`        | ESLint 검사                        |
| `npm run typecheck`   | TypeScript 검사                    |
| `npm run batch:poll`  | 피드 한 번 수집                    |
| `npm run crawler`     | 설정된 간격으로 피드 수집          |
| `npm run study:batch` | 피드 수집 동시성 측정              |

## 설정 파일

- `config/languages.json` — 언어별 표현 길이 및 난이도 규칙
- `config/feeds.json` — 선택적 프로젝트 기본 피드
- `.env.example` — 로컬 Ollama 설정 예시

## 매일 수집과 학습 기록

매일 서울 시간 기준으로 앱에 처음 접속하면 피드 글을 수집합니다. API 서버를 켜기만 해서는 수집하지 않습니다. 컴퓨터가 하루 종일 꺼져 있어도 이후 앱을 열면 그날 수집하고, 같은 날 다시 방문하거나 서버를 재시작해도 다시 수집하지 않습니다. 다음 날짜의 첫 수집 전에 로컬 아티클 목록을 비우며, Google Drive에 저장한 학습 기록은 유지됩니다.

학습 기록을 사용하려면 Google Cloud에서 OAuth 웹 클라이언트를 만들고 Google Drive API를 활성화한 다음, 승인된 리디렉션 URI에 `http://localhost:3000/api/drive/callback`을 추가합니다. 클라이언트 ID와 보안 비밀을 `.env`의 `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`에 입력하고 `GOOGLE_REDIRECT_URI=http://localhost:3000/api/drive/callback`으로 설정한 뒤 앱을 재시작합니다. 네비게이션의 학습 기록 메뉴에서 Google Drive를 연결할 수 있습니다. 학습 기록은 Drive의 비공개 `appDataFolder`에 저장됩니다. 현재 Google Drive 연동은 로컬 개발 API에서 지원됩니다.
