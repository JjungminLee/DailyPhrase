import { StrictMode, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { AdminPage } from './admin';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import './style.css';

type LanguageConfig = {
  code: string;
  name: string;
  phrase_unit: 'words' | 'chars';
  min: number;
  max: number;
  level_scale: string;
};

type ConfigResponse = {
  request_id: string;
  default_languages: string[];
  languages: LanguageConfig[];
};

type HealthResponse = {
  request_id: string;
  status: string;
  version: string;
  languages: string[];
  init_ms: number;
};

type Phrase = {
  text: string;
  meaning_ko: string;
  context_sentence: string;
  level: string;
  note_ko?: string;
};

type ArticleSource = {
  feed_id: string;
  title: string;
  url: string;
  published_at: string | null;
};

type LanguageResult = {
  language: string;
  source?: ArticleSource;
  phrases: Phrase[];
};

type DailyResponse = {
  request_id: string;
  date: string;
  results: Record<string, LanguageResult>;
  errors: Array<{ language: string; type: string; message: string }>;
};

type ArticleItem = {
  id: string;
  feed_name: string;
  language: string;
  title: string;
  url: string;
  published_at: string | null;
  discovered_at: string;
  status: 'new' | 'processed' | 'baseline';
};

type ApiError = Error & { payload?: unknown; status?: number };

const languageMeta: Record<string, { flag: string; label: string; subtitle: string }> = {
  en: { flag: '🇺🇸', label: 'English', subtitle: '영어' },
  zh: { flag: '🇨🇳', label: '中文', subtitle: '중국어' },
  fr: { flag: '🇫🇷', label: 'Français', subtitle: '프랑스어' },
  ja: { flag: '🇯🇵', label: '日本語', subtitle: '일본어' },
};

function seoulDate(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

async function api<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...options?.headers },
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload !== null && 'error' in payload
        ? String((payload.error as { message?: string }).message || '요청에 실패했습니다.')
        : '요청에 실패했습니다.';
    const error: ApiError = Object.assign(new Error(message), {
      payload,
      status: response.status,
    });
    throw error;
  }
  return payload as T;
}

function App() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [perLanguage, setPerLanguage] = useState(5);
  const [date, setDate] = useState(seoulDate);
  const [result, setResult] = useState<DailyResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');

  useEffect(() => {
    Promise.all([api<ConfigResponse>('/config'), api<HealthResponse>('/health')])
      .then(([configuration, status]) => {
        setConfig(configuration);
        setHealth(status);
        setSelected(configuration.default_languages);
      })
      .catch((error: unknown) =>
        setLoadError(error instanceof Error ? error.message : 'API 연결에 실패했습니다.'),
      );
  }, []);

  const phraseCount = useMemo(
    () =>
      Object.values(result?.results ?? {}).reduce((total, item) => total + item.phrases.length, 0),
    [result],
  );

  const toggleLanguage = (code: string) => {
    setSelected((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  };

  const loadDaily = async (requestedLanguages = selected) => {
    setLoading(true);
    setLoadError('');
    setResult(null);
    try {
      const data = await api<DailyResponse>('/phrases/daily', {
        method: 'POST',
        body: JSON.stringify({ languages: requestedLanguages, per_language: perLanguage, date }),
      });
      setResult(data);
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : '표현을 불러오지 못했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand-mark" href="#top" aria-label="Daily Phrase 홈">
          <span>dp</span>
          <i>✦</i>
        </a>
        <div className="rail-divider" />
        <button
          className={`rail-button ${pathname === '/' ? 'active' : ''}`}
          onClick={() => navigate('/')}
          aria-label="오늘의 표현"
          title="오늘의 표현"
          type="button"
        >
          <span>✎</span>
        </button>
        <button className={`rail-button ${pathname === '/articles' ? 'active' : ''}`} aria-label="Articles" title="Articles" onClick={() => navigate('/articles')} type="button">
          <span>◉</span>
        </button>
        <button className="rail-button" aria-label="Settings" title="설정" type="button">
          <span>⚙</span>
        </button>
        <div className="rail-spacer" />
        <button
          className={`rail-button ${pathname === '/admin' ? 'active' : ''}`}
          aria-label="Admin"
          title="Admin"
          onClick={() => navigate('/admin')}
          type="button"
        >
          <span>⚙</span>
        </button>
        <div className="rail-spacer" />
        <span className="rail-avatar">J</span>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumb">
            <span>WORKSPACE</span>
            <b>/</b>
            <strong>DAILY PHRASE</strong>
          </div>
          <div className="topbar-right">
            <div className={`api-status ${health ? 'online' : 'offline'}`}>
              <span />
              {health ? 'LOCAL API ONLINE' : 'CONNECTING API'}
            </div>
            <span className="top-date">
              {new Intl.DateTimeFormat('ko-KR', {
                dateStyle: 'medium',
                timeZone: 'Asia/Seoul',
              }).format(new Date())}
            </span>
          </div>
        </header>

        <Routes>
          <Route
            path="/"
            element={
              <>
                <section className="hero-row">
                  <div>
                    <div className="eyebrow">
                      <span className="eyebrow-line" /> YOUR DAILY LANGUAGE RITUAL
                    </div>
                    <h1>
                      오늘의 표현,
                      <br />
                      <em>가볍게 모아봐요.</em>
                    </h1>
                    <p className="hero-copy">
                      실제 아티클에서 발견한 짧은 표현을 모아
                      <br className="desktop-break" /> 오늘의 언어 감각을 채워보세요.
                    </p>
                  </div>
                  <div className="hero-stamp">
                    <div className="stamp-spark">✳</div>
                    <span>ONE DAY</span>
                    <b>
                      ONE
                      <br />
                      PHRASE
                      <br />
                      AT A TIME
                    </b>
                  </div>
                </section>

                <section className="stat-grid" aria-label="오늘의 요약">
                  <article className="stat-card">
                    <div className="stat-top">
                      <span>선택한 언어</span>
                      <span className="stat-icon mint">文</span>
                    </div>
                    <strong>
                      {String(selected.length).padStart(2, '0')}
                      <small> 개</small>
                    </strong>
                    <div className="stat-foot">오늘 학습할 언어</div>
                  </article>
                  <article className="stat-card">
                    <div className="stat-top">
                      <span>오늘의 표현</span>
                      <span className="stat-icon peach">✦</span>
                    </div>
                    <strong>
                      {String(phraseCount).padStart(2, '0')}
                      <small> 개</small>
                    </strong>
                    <div className="stat-foot">
                      {result ? '요청 결과 기준' : '아직 불러오지 않았어요'}
                    </div>
                  </article>
                  <article className="stat-card">
                    <div className="stat-top">
                      <span>사용 가능한 소스</span>
                      <span className="stat-icon lilac">◎</span>
                    </div>
                    <strong>
                      {String(health?.languages.length ?? 0).padStart(2, '0')}
                      <small> 개 언어</small>
                    </strong>
                    <div className="stat-foot">검증된 피드 기준</div>
                  </article>
                </section>

                <section className="workspace-grid">
                  <div className="results-column">
                    <div className="section-heading">
                      <div>
                        <div className="eyebrow muted">
                          DAILY COLLECTION <span className="tiny-dot" />
                        </div>
                        <h2>오늘의 phrase</h2>
                      </div>
                      <span className="collection-date">{date}</span>
                    </div>
                    {loading && (
                      <div className="notice loading-notice">
                        <span className="spinner" /> 최신 표현을 모으고 있어요.
                      </div>
                    )}
                    {loadError && (
                      <div className="notice error-notice">
                        <span>!</span>
                        <div>
                          <b>API 연결을 확인해 주세요</b>
                          <p>{loadError}</p>
                          <small>API 서버가 실행 중인지 확인해 주세요.</small>
                        </div>
                      </div>
                    )}
                    {result &&
                      Object.keys(result.results).length === 0 &&
                      result.errors.length > 0 && (
                        <div className="empty-card">
                          <div className="empty-icon">✧</div>
                          <div className="eyebrow muted">FEEDS ARE NOT READY YET</div>
                          <h3>피드 설정을 기다리고 있어요</h3>
                          <p>
                            API는 응답했지만 선택한 언어에 활성화된 검증 피드가 없습니다. 피드를
                            등록하면 실제 아티클 표현을 여기에서 확인할 수 있어요.
                          </p>
                          <div className="empty-steps">
                            <span>
                              01 <b>피드 주소 검증</b>
                            </span>
                            <span>
                              02 <b>활성 피드 선택</b>
                            </span>
                            <span>
                              03 <b>표현 불러오기</b>
                            </span>
                          </div>
                        </div>
                      )}
                    {result &&
                      Object.entries(result.results).map(([code, data]) => (
                        <PhraseGroup key={code} code={code} data={data} />
                      ))}
                    {result?.errors.map((error) => {
                      const meta = languageMeta[error.language];
                      return (
                        <div className="language-error" key={error.language}>
                          <span>{meta?.flag ?? '🌐'}</span>
                          <div>
                            <b>{meta?.label ?? error.language} 소스를 사용할 수 없어요</b>
                            <small>
                              {error.type} · {error.message}
                            </small>
                          </div>
                        </div>
                      );
                    })}
                    {!result && !loading && !loadError && (
                      <div className="empty-card intro-empty">
                        <div className="empty-icon">✧</div>
                        <div className="eyebrow muted">A SMALL DAILY PRACTICE</div>
                        <h3>첫 번째 컬렉션을 만들어보세요</h3>
                        <p>
                          오른쪽에서 언어와 날짜를 고른 뒤 버튼을 누르면
                          <br /> 오늘의 표현을 불러옵니다.
                        </p>
                      </div>
                    )}
                    <footer className="main-footer">
                      <span>MADE FOR CURIOUS MINDS</span>
                      <span>
                        DAILY PHRASE <b>✦</b> 2026
                      </span>
                    </footer>
                  </div>

                  <aside className="control-panel">
                    <div className="panel-heading">
                      <div>
                        <span className="panel-kicker">COLLECTION SETUP</span>
                        <h2>
                          어떤 표현을
                          <br /> 모아볼까요?
                        </h2>
                      </div>
                      <span className="panel-spark">✳</span>
                    </div>
                    <div className="field-block">
                      <div className="field-label">
                        <span>언어 선택</span>
                        <small>{selected.length} SELECTED</small>
                      </div>
                      <div className="language-list">
                        {(config?.languages ?? []).map((language) => {
                          const meta = languageMeta[language.code] ?? {
                            flag: '🌐',
                            label: language.name,
                            subtitle: language.name,
                          };
                          const isSelected = selected.includes(language.code);
                          return (
                            <button
                              key={language.code}
                              className={`language-option ${isSelected ? 'chosen' : ''}`}
                              onClick={() => toggleLanguage(language.code)}
                              type="button"
                            >
                              <span className="language-flag">{meta.flag}</span>
                              <span className="language-name">
                                <b>{meta.label}</b>
                                <small>{meta.subtitle}</small>
                              </span>
                              <span className="language-check">{isSelected ? '✓' : ''}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                    <div className="field-row">
                      <label className="field-block">
                        <span className="field-label">
                          날짜 <small>SEOUL TIME</small>
                        </span>
                        <input
                          type="date"
                          value={date}
                          onChange={(event) => setDate(event.target.value)}
                        />
                      </label>
                      <label className="field-block count-field">
                        <span className="field-label">언어별 표현 수</span>
                        <select
                          value={perLanguage}
                          onChange={(event) => setPerLanguage(Number(event.target.value))}
                        >
                          {[3, 5, 10, 15, 20].map((count) => (
                            <option value={count} key={count}>
                              {count}개
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                    <button
                      className="primary-button"
                      disabled={loading || selected.length === 0}
                      onClick={() => loadDaily()}
                      type="button"
                    >
                      {loading ? (
                        '불러오는 중…'
                      ) : (
                        <>
                          <span>오늘의 표현 불러오기</span>
                          <b>↗</b>
                        </>
                      )}
                    </button>
                    <div className="panel-note">
                      <span>i</span>
                      <p>
                        선택한 언어의 최신 아티클에서 표현을 가져옵니다. 피드가 준비되지 않은 언어는
                        오류로 표시돼요.
                      </p>
                    </div>
                    <div className="panel-bottom">
                      <span>API REQUEST</span>
                      <code>POST /api/phrases/daily</code>
                    </div>
                  </aside>
                </section>
              </>
            }
          />
          <Route path="/articles" element={<ArticleLibrary />} />
          <Route
            path="/admin"
            element={
              <AdminPage
                languages={config?.languages ?? []}
                onCollect={async (language) => {
                  setSelected([language]);
                  navigate('/');
                  await loadDaily([language]);
                }}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

function PhraseGroup({ code, data }: { code: string; data: LanguageResult }) {
  const meta = languageMeta[code] ?? { flag: '🌐', label: code, subtitle: code };
  const [activeIndex, setActiveIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(true);
  const [saved, setSaved] = useState(false);
  const phrase = data.phrases[activeIndex];
  if (!phrase) return null;

  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase.text);
    utterance.lang = code === 'zh' ? 'zh-CN' : code === 'ja' ? 'ja-JP' : code === 'fr' ? 'fr-FR' : 'en-US';
    window.speechSynthesis.speak(utterance);
  };

  return (
    <section className="phrase-group">
      <div className="study-shell">
        <header className="study-toolbar">
          <span className="study-language">{meta.flag} <b>{meta.label}</b></span>
          <span className="study-progress">{activeIndex + 1}<i>/</i>{data.phrases.length}</span>
          <div className="study-actions">
            <button type="button" onClick={speak} aria-label="Listen to phrase" title="Listen">🔊</button>
            <button type="button" onClick={() => setSaved((value) => !value)} aria-label="Save phrase" title="Save phrase">{saved ? '★' : '☆'}</button>
          </div>
        </header>
        {data.source && (
          <a className="study-source" href={data.source.url} target="_blank" rel="noreferrer">
            <span className="study-source-label">TODAY'S ARTICLE · {data.source.feed_id}</span>
            <strong>{data.source.title}</strong>
            <span className="study-source-link">Read original ↗</span>
          </a>
        )}
        <div className="study-word">
          <div className="phrase-card-top"><span>PHRASE {String(activeIndex + 1).padStart(2, '0')}</span><span className="level-pill">{phrase.level}</span></div>
          <h2>{phrase.text}</h2>
          <div className="study-meaning-row"><span>{meta.label}</span><span className="study-pronunciation">Tap the speaker to listen</span></div>
          {showMeaning && <p className="study-translation">{phrase.meaning_ko}</p>}
        </div>
        <article className="study-example">
          <span className="study-card-label">IN CONTEXT</span>
          <p>{phrase.context_sentence}</p>
          {phrase.note_ko && <small>{phrase.note_ko}</small>}
        </article>
        <div className="study-bottom-card">
          {showMeaning && <div className="study-related"><span>표현을 다시 읽고 소리 내어 익혀보세요.</span><span>{phrase.text}</span></div>}
          <div className="study-controls">
            <button type="button" onClick={() => setShowMeaning((value) => !value)}>{showMeaning ? '뜻 숨기기' : '뜻 보기'}</button>
            <button className={`study-save ${saved ? 'is-saved' : ''}`} type="button" onClick={() => setSaved((value) => !value)}>{saved ? '★ 저장됨' : '☆ 저장'}</button>
            <div className="study-pager">
              <button type="button" disabled={activeIndex === 0} onClick={() => setActiveIndex((index) => index - 1)}>이전</button>
              <button type="button" disabled={activeIndex === data.phrases.length - 1} onClick={() => setActiveIndex((index) => index + 1)}>다음 표현 →</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ArticleLibrary() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [selected, setSelected] = useState<ArticleItem | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ articles: ArticleItem[] }>('/admin/articles')
      .then(({ articles: items }) => setArticles(items))
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : '아티클을 불러오지 못했습니다.'));
  }, []);

  return (
    <section className="article-library">
      <div className="article-library-heading">
        <span className="eyebrow"><span className="eyebrow-line" /> YOUR READING LIST</span>
        <h1>오늘의 아티클</h1>
        <p>구독 중인 소스에서 모은 새 글을 읽고, 문맥 속 표현을 발견해 보세요.</p>
      </div>
      {error && <div className="notice error-notice">{error}</div>}
      {selected ? (
        <article className="article-reader">
          <button className="article-back" type="button" onClick={() => setSelected(null)}>← 아티클 목록</button>
          <span className="article-source-name">{selected.feed_name} · {selected.language.toUpperCase()}</span>
          <h2>{selected.title}</h2>
          <p>원문은 발행 사이트에서 확인할 수 있습니다.</p>
          <a className="primary-button article-open" href={selected.url} target="_blank" rel="noreferrer">원문 읽기 ↗</a>
          <small>{selected.published_at || selected.discovered_at}</small>
        </article>
      ) : (
        <div className="article-library-grid">
          {articles.map((article) => (
            <button className="article-tile" type="button" key={article.id} onClick={() => setSelected(article)}>
              <span className="article-tile-meta">{article.feed_name}<i>{article.language.toUpperCase()}</i></span>
              <strong>{article.title}</strong>
              <span className="article-tile-footer">{article.published_at || article.discovered_at}<b>읽기 →</b></span>
            </button>
          ))}
          {!articles.length && !error && <div className="article-empty">아티클을 불러오는 중이거나 아직 수집된 글이 없습니다.</div>}
        </div>
      )}
    </section>
  );
}
const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Root element #root was not found.');

createRoot(rootElement).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
