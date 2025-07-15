import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { FileText, BarChart3, Home } from 'lucide-react';

import { useNavigate } from 'react-router-dom';

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const navItems = [
    { path: '/', label: 'Home', icon: Home },
    { path: '/analyze', label: 'Analyze', icon: FileText },
    { path: '/results', label: 'Results', icon: BarChart3 },
  ];

   const handleLogout = () => {
  console.log('Token before logout:', localStorage.getItem('token'));
  console.log('User before logout:', localStorage.getItem('user'));

  localStorage.removeItem('token');
  localStorage.removeItem('user');  

  console.log('After logout, token:', localStorage.getItem('token'));
  console.log('After logout, user:', localStorage.getItem('user'));

  navigate('/login');
};


  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
           
          <Link to="/" className="flex items-center space-x-2">
            <motion.div
              whileHover={{ scale: 1.05 }}
              className="w-8 h-8 bg-primary-600 rounded-lg flex items-center justify-center"
            >
              <FileText className="w-5 h-5 text-white" />
            </motion.div>
            <div>
              <h1 className="text-xl font-bold text-gradient">ATS Resume Checker</h1>
              <p className="text-xs text-gray-500">AI-Powered Analysis</p>
            </div>
          </Link>

           
          <nav className="hidden md:flex space-x-8">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={`flex items-center space-x-2 px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200 ${
                    isActive
                      ? 'bg-primary-100 text-primary-700'
                      : 'text-gray-600 hover:text-primary-600 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
            <button
              onClick={handleLogout}
              className="ml-4 px-3 py-2 rounded-md text-sm font-medium text-red-600 hover:text-red-800 hover:bg-red-100 transition-colors duration-200"
            >
              Logout
            </button>
          </nav>

           
          <div className="md:hidden">
            <button className="p-2 rounded-md text-gray-600 hover:text-primary-600 hover:bg-gray-50">
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