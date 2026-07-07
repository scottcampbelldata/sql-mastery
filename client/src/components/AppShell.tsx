import { NavLink, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useCurriculum } from '../state/CurriculumContext';
import { currentSession, percent } from '../lib/curriculum';
import { SIDEBAR_KEY, safeGet, safeSet, resetAllProgress } from '../lib/progress';
import { getTheme, setTheme } from '../theme/theme';
import { ProgressMeter, cx } from './ui';
import { LESSONS } from '../lessons/manifest';
import { AccountMenu } from './AccountMenu';
import './appshell.css';

function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme);
  function flip() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }
  return (
    <button className="theme-toggle" onClick={flip} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle light / dark">
      <span aria-hidden="true">{theme === 'dark' ? '☾' : '☀'}</span>
    </button>
  );
}

interface AppShellProps {
  children?: ReactNode;
  breadcrumb?: ReactNode;
}

export function AppShell({ children, breadcrumb }: AppShellProps) {
  const { curriculum, progress, activeSessionId } = useCurriculum();
  const [collapsed, setCollapsed] = useState(() => safeGet(SIDEBAR_KEY) === '1');
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  // The mobile drawer closes whenever navigation happens.
  useEffect(() => { setMenuOpen(false); }, [location]);

  const done = curriculum ? Object.keys(progress.completed).length : 0;
  const total = curriculum ? curriculum.exercises.length : 0;
  const cont = curriculum ? currentSession(curriculum.sessions, progress.completed, activeSessionId) : null;

  function toggle() {
    const next = !collapsed;
    safeSet(SIDEBAR_KEY, next ? '1' : '0');
    setCollapsed(next);
  }

  return (
    <div className={cx('shell', collapsed && 'collapsed', menuOpen && 'menu-open')}>
      <header className="mobile-bar">
        <Link to="/" className="brand-mark">SQL<span>/</span>Mastery</Link>
        <div className="mobile-bar-actions">
          <ThemeToggle />
          <button className="menu-btn" onClick={() => setMenuOpen(!menuOpen)}
            aria-expanded={menuOpen} aria-controls="app-sidebar" aria-label={menuOpen ? 'Close menu' : 'Open menu'}>
            {menuOpen ? '✕ Close' : '☰ Menu'}
          </button>
        </div>
      </header>
      {menuOpen ? <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" /> : null}
      <aside id="app-sidebar" className="sidebar">
        <div className="brand">
          <Link to="/" className="brand-mark">SQL<span>/</span>Mastery</Link>
          <button className="collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '»' : '«'}
          </button>
        </div>
        <nav className="side-nav">
          <div className="nav-group">
            <span className="nav-group-label">Learn</span>
            <NavLink to="/learn" className={({ isActive }) => cx('nav-item', isActive && 'active')}><span className="nav-ico">◎</span><span className="nav-label">Foundations</span></NavLink>
          </div>
          <div className="nav-group">
            <span className="nav-group-label">Extra problems</span>
            <NavLink to="/academy" className={({ isActive }) => cx('nav-item', isActive && 'active')}><span className="nav-ico">◆</span><span className="nav-label">Interview problem bank</span></NavLink>
            {/* Continue is a section indicator: active for any /session path, not a per-URL match. */}
            {cont ? <NavLink to={`/session/${cont.id}`} className={() => cx('nav-item', location.pathname.startsWith('/session') && 'active')}><span className="nav-ico">▶</span><span className="nav-label">Continue</span></NavLink> : null}
          </div>
          <div className="nav-group">
            <span className="nav-group-label">Lessons</span>
            {LESSONS.map((l) => (
              <NavLink key={l.slug} to={`/lessons/${l.slug}`} className={({ isActive }) => cx('nav-item', 'nav-sub', isActive && 'active')}>
                <span className="nav-ico">{l.short}</span><span className="nav-label">{l.title}</span>
              </NavLink>
            ))}
          </div>
          <div className="nav-group">
            <span className="nav-group-label">Explore</span>
            <NavLink to="/databases" className={({ isActive }) => cx('nav-item', isActive && 'active')}><span className="nav-ico">⛁</span><span className="nav-label">Databases</span></NavLink>
          </div>
        </nav>
        <div className="sidebar-foot">
          {total ? <ProgressMeter value={percent(done, total)} label="Course" /> : null}
          <AccountMenu />
          <button type="button" className="sync-link" onClick={() => {
            if (window.confirm('Reset all your progress back to zero? This wipes every lesson, review, and mastery record on this device and cannot be undone.')) {
              resetAllProgress();
              window.location.href = '/';
            }
          }}>Reset progress</button>
        </div>
      </aside>
      <div className="main-col">
        <header className="topbar">
          <div className="crumbs">{breadcrumb}</div>
          <div className="topbar-spacer" />
          <ThemeToggle />
        </header>
        <main className="main">{children}</main>
      </div>
    </div>
  );
}
