import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { ArticleItem, Phrase } from '../types';

type ArticlePhraseResponse = { phrases: Phrase[] };

export function ArticleLibraryPage() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [articlesLoaded, setArticlesLoaded] = useState(false);
  const [phraseResult, setPhraseResult] = useState<{ key: string; phrases: Phrase[] } | null>(null);
  const [extractFailure, setExtractFailure] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [completedRequest, setCompletedRequest] = useState('');
  const [manualArticleText, setManualArticleText] = useState<{
    articleId: string;
    text: string;
  } | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { articleId } = useParams();
  const selected = articles.find((article) => article.id === articleId) ?? null;
  const requestKey = selected ? `${selected.id}:${retryCount}` : '';
  const pastedText =
    manualArticleText && selected && manualArticleText.articleId === selected.id
      ? manualArticleText.text
      : '';
  const phrases = phraseResult?.key === requestKey ? phraseResult.phrases : [];
  const extractError = extractFailure?.key === requestKey ? extractFailure.message : '';
  const extracting = Boolean(requestKey && completedRequest !== requestKey) || manualSubmitting;

  useEffect(() => {
    let active = true;
    api<{ articles: ArticleItem[] }>('/admin/articles')
      .then(({ articles: items }) => {
        if (active) {
          setArticles(items);
          setArticlesLoaded(true);
        }
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
    const key = `${selected.id}:${retryCount}`;

    api<ArticlePhraseResponse>('/phrases', {
      method: 'POST',
      body: JSON.stringify({
        feed_id: selected.feed_id,
        article_url: selected.url,
        article_title: selected.title,
        max_phrases: 6,
        purpose: 'article_detail',
      }),
    })
      .then((result) => {
        if (active) setPhraseResult({ key, phrases: result.phrases });
      })
      .catch((reason: unknown) => {
        if (active)
          setExtractFailure({
            key,
            message: reason instanceof Error ? reason.message : 'Extraction failed.',
          });
      })
      .finally(() => {
        if (active) setCompletedRequest(key);
      });

    return () => {
      active = false;
    };
  }, [selected, retryCount]);

  async function extractPastedText() {
    if (!selected || !pastedText.trim()) return;
    const article = selected;
    const key = requestKey;
    setManualSubmitting(true);
    setExtractFailure(null);
    try {
      const result = await api<ArticlePhraseResponse>('/phrases', {
        method: 'POST',
        body: JSON.stringify({
          feed_id: article.feed_id,
          article_url: article.url,
          article_title: article.title,
          article_text: pastedText,
          max_phrases: 6,
          purpose: 'article_detail',
        }),
      });
      setPhraseResult({ key, phrases: result.phrases });
    } catch (reason: unknown) {
      setExtractFailure({
        key,
        message: reason instanceof Error ? reason.message : 'Extraction failed.',
      });
    } finally {
      setManualSubmitting(false);
    }
  }

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
      {articleId && !selected ? (
        <div className="article-empty">
          {articlesLoaded || error ? '아티클을 찾을 수 없습니다.' : '아티클을 불러오는 중이에요…'}
        </div>
      ) : selected ? (
        <article className="article-reader ds-surface">
          <button className="article-back" type="button" onClick={() => navigate('/articles')}>
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
                <small>
                  표현을 추출하려면 원문 본문을 가져올 수 있어야 합니다. 원문 접근이 계속 막히면
                  다른 아티클을 시도해 주세요.
                </small>
              </div>
            )}
            {extractError && (
              <div className="article-manual-extraction">
                <label htmlFor="article-text-input">
                  본문을 복사해서 붙여넣으면 로컬 모델로 표현을 추출할 수 있어요.
                </label>
                <textarea
                  id="article-text-input"
                  value={pastedText}
                  onChange={(event) =>
                    setManualArticleText({ articleId: selected.id, text: event.target.value })
                  }
                  maxLength={8000}
                  rows={7}
                  placeholder="원문 페이지에서 기사 본문을 복사해 붙여넣으세요. 최대 8,000자까지 사용하며 입력한 본문은 저장하지 않습니다."
                />
                <button
                  className="article-retry"
                  type="button"
                  disabled={!pastedText.trim() || manualSubmitting}
                  onClick={extractPastedText}
                >
                  {manualSubmitting ? '표현 추출 중…' : '붙여넣은 본문에서 추출'}
                </button>
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
                    {phrase.pinyin && (
                      <p className="article-expression-pronunciation">병음 {phrase.pinyin}</p>
                    )}
                    {phrase.reading && (
                      <p className="article-expression-pronunciation">읽기 {phrase.reading}</p>
                    )}
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
            <div className="article-tile-wrap" key={article.id}>
              <button
                className="article-tile ds-surface"
                type="button"
                onClick={() => navigate(`/articles/${encodeURIComponent(article.id)}`)}
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
              <a
                className="article-tile-new-tab"
                href={`/articles/${encodeURIComponent(article.id)}`}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`새 탭에서 ${article.title} 상세 보기`}
              >
                새 탭에서 보기 ↗
              </a>
            </div>
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
