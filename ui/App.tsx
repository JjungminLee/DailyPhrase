import { StrictMode } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { AdminPage } from './admin';
import { AppShell } from './components/AppShell';
import { useDailyPhrase } from './hooks/useDailyPhrase';
import { ArticleLibraryPage } from './pages/ArticleLibraryPage';
import { DailyPhrasePage } from './pages/DailyPhrasePage';

export function App() {
  return (
    <StrictMode>
      <BrowserRouter>
        <ApplicationRoutes />
      </BrowserRouter>
    </StrictMode>
  );
}

function ApplicationRoutes() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const dailyPhrase = useDailyPhrase();

  if (pathname === '/admin') {
    return (
      <div className="admin-standalone">
        <AdminPage
          languages={dailyPhrase.config?.languages ?? []}
          onCollect={async (language) => {
            navigate('/');
            await dailyPhrase.loadDaily([language]);
          }}
        />
      </div>
    );
  }

  return (
    <AppShell health={dailyPhrase.health}>
      <Routes>
        <Route path="/" element={<DailyPhrasePage state={dailyPhrase} />} />
        <Route path="/articles" element={<ArticleLibraryPage />} />
        <Route path="/articles/:articleId" element={<ArticleLibraryPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
