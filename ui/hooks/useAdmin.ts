import { useCallback, useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { api } from '../api';
import type { ArticleItem, BatchStudy, Feed, FeedVerification } from '../types';

export function useAdmin(initialLanguage = 'en') {
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [articles, setArticles] = useState<ArticleItem[]>([]);
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [language, setLanguage] = useState(initialLanguage);
  const [verification, setVerification] = useState<FeedVerification | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [study, setStudy] = useState<BatchStudy | null>(null);

  const refresh = useCallback(async () => {
    const [feedResponse, articleResponse] = await Promise.all([
      api<{ feeds: Feed[] }>('/admin/feeds'),
      api<{ articles: ArticleItem[] }>('/admin/articles'),
    ]);
    setFeeds(feedResponse.feeds);
    setArticles(articleResponse.articles);
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([
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
      setStudy(await api<BatchStudy>('/admin/study', { method: 'POST', body: JSON.stringify({}) }));
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

  return {
    feeds,
    articles,
    url,
    setUrl,
    name,
    setName,
    language,
    setLanguage,
    verification,
    setVerification,
    message,
    error,
    busy,
    study,
    verifyUrl,
    addSubscription,
    pollNow,
    compareBatch,
    toggleFeed,
    verifyFeed,
    deleteFeed,
  };
}
