import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ArticleItem, Phrase } from '../types';

type ArticlePhraseResponse = { phrases: Phrase[] };

export function ArticleLibraryPage() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [selected, setSelected] = useState<ArticleItem | null>(null);
  const [phrases, setPhrases] = useState<Phrase[]>([]);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api<{ articles: ArticleItem[] }>('/admin/articles')
      .then(({ articles: items }) => {
        if (active) setArticles(items);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(reason instanceof Error ? reason.message : '아티클을 불러오지 못했습니다.');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    setPhrases([]);
    setExtractError('');
    setExtracting(true);

    api<ArticlePhraseResponse>('/phrases', {
      method: 'POST',
      body: JSON.stringify({
        feed_id: selected.feed_id,
        article_url: selected.url,
        max_phrases: 6,
        purpose: 'article_detail',
      }),
    })
      .then((result) => {
        if (active) setPhrases(result.phrases);
      })
      .catch((reason: unknown) => {
        if (active)
          setExtractError(
            reason instanceof Error ? reason.message : '표현을 추출하지 못했습니다.',
          );
      })
      .finally(() => {
        if (active) setExtracting(false);
      });

    return () => {
      active = false;
    };
  }, [selected, retryCount]);

  return (
    <section className="article-library">
      <div className="article-library-heading">
        <span className="eyebrow">
          <span className="eyebrow-line" /> YOUR READING LIST
        </span>
        <h1>오늘의 아티클</h1>
        <p>구독 중인 소스에서 모은 글을 읽고, 문맥 속 표현을 발견해 보세요.</p>
      </div>
      {error && <div className="notice error-notice">{error}</div>}
      {selected ? (
        <article className="article-reader ds-surface">
          <button className="article-back" type="button" onClick={() => setSelected(null)}>
            ← 아티클 목록
          </button>
          <span className="article-source-name">
            {selected.feed_name} · {selected.language.toUpperCase()}
          </span>
          <h2>{selected.title}</h2>
          <a
            className="primary-button article-open"
            href={selected.url}
            target="_blank"
            rel="noreferrer"
          >
            원문 읽기 ↗
          </a>
          <small>{selected.published_at || selected.discovered_at}</small>
          <section className="article-expressions" aria-live="polite">
            <div className="article-expressions-heading">
              <div>
                <span className="eyebrow">
                  <span className="eyebrow-line" /> NATIVE EXPRESSIONS
                </span>
                <h3>이 아티클에서 배우는 자주 쓰는 표현</h3>
                <p>모델이 원문을 읽고 실제 원어민이 자주 쓰는 자연스러운 표현을 골랐어요.</p>
              </div>
              {!extracting && (
                <button
                  className="article-retry"
                  type="button"
                  onClick={() => setRetryCount((count) => count + 1)}
                >
                  다시 추출
                </button>
              )}
            </div>
            {extracting && (
              <p className="article-expression-state" role="status">
                아티클을 읽고 표현을 고르는 중이에요…
              </p>
            )}
            {extractError && (
              <div className="article-expression-error" role="alert">
                <p>{extractError}</p>
                <small>원문이 공개되어 있고 로컬 Ollama가 실행 중인지 확인한 뒤 다시 시도해 주세요.</small>
              </div>
            )}
            {!extracting && !extractError && phrases.length === 0 && (
              <p className="article-expression-state">
                원문에서 학습하기 좋은 표현을 찾지 못했어요. 다시 추출해 볼 수 있어요.
              </p>
            )}
            {phrases.length > 0 && (
              <div className="article-expression-list">
                {phrases.map((phrase) => (
                  <article className="article-expression-card" key={phrase.text}>
                    <div className="article-expression-card-heading">
                      <h4>{phrase.text}</h4>
                      <span>{phrase.level}</span>
                    </div>
                    <p className="article-expression-meaning">{phrase.meaning_ko}</p>
                    <blockquote>{phrase.context_sentence}</blockquote>
                    {phrase.note_ko && <small>{phrase.note_ko}</small>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </article>
      ) : (
        <div className="article-library-grid">
          {articles.map((article) => (
            <button
              className="article-tile ds-surface"
              type="button"
              key={article.id}
              onClick={() => setSelected(article)}
            >
              <span className="article-tile-meta">
                {article.feed_name}
                <i>{article.language.toUpperCase()}</i>
              </span>
              <strong>{article.title}</strong>
              <span className="article-tile-footer">
                {article.published_at || article.discovered_at}
                <b>읽기 →</b>
              </span>
            </button>
          ))}
          {!articles.length && !error && (
            <div className="article-empty">
              아티클을 불러오는 중이거나 아직 수집된 글이 없습니다.
            </div>
          )}
        </div>
      )}
    </section>
  );
}
