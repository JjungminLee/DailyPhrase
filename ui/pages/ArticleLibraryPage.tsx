import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { ArticleItem, Phrase } from '../types';

type ArticlePhraseResponse = { phrases: Phrase[] };
type ArticleTitleResponse = {
  title_translation_ko: string;
  title_pinyin?: string;
  title_reading?: string;
};

type Cached<T> = { value: T; storedAt: number };
const responseCacheTtlMs = 30 * 60 * 1000;
const responseCacheLimit = 40;
const phraseResponseCache = new Map<string, Cached<ArticlePhraseResponse>>();
const titleResponseCache = new Map<string, Cached<ArticleTitleResponse>>();

function readCache<T>(cache: Map<string, Cached<T>>, key: string): T | null {
  const cached = cache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.storedAt > responseCacheTtlMs) {
    cache.delete(key);
    return null;
  }
  return cached.value;
}

function peekCache<T>(cache: Map<string, Cached<T>>, key: string): T | null {
  const cached = cache.get(key);
  return cached && Date.now() - cached.storedAt <= responseCacheTtlMs ? cached.value : null;
}

function writeCache<T>(cache: Map<string, Cached<T>>, key: string, value: T) {
  if (cache.size >= responseCacheLimit) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey) cache.delete(oldestKey);
  }
  cache.set(key, { value, storedAt: Date.now() });
}

function hasPronunciation(language: string, phrases: Phrase[]) {
  if (language === 'zh') return phrases.every((phrase) => Boolean(phrase.pinyin?.trim()));
  if (language === 'ja') return phrases.every((phrase) => Boolean(phrase.reading?.trim()));
  return true;
}

function hasTitlePronunciation(language: string, sourceTitle: string, title: ArticleTitleResponse) {
  if (language === 'zh') return Boolean(title.title_pinyin?.trim());
  if (language === 'ja' && /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u.test(sourceTitle))
    return Boolean(title.title_reading?.trim());
  return true;
}

export function ArticleLibraryPage() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [languageFilter, setLanguageFilter] = useState('all');
  const [articlesLoaded, setArticlesLoaded] = useState(false);
  const [phraseResult, setPhraseResult] = useState<{ key: string; phrases: Phrase[] } | null>(null);
  const [titleResult, setTitleResult] = useState<{
    key: string;
    data: ArticleTitleResponse;
  } | null>(null);
  const [titleFailure, setTitleFailure] = useState<{ key: string; message: string } | null>(null);
  const [titleRetryCount, setTitleRetryCount] = useState(0);
  const [extractFailure, setExtractFailure] = useState<{ key: string; message: string } | null>(
    null,
  );
  const [completedRequest, setCompletedRequest] = useState('');
  const [manualArticleText, setManualArticleText] = useState<{
    articleId: string;
    text: string;
  } | null>(null);
  const [manualSubmitting, setManualSubmitting] = useState(false);
  const manualRequestKey = useRef('');
  const [manualEmptyResult, setManualEmptyResult] = useState('');
  const [studySaveMessage, setStudySaveMessage] = useState('');
  const [studySaving, setStudySaving] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { articleId } = useParams();
  const selected = articles.find((article) => article.id === articleId) ?? null;
  const visibleArticles =
    languageFilter === 'all'
      ? articles
      : articles.filter((article) => article.language === languageFilter);
  const requestKey = selected ? `${selected.id}:${retryCount}` : '';
  const titleRequestKey = selected ? `${selected.id}:${titleRetryCount}` : '';
  const cacheKey = selected
    ? JSON.stringify([
        selected.id,
        selected.url,
        selected.title,
        selected.language,
        selected.feed_id,
        'pronunciation-v2',
      ])
    : '';
  const pastedText =
    manualArticleText && selected && manualArticleText.articleId === selected.id
      ? manualArticleText.text
      : '';
  const phraseCacheValue = peekCache(phraseResponseCache, cacheKey);
  const cachedPhrases =
    phraseCacheValue && selected && hasPronunciation(selected.language, phraseCacheValue.phrases)
      ? phraseCacheValue
      : null;
  const titleCacheValue = peekCache(titleResponseCache, cacheKey);
  const cachedTitle =
    titleCacheValue && selected && hasTitlePronunciation(selected.language, selected.title, titleCacheValue)
      ? titleCacheValue
      : null;
  const phrases =
    phraseResult?.key === requestKey && selected && hasPronunciation(selected.language, phraseResult.phrases)
      ? phraseResult.phrases
      : (cachedPhrases?.phrases ?? []);
  const titleData =
    titleResult?.key === titleRequestKey &&
    selected &&
    hasTitlePronunciation(selected.language, selected.title, titleResult.data)
      ? titleResult.data
      : cachedTitle;
  const titleError = titleFailure?.key === titleRequestKey ? titleFailure.message : '';
  const titleLoading = Boolean(titleRequestKey && !titleData && !titleError);
  const extractError = extractFailure?.key === requestKey ? extractFailure.message : '';
  const extracting =
    (Boolean(requestKey && completedRequest !== requestKey) && !cachedPhrases) || manualSubmitting;

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
    const key = `${selected.id}:${titleRetryCount}`;
    const cached = readCache(titleResponseCache, cacheKey);
    if (cached && hasTitlePronunciation(selected.language, selected.title, cached)) return;
    if (cached) titleResponseCache.delete(cacheKey);
    api<ArticleTitleResponse>('/article-title', {
      method: 'POST',
      body: JSON.stringify({ title: selected.title, language: selected.language }),
    })
      .then((data) => {
        if (active) {
          writeCache(titleResponseCache, cacheKey, data);
          setTitleResult({ key, data });
        }
      })
      .catch((reason: unknown) => {
        if (active)
          setTitleFailure({
            key,
            message: reason instanceof Error ? reason.message : 'Title translation failed.',
          });
      });
    return () => {
      active = false;
    };
  }, [selected, titleRetryCount, cacheKey]);

  useEffect(() => {
    if (!selected) return;
    let active = true;
    const key = `${selected.id}:${retryCount}`;
    const cached = readCache(phraseResponseCache, cacheKey);
    if (cached && hasPronunciation(selected.language, cached.phrases)) return;
    if (cached) phraseResponseCache.delete(cacheKey);
    setCompletedRequest('');

    api<ArticlePhraseResponse>('/phrases', {
      method: 'POST',
      body: JSON.stringify({
        feed_id: selected.feed_id,
        article_url: selected.url,
        article_title: selected.title,
        max_phrases: 4,
        purpose: 'article_detail',
      }),
    })
      .then((result) => {
        if (active && manualRequestKey.current !== key) {
          writeCache(phraseResponseCache, cacheKey, result);
          setPhraseResult({ key, phrases: result.phrases });
        }
      })
      .catch((reason: unknown) => {
        if (active && manualRequestKey.current !== key)
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
  }, [selected, retryCount, cacheKey]);

  async function extractPastedText() {
    if (!selected || !pastedText.trim()) return;
    const article = selected;
    const key = requestKey;
    manualRequestKey.current = key;
    setManualSubmitting(true);
    setExtractFailure(null);
    setManualEmptyResult('');
    try {
      const result = await api<ArticlePhraseResponse>('/phrases', {
        method: 'POST',
        body: JSON.stringify({
          feed_id: article.feed_id,
          article_url: article.url,
          article_title: article.title,
          article_text: pastedText,
          max_phrases: 4,
          purpose: 'article_detail',
        }),
      });
      setPhraseResult({ key, phrases: result.phrases });
      setCompletedRequest(key);
      if (result.phrases.length === 0)
        setManualEmptyResult(
          '붙여넣은 본문에서도 학습할 표현을 찾지 못했어요. 본문에 해당 언어의 원문이 포함되어 있는지 확인해 주세요.',
        );
    } catch (reason: unknown) {
      setExtractFailure({
        key,
        message: reason instanceof Error ? reason.message : 'Extraction failed.',
      });
    } finally {
      setCompletedRequest(key);
      setManualSubmitting(false);
    }
  }

  async function saveStudyRecord() {
    if (!selected || !phrases.length) return;
    setStudySaving(true);
    setStudySaveMessage('');
    try {
      await api('/study-records', {
        method: 'POST',
        body: JSON.stringify({
          article: selected,
          title_translation_ko: titleData?.title_translation_ko,
          title_pinyin: titleData?.title_pinyin,
          title_reading: titleData?.title_reading,
          phrases,
        }),
      });
      setStudySaveMessage('Saved to Google Drive.');
    } catch (reason: unknown) {
      setStudySaveMessage(
        reason instanceof Error ? reason.message : 'Could not save the study record.',
      );
    } finally {
      setStudySaving(false);
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
          {titleData?.title_translation_ko && (
            <p className="article-title-translation">
              <span>{'\uD55C\uAD6D\uC5B4'}</span> {titleData.title_translation_ko}
            </p>
          )}
          {titleData?.title_pinyin && (
            <p className="article-title-pinyin">
              <span>{'\uBCD1\uC74C'}</span> {titleData.title_pinyin}
            </p>
          )}
          {titleData?.title_reading && (
            <p className="article-title-reading">
              <span>{'\uD788\uB77C\uAC00\uB098'}</span> {titleData.title_reading}
            </p>
          )}
          {titleLoading && (
            <p className="article-title-status" role="status">
              {
                '\uC81C\uBAA9 \uBC1C\uC74C\uACFC \uD55C\uAD6D\uC5B4 \uBC88\uC5ED\uC744 \uC900\uBE44\uD558\uACE0 \uC788\uC5B4\uC694...'
              }
            </p>
          )}
          {titleError && (
            <div className="article-title-error" role="alert">
              <span>{titleError}</span>
              <button
                className="article-retry"
                type="button"
                onClick={() => {
                  titleResponseCache.delete(cacheKey);
                  setTitleRetryCount((count) => count + 1);
                }}
              >
                {'\uC81C\uBAA9 \uB2E4\uC2DC \uC2DC\uB3C4'}
              </button>
            </div>
          )}
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
                  onClick={() => {
                    phraseResponseCache.delete(cacheKey);
                    setRetryCount((count) => count + 1);
                  }}
                >
                  다시 추출
                </button>
              )}
              {!extracting && phrases.length > 0 && (
                <button
                  className="article-retry"
                  type="button"
                  disabled={studySaving}
                  onClick={saveStudyRecord}
                >
                  {studySaving ? 'Saving…' : 'Save study to Google Drive'}
                </button>
              )}
            </div>
            {studySaveMessage && (
              <p className="article-study-save-message" role="status">
                {studySaveMessage} <a href="/studied">Study history and Drive setup</a>
              </p>
            )}
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
            {manualEmptyResult && (
              <p className="article-expression-state" role="status">
                {manualEmptyResult}
              </p>
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
                    <p className="article-expression-meaning">
                      <span className="phrase-meaning-label">문맥에 맞는 의역</span>
                      {phrase.meaning_ko}
                    </p>
                    <blockquote>{phrase.context_sentence}</blockquote>
                    {phrase.note_ko && <small>{phrase.note_ko}</small>}
                  </article>
                ))}
              </div>
            )}
          </section>
        </article>
      ) : (
        <div className="article-list-view">
          <nav className="article-language-filter" aria-label="Filter articles by language">
            {[
              { code: 'all', label: '\uC804\uCCB4' },
              { code: 'en', label: 'English' },
              { code: 'zh', label: '\u4E2D\u6587' },
              { code: 'fr', label: 'Fran\u00E7ais' },
              { code: 'ja', label: '\u65E5\u672C\u8A9E' },
            ].map((language) => (
              <button
                className={`home-language-chip${languageFilter === language.code ? ' selected' : ''}`}
                type="button"
                key={language.code}
                aria-pressed={languageFilter === language.code}
                onClick={() => setLanguageFilter(language.code)}
              >
                {language.label}
                <span>
                  {language.code === 'all'
                    ? articles.length
                    : articles.filter((article) => article.language === language.code).length}
                </span>
              </button>
            ))}
          </nav>
          {articles.length > 0 && visibleArticles.length === 0 && !error && (
            <div className="article-empty">
              {
                '\uC120\uD0DD\uD55C \uC5B8\uC5B4\uC758 \uC544\uD2F0\uD074\uC774 \uC5C6\uC2B5\uB2C8\uB2E4.'
              }
            </div>
          )}
          <div className="article-library-grid">
            {visibleArticles.map((article) => (
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
        </div>
      )}
    </section>
  );
}
