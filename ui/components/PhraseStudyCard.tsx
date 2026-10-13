import { useState } from 'react';
import { languageMeta } from '../language';
import type { LanguageResult } from '../types';

export function PhraseStudyCard({ code, data }: { code: string; data: LanguageResult }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [showMeaning, setShowMeaning] = useState(true);
  const [saved, setSaved] = useState(false);
  const phrase = data.phrases[activeIndex];
  const language = languageMeta[code] ?? { flag: '🌐', label: code, subtitle: code };

  if (!phrase) return null;

  function speak() {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(phrase.text);
    utterance.lang =
      code === 'zh' ? 'zh-CN' : code === 'ja' ? 'ja-JP' : code === 'fr' ? 'fr-FR' : 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  return (
    <section className="phrase-group">
      <div className="study-shell ds-surface">
        <header className="study-toolbar">
          <span className="study-language">
            {language.flag} <b>{language.label}</b>
          </span>
          <span className="study-progress">
            {activeIndex + 1}
            <i>/</i>
            {data.phrases.length}
          </span>
          <div className="study-actions">
            <button type="button" onClick={speak} aria-label="Listen to phrase" title="Listen">
              🔊
            </button>
            <button
              type="button"
              onClick={() => setSaved((value) => !value)}
              aria-label="Save phrase"
              title="Save phrase"
            >
              {saved ? '★' : '☆'}
            </button>
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
          <div className="phrase-card-top">
            <span>PHRASE {String(activeIndex + 1).padStart(2, '0')}</span>
            <span className="level-pill">{phrase.level}</span>
          </div>
          <h2>{phrase.text}</h2>
          <div className="study-meaning-row">
            <span>{language.label}</span>
            <span className="study-pronunciation">
              {code === 'zh' && phrase.pinyin
                ? `병음 ${phrase.pinyin}`
                : code === 'ja' && phrase.reading
                  ? `읽기 ${phrase.reading}`
                  : 'Tap the speaker to listen'}
            </span>
          </div>
          {showMeaning && <p className="study-translation">{phrase.meaning_ko}</p>}
        </div>
        <article className="study-example">
          <span className="study-card-label">IN CONTEXT</span>
          <p>{phrase.context_sentence}</p>
          {phrase.note_ko && <small>{phrase.note_ko}</small>}
        </article>
        <div className="study-bottom-card">
          {showMeaning && (
            <div className="study-related">
              <span>표현을 다시 읽고 소리 내어 말해 보세요</span>
              <span>{phrase.text}</span>
            </div>
          )}
          <div className="study-controls">
            <button type="button" onClick={() => setShowMeaning((value) => !value)}>
              {showMeaning ? '뜻 가리기' : '뜻 보기'}
            </button>
            <button
              className={`study-save ${saved ? 'is-saved' : ''}`}
              type="button"
              onClick={() => setSaved((value) => !value)}
            >
              {saved ? '저장됨' : '저장'}
            </button>
            <div className="study-pager">
              <button
                type="button"
                disabled={activeIndex === 0}
                onClick={() => setActiveIndex((index) => index - 1)}
              >
                이전
              </button>
              <button
                type="button"
                disabled={activeIndex === data.phrases.length - 1}
                onClick={() => setActiveIndex((index) => index + 1)}
              >
                다음 표현 →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
