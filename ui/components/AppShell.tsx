import styled from '@emotion/styled';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { HealthResponse } from '../types';

const Shell = styled.div({ minHeight: '100vh' });
const Rail = styled.aside({
  position: 'fixed',
  inset: '0 auto 0 0',
  zIndex: 2,
  width: '76px',
  display: 'flex',
  alignItems: 'center',
  flexDirection: 'column',
  padding: '25px 0 20px',
  background: 'var(--dp-color-surface)',
  borderRight: '1px solid var(--dp-color-border)',
  '@media (max-width: 760px)': { width: '58px' },
  '@media (max-width: 430px)': { width: '54px' },
});
const Brand = styled.a({
  position: 'relative',
  width: '42px',
  height: '42px',
  display: 'grid',
  placeItems: 'center',
  borderRadius: '14px',
  color: '#fff',
  background: 'var(--dp-color-ink)',
  textDecoration: 'none',
  font: '800 15px var(--dp-font-body)',
  letterSpacing: '-1px',
  '& i': { position: 'absolute', top: '-4px', right: '-3px', color: '#bee95c', fontSize: '11px' },
});
const Divider = styled.div({
  width: '30px',
  height: '1px',
  margin: '25px 0 18px',
  background: 'var(--dp-color-border)',
});
const NavButton = styled.button<{ $active?: boolean }>(({ $active }) => ({
  width: '42px',
  height: '42px',
  margin: '3px 0',
  border: 0,
  borderRadius: '13px',
  color: $active ? '#4a6422' : '#a4a69e',
  background: $active ? '#f1f6e6' : 'transparent',
  fontSize: '21px',
  cursor: 'pointer',
  '&:hover': { background: $active ? '#f1f6e6' : 'var(--dp-color-canvas)' },
}));
const Spacer = styled.div({ flex: 1 });
const Avatar = styled.span({
  width: '32px',
  height: '32px',
  display: 'grid',
  placeItems: 'center',
  borderRadius: '50%',
  color: '#805935',
  background: '#f2e5d7',
  fontSize: '12px',
  fontWeight: 700,
});
const Main = styled.main({
  maxWidth: '1480px',
  margin: '0 auto',
  padding: '0 5.5% 0 calc(76px + 5.5%)',
  '@media (max-width: 1000px)': { paddingRight: '4%', paddingLeft: 'calc(76px + 4%)' },
  '@media (max-width: 760px)': { padding: '0 18px 0 76px' },
  '@media (max-width: 430px)': { paddingRight: '13px', paddingLeft: '70px' },
});
const TopBar = styled.header({
  height: '76px',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  borderBottom: '1px solid var(--dp-color-border)',
  '@media (max-width: 760px)': { height: '63px' },
});
const Breadcrumb = styled.div({
  color: 'var(--dp-color-subtle)',
  font: '500 10px var(--dp-font-mono)',
  letterSpacing: '1.2px',
  '@media (max-width: 760px)': { fontSize: '8px' },
  '& b': { margin: '0 11px', color: '#d1d2ca', fontWeight: 400 },
  '& strong': { color: '#5d6058', fontWeight: 500 },
});
const TopBarRight = styled.div({
  display: 'flex',
  alignItems: 'center',
  gap: '24px',
  '@media (max-width: 760px)': { gap: '12px' },
});
const ApiStatus = styled.div<{ $online: boolean }>(({ $online }) => ({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  color: '#8e9188',
  font: '500 9px var(--dp-font-mono)',
  letterSpacing: '0.7px',
  '@media (max-width: 760px)': { fontSize: '7px' },
  '& span': {
    width: '7px',
    height: '7px',
    borderRadius: '50%',
    background: $online ? '#86bb44' : '#d6a747',
    boxShadow: $online ? '0 0 0 3px #edf4df' : 'none',
  },
}));
const TopDate = styled.span({
  color: '#8a8c85',
  fontSize: '11px',
  '@media (max-width: 760px)': { fontSize: '9px' },
});

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
    <Shell>
      <Rail>
        <Brand href="#top" aria-label="Daily Phrase">
          <span>dp</span>
          <i>✳</i>
        </Brand>
        <Divider />
        <NavButton
          $active={pathname === '/'}
          onClick={() => navigate('/')}
          aria-label="오늘의 표현"
          title="오늘의 표현"
          type="button"
        >
          ✎
        </NavButton>
        <NavButton
          $active={pathname === '/articles'}
          onClick={() => navigate('/articles')}
          aria-label="Articles"
          title="Articles"
          type="button"
        >
          ◉
        </NavButton>
        <NavButton
          $active={pathname === '/admin'}
          onClick={() => navigate('/admin')}
          aria-label="Settings"
          title="설정"
          type="button"
        >
          ⚙
        </NavButton>
        <Spacer />
        <Spacer />
        <Avatar>J</Avatar>
      </Rail>
      <Main id="top">
        <TopBar>
          <Breadcrumb>
            <span>WORKSPACE</span>
            <b>/</b>
            <strong>DAILY PHRASE</strong>
          </Breadcrumb>
          <TopBarRight>
            <ApiStatus $online={Boolean(health)}>
              <span />
              {health ? 'LOCAL API ONLINE' : 'CONNECTING API'}
            </ApiStatus>
            <TopDate>
              {new Intl.DateTimeFormat('ko-KR', {
                dateStyle: 'medium',
                timeZone: 'Asia/Seoul',
              }).format(new Date())}
            </TopDate>
          </TopBarRight>
        </TopBar>
        {children}
      </Main>
    </Shell>
  );
}
