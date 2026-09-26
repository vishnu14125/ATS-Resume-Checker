import React, { Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router-dom';
import Header from './components/Header';
import Footer from './components/Footer';
import ProtectedRoute from './components/ProtectedRoute';

const HomePage = React.lazy(() => import('./pages/HomePage'));
const Signup = React.lazy(() => import('./pages/SignUp'));
const Login = React.lazy(() => import('./pages/Login'));
const DashboardPage = React.lazy(() => import('./pages/DashboardPage'));
const AnalysisPage = React.lazy(() => import('./pages/AnalysisPage'));
const ResultsPage = React.lazy(() => import('./pages/ResultsPage'));

function App() {
  const location = useLocation();
  const hideHeaderOn = ['/login', '/signup'];

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {!hideHeaderOn.includes(location.pathname) && <Header />}
      <main className="flex-1">
        <Suspense fallback={
          <div className="min-h-screen flex items-center justify-center">
            <div className="w-10 h-10 border-4 border-sky-200 border-t-sky-600 rounded-full animate-spin"></div>
          </div>
        }>
          <Routes>
            <Route path="/" element={<HomePage />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/login" element={<Login />} />
            <Route path="/dashboard" element={
              <ProtectedRoute>
                <DashboardPage />
              </ProtectedRoute>
            } />
            <Route path="/analyze" element={
              <ProtectedRoute>
                <AnalysisPage />
              </ProtectedRoute>
            } />
            <Route path="/results/:id" element={
              <ProtectedRoute>
                <ResultsPage />
              </ProtectedRoute>
            } />
          </Routes>
        </Suspense>
      </main>
      <Footer />
    </div>
  );
}

export default App;
