import React, { useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { FileCheck2, LayoutDashboard, LogOut, Menu, ScanSearch, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const navLink = ({ isActive }) =>
  `flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${isActive ? 'bg-primary-soft text-primary' : 'text-muted hover:bg-page hover:text-ink'}`;

export const Brand = ({ to = '/' }) => (
  <Link to={to} className="flex items-center gap-2.5 font-display text-base font-extrabold">
    <span className="tile tile-brand h-9 w-9"><FileCheck2 className="h-5 w-5" /></span>
    ATS Resume Checker
  </Link>
);

const Header = () => {
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const [open, setOpen] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <header className="sticky top-0 z-20 border-b bg-surface/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-x-6 px-4 py-2.5 sm:px-6">
        <Brand to={isAuthenticated ? '/dashboard' : '/'} />

        <button
          type="button"
          className="btn btn-ghost -mr-2 px-2 md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>

        {/* One nav for every width: a row from md up, a toggled column below. */}
        <nav
          onClick={() => setOpen(false)}
          className={`${open ? 'flex animate-rise' : 'hidden'} w-full flex-col gap-1 pb-2 pt-3 md:flex md:w-auto md:flex-1 md:flex-row md:items-center md:p-0`}
        >
          {isAuthenticated ? (
            <>
              <NavLink to="/dashboard" className={navLink}><LayoutDashboard className="h-4 w-4" /> Dashboard</NavLink>
              <NavLink to="/analyze" className={navLink}><ScanSearch className="h-4 w-4" /> Analyze</NavLink>
              <div className="mt-2 flex items-center gap-2 border-t pt-3 md:ml-auto md:mt-0 md:border-0 md:pt-0">
                {user && (
                  <span className="flex min-w-0 flex-1 items-center gap-2 px-1 text-sm font-semibold md:flex-none">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-accent-soft text-accent">{user.name.trim().charAt(0).toUpperCase()}</span>
                    <span className="max-w-40 truncate">{user.name}</span>
                  </span>
                )}
                <button type="button" onClick={handleLogout} className="btn btn-ghost px-3">
                  <LogOut className="h-4 w-4" /> Log out
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 md:ml-auto md:flex-row md:items-center">
              <NavLink to="/login" className={navLink}>Log in</NavLink>
              <Link to="/signup" className="btn btn-primary">Get started</Link>
            </div>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
