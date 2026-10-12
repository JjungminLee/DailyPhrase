import { useEffect, useState } from 'react';
import { api } from '../api';
import type { ArticleItem } from '../types';

export function ArticleLibraryPage() {
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [selected, setSelected] = useState<ArticleItem | null>(null);
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
          <p>원문은 발행 사이트에서 확인할 수 있습니다.</p>
          <a
            className="primary-button article-open"
            href={selected.url}
            target="_blank"
            rel="noreferrer"
          >
            원문 읽기 ↗
          </a>
          <small>{selected.published_at || selected.discovered_at}</small>
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
