import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';
import { getMe } from '../lib/api';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [token, setToken] = useState(localStorage.getItem('token') || null);

  const [user, setUser] = useState(null);

  const login = (newToken) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
  };

  // The profile is only used for display (name, initial); a failure leaves it empty.
  useEffect(() => {
    if (token) getMe().then(setUser).catch(() => {});
  }, [token]);

  useEffect(() => {
    const interceptor = axios.interceptors.response.use(
      (response) => response,
      (error) => {
        // A 401 from login or register is a wrong password, not an expired session.
        if (error.response?.status === 401 && !error.config?.url?.includes('/auth/')) {
          logout();
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
    return () => axios.interceptors.response.eject(interceptor);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, login, logout, isAuthenticated: !!token }}>
      {children}
    </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
