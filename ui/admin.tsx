import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from './api';
import type { ArticleItem, BatchStudy, Feed, FeedVerification } from './types';

type AdminProps = {
  languages: Array<{ code: string; name: string }>;
  onCollect: (language: string) => Promise<void>;
};

export function AdminPage({ languages, onCollect }: AdminProps) {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(languages[0]?.code ?? 'en');
  const [verification, setVerification] = useState<FeedVerification | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [study, setStudy] = useState<BatchStudy | null>(null);

  async function refresh() {
    const [feedResponse, articleResponse] = await Promise.all([
      api<{ feeds: Feed[] }>('/admin/feeds'),
      api<{ articles: ArticleItem[] }>('/admin/articles'),
    ]);
    setFeeds(feedResponse.feeds);
    setArticles(articleResponse.articles);
  }

  useEffect(() => {
    let active = true;
    Promise.all([
      api<{ feeds: Feed[] }>('/admin/feeds'),
      api<{ articles: ArticleItem[] }>('/admin/articles'),
    ])
      .then(([feedResponse, articleResponse]) => {
        if (!active) return;
        setFeeds(feedResponse.feeds);
        setArticles(articleResponse.articles);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : '관리자 데이터를 불러오지 못했습니다.');
      });
    return () => {
      active = false;
    };
  }, []);

  async function verifyUrl() {
    setBusy(true);
    setError('');
    setMessage('');
    setVerification(null);
    try {
      const result = await api<{ verification: FeedVerification }>('/admin/feeds/verify', {
        method: 'POST',
        body: JSON.stringify({ url }),
      });
      setVerification(result.verification);
      setMessage('RSS/Atom 피드를 확인했습니다. 아래에서 구독을 추가할 수 있어요.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '피드 주소 확인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function addSubscription(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ feed: Feed; verification: FeedVerification }>('/admin/feeds', {
        method: 'POST',
        body: JSON.stringify({ name, url, language }),
      });
      setFeeds((current) => [result.feed, ...current]);
      setUrl('');
      setName('');
      setVerification(result.verification);
      setMessage('피드를 구독 목록에 추가했습니다.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '피드를 추가하지 못했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function pollNow() {
    setBusy(true);
    setError('');
    setMessage('등록한 피드에서 새 글을 확인하고 있습니다.');
    try {
      const result = await api<{
        discovered_count: number;
        feed_count: number;
        duration_ms: number;
      }>('/admin/poll', { method: 'POST', body: JSON.stringify({ concurrency: 2 }) });
      setMessage(
        `${result.feed_count}개 피드 확인 완료 · 새 글 ${result.discovered_count}개 · ${result.duration_ms}ms`,
      );
      await refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '새 글 확인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function compareBatch() {
    setBusy(true);
    setError('');
    setMessage('동일한 피드 목록을 순차·병렬 방식으로 비교하고 있습니다.');
    setStudy(null);
    try {
      const result = await api<BatchStudy>('/admin/study', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      setStudy(result);
      setMessage('비교가 끝났습니다. 각 방식의 처리 시간과 실패 건수를 확인하세요.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '배치 비교에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function toggleFeed(feed: Feed) {
    setError('');
    try {
      const result = await api<{ feed: Feed }>(`/admin/feeds/${encodeURIComponent(feed.id)}`, {
        method: 'PUT',
        body: JSON.stringify({ enabled: !feed.enabled }),
      });
      setFeeds((current) => current.map((item) => (item.id === feed.id ? result.feed : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '구독 상태를 바꾸지 못했습니다.');
    }
  }

  async function verifyFeed(feed: Feed) {
    setBusy(true);
    setError('');
    setMessage(`${feed.name} RSS 주소를 확인하고 있습니다.`);
    try {
      await api(`/admin/feeds/${encodeURIComponent(feed.id)}/verify`, { method: 'POST' });
      await refresh();
      setMessage(`${feed.name} RSS 확인을 마쳤습니다. 이제 수집할 수 있습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'RSS 확인에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  async function deleteFeed(feed: Feed) {
    setError('');
    try {
      await api(`/admin/feeds/${encodeURIComponent(feed.id)}`, { method: 'DELETE' });
      setFeeds((current) => current.filter((item) => item.id !== feed.id));
      setArticles((current) => current.filter((item) => item.feed_id !== feed.id));
      setMessage(`“${feed.name}” 구독을 삭제했습니다.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : '구독을 삭제하지 못했습니다.');
    }
  }

  const newArticles = articles.filter((article) => article.status === 'new');
  const baselineArticles = articles.filter((article) => article.status === 'baseline');

  return (
    <section className="admin-page">
      <div className="admin-standalone-bar">
        <a className="ds-button ds-button-secondary" href="/">
          ← Daily Phrase
        </a>
        <span className="ds-eyebrow">PRIVATE WORKSPACE</span>
      </div>
      <header className="admin-header">
        <div>
          <div className="eyebrow muted">LOCAL FEED MANAGER</div>
          <h1>아티클 구독 관리</h1>
          <p>RSS 또는 Atom 주소를 등록하면 새 글을 확인해 오늘의 표현 후보로 모읍니다.</p>
        </div>
        <div className="admin-header-actions">
          <button
            className="admin-poll-button"
            disabled={busy || feeds.length === 0}
            onClick={compareBatch}
            type="button"
          >
            배치 비교
          </button>
          <button
            className="admin-poll-button"
            disabled={busy || feeds.length === 0}
            onClick={pollNow}
            type="button"
          >
            ↻ 새 글 확인
          </button>
        </div>
      </header>

      <div className="admin-local-note">
        <b>로컬 관리자</b>
        <span>구독 목록과 발견한 글은 이 컴퓨터의 JSON 파일에 저장됩니다.</span>
      </div>
      {message && <div className="admin-message">{message}</div>}
      {error && <div className="admin-error">{error}</div>}
      {study && (
        <section className="admin-card admin-study-card ds-surface">
          <div className="admin-card-title">
            <div>
              <span className="panel-kicker">BATCH CONCURRENCY STUDY</span>
              <h2>배치 처리 비교</h2>
            </div>
            <span className="admin-inbox-total">읽기 전용 · 피드 상태를 변경하지 않음</span>
          </div>
          <div className="admin-study-grid">
            {study.runs.map((run) => (
              <article className="admin-study-result" key={run.concurrency}>
                <b>동시성 {run.concurrency}</b>
                <span>{run.mean_duration_ms} ms 평균</span>
                <small>
                  p95 {run.p95_duration_ms} ms · {run.scans_per_second} scans/s
                </small>
                <small>
                  성공 {run.successful_scans} · 실패 {run.failed_scans}
                </small>
              </article>
            ))}
          </div>
          <p className="admin-help">
            네트워크 상태와 원격 피드 응답시간이 결과에 포함됩니다. 자세한 반복 측정은{' '}
            <code>npm run study:batch</code>를 사용하세요.
          </p>
        </section>
      )}

      <div className="admin-layout">
        <form className="admin-card admin-form ds-surface" onSubmit={addSubscription}>
          <div className="admin-card-title">
            <div>
              <span className="panel-kicker">NEW SUBSCRIPTION</span>
              <h2>아티클 소스 추가</h2>
            </div>
            <span className="admin-card-icon">＋</span>
          </div>
          <label>
            소스 URL
            <input
              autoComplete="url"
              placeholder="https://example.com/feed.xml 또는 블로그 주소"
              required
              type="url"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value);
                setVerification(null);
              }}
            />
          </label>
          <div className="admin-form-row">
            <label>
              표시 이름
              <input
                maxLength={100}
                placeholder="예: VOA Learning English"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label>
              학습 언어
              <select value={language} onChange={(event) => setLanguage(event.target.value)}>
                {languages.map((item) => (
                  <option value={item.code} key={item.code}>
                    {item.name} ({item.code})
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="admin-form-actions">
            <button
              className="admin-secondary-button"
              disabled={busy || !url}
              onClick={verifyUrl}
              type="button"
            >
              주소 확인
            </button>
            <button className="primary-button" disabled={busy || !url} type="submit">
              구독 추가 <b>↗</b>
            </button>
          </div>
          {verification && (
            <div className="verification-result">
              <b>확인됨 · {verification.entry_count}개 아티클 항목</b>
              <small>
                {verification.source_type} · {verification.url}
              </small>
              {verification.sample.map((item) => (
                <span key={item.url}>{item.title}</span>
              ))}
            </div>
          )}
          <p className="admin-help">
            RSS/Atom 주소를 직접 넣거나, 해당 피드가 연결된 블로그 페이지 주소를 넣으세요. 페이지에
            피드 자동 발견 정보가 있어야 합니다.
          </p>
        </form>

        <section className="admin-card ds-surface">
          <div className="admin-card-title">
            <div>
              <span className="panel-kicker">SUBSCRIBED SOURCES</span>
              <h2>
                구독 중인 소스 <small>{feeds.length}</small>
              </h2>
            </div>
          </div>
          {feeds.length === 0 ? (
            <p className="admin-empty">아직 등록된 소스가 없습니다. URL을 추가해 시작하세요.</p>
          ) : (
            <div className="admin-feed-list">
              {feeds.map((feed) => (
                <article className="admin-feed-row" key={feed.id}>
                  <span className="admin-feed-language">{feed.language.toUpperCase()}</span>
                  <div className="admin-feed-info">
                    <b>
                      {feed.name}
                      {feed.is_default ? ' · 기본 구독' : ''}
                    </b>
                    <a href={feed.rss_url} target="_blank" rel="noreferrer">
                      {feed.rss_url}
                    </a>
                    <small>
                      {!feed.verified
                        ? 'RSS 확인 필요'
                        : feed.last_error
                          ? `오류: ${feed.last_error.message}`
                          : feed.last_checked_at
                            ? `마지막 확인 ${new Date(feed.last_checked_at).toLocaleString()}`
                            : '아직 수집 전'}
                    </small>
                  </div>
                  <div className="admin-feed-actions">
                    {!feed.verified && (
                      <button disabled={busy} onClick={() => verifyFeed(feed)} type="button">
                        RSS 확인
                      </button>
                    )}
                    <button onClick={() => toggleFeed(feed)} type="button">
                      {feed.enabled ? '일시 중지' : '다시 구독'}
                    </button>
                    <button className="remove" onClick={() => deleteFeed(feed)} type="button">
                      삭제
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className="admin-card admin-inbox ds-surface">
        <div className="admin-card-title">
          <div>
            <span className="panel-kicker">DISCOVERED ARTICLES</span>
            <h2>
              새 글 보관함 <small>{newArticles.length}개 대기</small>
            </h2>
          </div>
          <span className="admin-inbox-total">전체 {articles.length}</span>
        </div>
        {newArticles.length === 0 ? (
          <p className="admin-empty">
            새 글이 없습니다. “새 글 확인”을 눌러 구독 피드를 확인하세요. 첫 확인은 현재 피드 항목을
            기준점으로 기록하고, 다음 확인부터 새 항목을 보관함에 넣습니다.
          </p>
        ) : (
          <div className="admin-article-list">
            {newArticles.slice(0, 100).map((article) => (
              <article className="admin-article-row" key={article.id}>
                <div className="admin-article-meta">
                  <span>{article.language.toUpperCase()}</span>
                  <b>{article.feed_name}</b>
                  <small>{article.published_at || article.discovered_at}</small>
                </div>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
                <button
                  className="collect-article-button"
                  onClick={() => onCollect(article.language)}
                  type="button"
                >
                  오늘의 표현으로 가져오기 <span>↗</span>
                </button>
              </article>
            ))}
          </div>
        )}
      </section>
      {baselineArticles.length > 0 && (
        <section className="admin-card admin-inbox ds-surface">
          <div className="admin-card-title">
            <div>
              <span className="panel-kicker">INITIAL IMPORT</span>
              <h2>
                초기 적재 기사 <small>{baselineArticles.length}개</small>
              </h2>
            </div>
            <span className="admin-inbox-total">새 기사 아님</span>
          </div>
          <p className="admin-help">
            기본 구독의 첫 수집에서 가져온 기존 기사입니다. 다음 수집부터 새 기사를 오늘의 표현
            후보로 표시합니다.
          </p>
          <div className="admin-article-list">
            {baselineArticles.slice(0, 100).map((article) => (
              <article className="admin-article-row" key={article.id}>
                <div className="admin-article-meta">
                  <span>{article.language.toUpperCase()}</span>
                  <b>{article.feed_name}</b>
                  <small>{article.published_at || article.discovered_at}</small>
                </div>
                <a href={article.url} target="_blank" rel="noreferrer">
                  {article.title}
                </a>
              </article>
            ))}
          </div>
        </section>
      )}
    </section>
  );
}
