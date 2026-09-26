import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, BarChart3, Home, LogOut, LayoutDashboard, UserPlus, LogIn } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, logout } = useAuth();

  const publicNavItems = [
    { path: '/', label: 'Home', icon: Home },
  ];

  const authNavItems = [
    { path: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { path: '/analyze', label: 'Analyze', icon: FileText },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const navItems = isAuthenticated ? authNavItems : publicNavItems;

  return (
    <header className="bg-white shadow-sm border-b border-slate-200 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <Link to="/" className="flex items-center space-x-3">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-10 h-10 bg-sky-600 rounded-xl flex items-center justify-center shadow-md"
            >
              <FileText className="w-6 h-6 text-white" />
            </motion.div>
            <div>
              <h1 className="text-xl font-extrabold text-slate-800 tracking-tight">ATS Resume Checker</h1>
              <p className="text-xs text-sky-600 font-medium">AI Career Intelligence</p>
            </div>
          </Link>

          <nav className="hidden md:flex space-x-6 items-center">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-sky-50 text-sky-700 shadow-sm border border-sky-100'
                      : 'text-slate-600 hover:text-sky-600 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            
            <div className="w-px h-6 bg-slate-200 mx-2"></div>

            {isAuthenticated ? (
              <button
                onClick={handleLogout}
                className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-red-600 hover:bg-red-50 transition-colors duration-200"
              >
                <LogOut className="w-4 h-4" />
                <span>Logout</span>
              </button>
            ) : (
              <div className="flex space-x-3">
                <Link
                  to="/login"
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold text-slate-600 hover:text-sky-600 hover:bg-slate-50 transition-colors"
                >
                  <LogIn className="w-4 h-4" />
                  <span>Log in</span>
                </Link>
                <Link
                  to="/signup"
                  className="flex items-center space-x-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 shadow-md transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Sign up free</span>
                </Link>
              </div>
            )}
          </nav>

          <div className="md:hidden">
            <button className="p-2 rounded-md text-slate-600 hover:text-sky-600 hover:bg-slate-50">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header; 