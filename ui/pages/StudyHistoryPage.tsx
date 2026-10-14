import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../api';
import type { Phrase } from '../types';

type StudyRecord = {
  article: {
    id: string;
    feed_name: string;
    language: string;
    title: string;
    title_translation_ko?: string;
    title_pinyin?: string;
    title_reading?: string;
    url: string;
  };
  phrases: Phrase[];
  studied_at: string;
};

type DriveStatus = { configured: boolean; connected: boolean };

export function StudyHistoryPage() {
  const { articleId } = useParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState<DriveStatus | null>(null);
  const [records, setRecords] = useState<StudyRecord[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const selected = records.find((record) => record.article.id === articleId);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const drive = await api<DriveStatus>('/drive/status');
        if (!active) return;
        setStatus(drive);
        if (drive.connected) {
          const result = await api<{ records: StudyRecord[] }>('/study-records');
          if (active) setRecords(result.records);
        }
      } catch (reason: unknown) {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load study history.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => {
      active = false;
    };
  }, []);

  return (
    <section className="article-library study-history">
      <div className="article-library-heading">
        <span className="eyebrow"><span className="eyebrow-line" /> GOOGLE DRIVE</span>
        <h1>Studied articles</h1>
        <p>Articles and expressions you chose to save while studying.</p>
      </div>

      {!status && loading && <div className="article-empty">Checking Google Drive…</div>}
      {status && !status.configured && (
        <div className="article-empty study-drive-notice">
          <strong>Google Drive setup required</strong>
          <p>Add GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REDIRECT_URI to .env, then restart the app.</p>
          <p>The redirect URI is http://localhost:3000/api/drive/callback.</p>
        </div>
      )}
      {status?.configured && !status.connected && (
        <div className="article-empty study-drive-notice">
          <strong>Connect your Google Drive</strong>
          <p>Study records are stored in a private Daily Phrase folder in your Drive app data.</p>
          <a className="primary-button" href="/api/drive/connect">Connect Google Drive</a>
        </div>
      )}
      {error && <div className="notice error-notice">{error}</div>}
      {status?.connected && !articleId && (
        <div className="study-history-list">
          {records.map((record) => (
            <button
              className="article-tile ds-surface"
              key={record.article.id}
              type="button"
              onClick={() => navigate(`/studied/${encodeURIComponent(record.article.id)}`)}
            >
              <span className="article-tile-meta">{record.article.feed_name}<i>{record.article.language.toUpperCase()}</i></span>
              <strong>{record.article.title}</strong>
              {record.article.title_translation_ko && <span>{record.article.title_translation_ko}</span>}
              <span className="article-tile-footer">{new Date(record.studied_at).toLocaleString()}<b>{record.phrases.length} expressions</b></span>
            </button>
          ))}
          {!records.length && <div className="article-empty">No study records yet. Open an article and save its expressions to Google Drive.</div>}
        </div>
      )}
      {status?.connected && articleId && (
        selected ? (
          <article className="article-reader ds-surface">
            <button className="article-back" type="button" onClick={() => navigate('/studied')}>← Study history</button>
            <span className="article-source-name">{selected.article.feed_name} · {selected.article.language.toUpperCase()}</span>
            <h2>{selected.article.title}</h2>
            {selected.article.title_translation_ko && <p className="article-title-translation">한국어 {selected.article.title_translation_ko}</p>}
            {selected.article.title_pinyin && <p className="article-title-pinyin">병음 {selected.article.title_pinyin}</p>}
            {selected.article.title_reading && <p className="article-title-reading">히라가나 {selected.article.title_reading}</p>}
            <a className="primary-button article-open" href={selected.article.url} target="_blank" rel="noreferrer">Read original ↗</a>
            <section className="article-expressions">
              <div className="article-expressions-heading"><div><span className="eyebrow"><span className="eyebrow-line" /> SAVED EXPRESSIONS</span><h3>Expressions from this article</h3></div></div>
              <div className="article-expression-list">
                {selected.phrases.map((phrase) => (
                  <article className="article-expression-card" key={phrase.text}>
                    <div className="article-expression-card-heading"><h4>{phrase.text}</h4><span>{phrase.level}</span></div>
                    {phrase.pinyin && <p className="article-expression-pronunciation">병음 {phrase.pinyin}</p>}
                    {phrase.reading && <p className="article-expression-pronunciation">읽기 {phrase.reading}</p>}
                    <p className="article-expression-meaning">{phrase.meaning_ko}</p>
                    <blockquote>{phrase.context_sentence}</blockquote>
                    {phrase.note_ko && <small>{phrase.note_ko}</small>}
                  </article>
                ))}
              </div>
            </section>
          </article>
        ) : <div className="article-empty">This study record was not found in Google Drive.</div>
      )}
    </section>
  );
}
