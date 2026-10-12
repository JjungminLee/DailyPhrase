import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { seoulDate } from '../language';
import type {
  ApiError,
  ConfigResponse,
  DailyResponse,
  FeedAvailability,
  HealthResponse,
} from '../types';

export function useDailyPhrase() {
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [phrasesPerLanguage, setPhrasesPerLanguage] = useState(5);
  const [result, setResult] = useState<DailyResponse | null>(null);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [loadError, setLoadError] = useState('');
  const date = useMemo(() => seoulDate(), []);

  useEffect(() => {
    let active = true;
    Promise.all([api<ConfigResponse>('/config'), api<HealthResponse>('/health')])
      .then(([configuration, status]) => {
        if (!active) return;
        setConfig(configuration);
        setHealth(status);
        setSelectedLanguages(configuration.default_languages);
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(error instanceof Error ? error.message : 'API 연결에 실패했습니다.');
      });

    return () => {
      active = false;
    };
  }, []);

  const phraseCount = useMemo(
    () =>
      Object.values(result?.results ?? {}).reduce((total, item) => total + item.phrases.length, 0),
    [result],
  );

  function toggleLanguage(code: string) {
    setSelectedLanguages((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    );
  }

  async function loadDaily(languages = selectedLanguages) {
    setLoadingMessage('선택한 피드 연결을 확인하고 있어요…');
    setLoadError('');
    setResult(null);

    try {
      const feeds = await getLocalFeedAvailability();
      const feedsToVerify = languages.flatMap((language) => {
        if (feeds.some((feed) => feed.language === language && feed.enabled && feed.verified))
          return [];
        const defaultFeed = feeds.find(
          (feed) => feed.language === language && feed.enabled && !feed.verified && feed.is_default,
        );
        return defaultFeed ? [defaultFeed] : [];
      });

      await Promise.all(
        feedsToVerify.map((feed) =>
          api(`/admin/feeds/${encodeURIComponent(feed.id)}/verify`, { method: 'POST' }),
        ),
      );

      setLoadingMessage('최신 아티클에서 오늘의 표현을 찾고 있어요…');
      setResult(
        await api<DailyResponse>('/phrases/daily', {
          method: 'POST',
          body: JSON.stringify({ languages, per_language: phrasesPerLanguage, date }),
        }),
      );
    } catch (error: unknown) {
      setLoadError(error instanceof Error ? error.message : '표현을 불러오지 못했습니다.');
    } finally {
      setLoadingMessage('');
    }
  }

  return {
    config,
    health,
    selectedLanguages,
    phrasesPerLanguage,
    setPhrasesPerLanguage,
    result,
    phraseCount,
    date,
    loading: Boolean(loadingMessage),
    loadingMessage,
    loadError,
    toggleLanguage,
    loadDaily,
  };
}

async function getLocalFeedAvailability(): Promise<FeedAvailability[]> {
  try {
    const { feeds } = await api<{ feeds: FeedAvailability[] }>('/admin/feeds');
    return feeds;
  } catch (error) {
    // The admin API is intentionally enabled only by the local server.
    if (error instanceof Error && (error as ApiError).status === 404) return [];
    throw error;
  }
}
