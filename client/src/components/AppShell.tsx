import { NavLink, Link, useLocation } from 'react-router-dom';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { useFoundations } from '../state/FoundationsContext';
import { graduationStatus } from '../lib/foundations';
import { SIDEBAR_KEY, safeGet, safeSet } from '../lib/progress';
import { getTheme, setTheme } from '../theme/theme';
import { ProgressMeter, cx } from './ui';
import { AccountMenu } from './AccountMenu';
import './appshell.css';

function percent(done: number, total: number): number {
  if (!total) return 0;
  return Math.round((done / total) * 100);
}

function ThemeToggle() {
  const [theme, setThemeState] = useState(getTheme);
  function flip() {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  }
  return (
    <button className="theme-toggle" onClick={flip} aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`} title="Toggle light / dark">
      {theme === 'dark' ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      )}
    </button>
  );
}

interface AppShellProps {
  children?: ReactNode;
  breadcrumb?: ReactNode;
}

export function AppShell({ children, breadcrumb }: AppShellProps) {
  const { track, state } = useFoundations();
  const [collapsed, setCollapsed] = useState(() => safeGet(SIDEBAR_KEY) === '1');
  const [menuOpen, setMenuOpen] = useState(false);
  const location = useLocation();

  useEffect(() => { setMenuOpen(false); }, [location]);

  const grad = track ? graduationStatus(track, state) : null;
  const done = grad ? grad.strongSkills : 0;
  const total = grad ? grad.totalSkills : 0;

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
            {menuOpen ? 'Close' : 'Menu'}
          </button>
        </div>
      </header>
      {menuOpen ? <div className="drawer-backdrop" onClick={() => setMenuOpen(false)} aria-hidden="true" /> : null}
      <aside id="app-sidebar" className="sidebar">
        <div className="brand">
          <Link to="/" className="brand-mark">SQL<span>/</span>Mastery</Link>
          <button className="collapse-btn" onClick={toggle} aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? '>>' : '<<'}
          </button>
        </div>
        <nav className="side-nav">
          <div className="nav-group">
            <span className="nav-group-label">Learn</span>
            <NavLink to="/learn" className={({ isActive }) => cx('nav-item', isActive && 'active')}>
              <span className="nav-ico">SQL</span><span className="nav-label">Three-band path</span>
            </NavLink>
            <NavLink to="/readiness" className={({ isActive }) => cx('nav-item', isActive && 'active')}>
              <span className="nav-ico">IR</span><span className="nav-label">Interview readiness</span>
            </NavLink>
            <NavLink to="/interview" className={({ isActive }) => cx('nav-item', isActive && 'active')}>
              <span className="nav-ico">IM</span><span className="nav-label">Interview mode</span>
            </NavLink>
          </div>
          <div className="nav-group">
            <span className="nav-group-label">Explore</span>
            <NavLink to="/databases" className={({ isActive }) => cx('nav-item', isActive && 'active')}>
              <span className="nav-ico">DB</span><span className="nav-label">Databases</span>
            </NavLink>
            <NavLink to="/settings" className={({ isActive }) => cx('nav-item', isActive && 'active')}>
              <span className="nav-ico">ST</span><span className="nav-label">Settings</span>
            </NavLink>
          </div>
        </nav>
        <div className="sidebar-foot">
          {total ? <ProgressMeter value={percent(done, total)} label="Skills" /> : null}
          <AccountMenu />
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
