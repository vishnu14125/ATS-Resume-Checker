import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import axios from 'axios';
import { AuthProvider } from './context/AuthContext';
import './index.css';
import App from './App';

axios.defaults.baseURL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <BrowserRouter>
        <App />
        <Toaster position="bottom-center" toastOptions={{ style: { background: '#0c1326', color: '#fff', fontSize: '14px', borderRadius: '12px' } }} />
      </BrowserRouter>
    </AuthProvider>
  </React.StrictMode>
);
