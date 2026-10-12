import { useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { HealthResponse } from '../types';

export function AppShell({
  health,
  children,
}: {
  health: HealthResponse | null;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();

  return (
    <div className="app-shell">
      <aside className="rail">
        <a className="brand-mark" href="#top" aria-label="Daily Phrase">
          <span>dp</span>
          <i>✳</i>
        </a>
        <div className="rail-divider" />
        <button
          className={`rail-button ${pathname === '/' ? 'active' : ''}`}
          onClick={() => navigate('/')}
          aria-label="오늘의 표현"
          title="오늘의 표현"
          type="button"
        >
          <span>✎</span>
        </button>
        <button
          className={`rail-button ${pathname === '/articles' ? 'active' : ''}`}
          aria-label="Articles"
          title="Articles"
          onClick={() => navigate('/articles')}
          type="button"
        >
          <span>◉</span>
        </button>
        <button className="rail-button" aria-label="Settings" title="설정" type="button">
          <span>⚙</span>
        </button>
        <div className="rail-spacer" />
        <div className="rail-spacer" />
        <span className="rail-avatar">J</span>
      </aside>

      <main className="main-content" id="top">
        <header className="topbar">
          <div className="breadcrumb">
            <span>WORKSPACE</span>
            <b>/</b>
            <strong>DAILY PHRASE</strong>
          </div>
          <div className="topbar-right">
            <div className={`api-status ${health ? 'online' : 'offline'}`}>
              <span />
              {health ? 'LOCAL API ONLINE' : 'CONNECTING API'}
            </div>
            <span className="top-date">
              {new Intl.DateTimeFormat('ko-KR', {
                dateStyle: 'medium',
                timeZone: 'Asia/Seoul',
              }).format(new Date())}
            </span>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
