import { languageMeta } from '../language';
import { PhraseStudyCard } from '../components/PhraseStudyCard';
import type { useDailyPhrase } from '../hooks/useDailyPhrase';

type DailyPhraseState = ReturnType<typeof useDailyPhrase>;

export function DailyPhrasePage({ state }: { state: DailyPhraseState }) {
  const {
    config,
    selectedLanguages,
    phrasesPerLanguage,
    setPhrasesPerLanguage,
    result,
    phraseCount,
    date,
    loading,
    loadingMessage,
    loadError,
    toggleLanguage,
    loadDaily,
  } = state;

  return (
    <section className="home-page">
      <header className="home-heading">
        <div>
          <span className="ds-eyebrow">A LITTLE PRACTICE, EVERY DAY</span>
          <h1>오늘의 표현을 익혀보세요.</h1>
          <p>아티클에서 만난 표현을 문장과 함께 천천히 공부해요.</p>
        </div>
        <span className="home-date">{date}</span>
      </header>

      <div className="home-settings ds-surface">
        <div className="home-setting-label">
          <span>공부할 언어</span>
          <small>{selectedLanguages.length}개 선택</small>
        </div>
        <div className="home-language-options">
          {(config?.languages ?? []).map((language) => {
            const meta = languageMeta[language.code] ?? {
              flag: '🌐',
              label: language.name,
              subtitle: language.name,
            };
            const active = selectedLanguages.includes(language.code);
            return (
              <button
                className={`home-language-chip ${active ? 'selected' : ''}`}
                key={language.code}
                type="button"
                onClick={() => toggleLanguage(language.code)}
                aria-pressed={active}
              >
                <span>{meta.flag}</span>
                {meta.label}
              </button>
            );
          })}
        </div>
        <label className="home-count-setting">
          표현 수
          <select
            value={phrasesPerLanguage}
            onChange={(event) => setPhrasesPerLanguage(Number(event.target.value))}
          >
            {[3, 5, 10, 15, 20].map((count) => (
              <option value={count} key={count}>
                {count}개
              </option>
            ))}
          </select>
        </label>
        <button
          className="ds-button ds-button-primary home-load-button"
          disabled={loading || selectedLanguages.length === 0}
          onClick={() => loadDaily()}
          type="button"
        >
          {loading ? '가져오는 중…' : result ? '새 표현 가져오기' : '오늘의 표현 시작하기'}
          <span aria-hidden="true">→</span>
        </button>
      </div>

      <div className="home-content" aria-live="polite">
        {loading && (
          <div className="home-message">
            <span className="spinner" />
            {loadingMessage}
          </div>
        )}
        {loadError && (
          <div className="home-message home-error">
            <b>표현을 불러오지 못했어요.</b>
            <span>{loadError}</span>
            <a href="/admin">피드 설정 확인하기</a>
          </div>
        )}
        {result &&
          Object.entries(result.results).map(([code, data]) => (
            <PhraseStudyCard key={code} code={code} data={data} />
          ))}
        {result?.errors.map((error) => (
          <div className="home-message home-error" key={error.language}>
            <b>{languageMeta[error.language]?.label ?? error.language} 수집 오류</b>
            <span>{error.message}</span>
            {error.type === 'model_error' && <a href="/articles">수집된 아티클 보기</a>}
          </div>
        ))}
        {!result && !loading && !loadError && <WelcomeCard />}
      </div>

      <footer className="home-footer">
        <span>DAILY PHRASE</span>
        <span>
          {phraseCount ? `${phraseCount}개 표현 준비됨` : '아티클로 배우는 매일의 언어 감각'}
        </span>
        <a href="/articles">아티클 둘러보기 →</a>
      </footer>
    </section>
  );
}

function WelcomeCard() {
  return (
    <div className="home-welcome ds-surface">
      <span className="home-welcome-icon" aria-hidden="true">
        ✳
      </span>
      <div>
        <span className="ds-eyebrow">YOUR NEXT WORD IS WAITING</span>
        <h2>준비되면 오늘의 표현을 시작하세요.</h2>
        <p>수집된 아티클을 바탕으로 짧고 유용한 표현을 골라드려요.</p>
      </div>
    </div>
  );
}
