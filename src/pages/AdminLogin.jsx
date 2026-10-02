import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { loginAdmin, onAdminAuthChanged, isFirebaseConfigured } from '../services/adminAuth';

// Inline SVG icons (no external dependencies)
const EyeIcon = ({ open }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {open ? (
      <>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </>
    ) : (
      <>
        <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
        <line x1="1" y1="1" x2="23" y2="23" />
      </>
    )}
  </svg>
);

const LockIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const ArrowLeftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="19" y1="12" x2="5" y2="12" />
    <polyline points="12 19 5 12 12 5" />
  </svg>
);

export default function AdminLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If already logged in as admin, redirect to dashboard
  useEffect(() => {
    const unsub = onAdminAuthChanged((adminUser) => {
      if (adminUser) {
        const from = location.state?.from || '/admin/dashboard';
        navigate(from, { replace: true });
      }
    });
    return () => unsub();
  }, [navigate, location]);

  const validateEmail = (val) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setError('Email address is required.');
      return;
    }
    if (!validateEmail(cleanEmail)) {
      setError('Please enter a valid email address.');
      return;
    }
    if (!cleanPassword) {
      setError('Password is required.');
      return;
    }

    setLoading(true);

    try {
      await loginAdmin(cleanEmail, cleanPassword, rememberMe);
      const from = location.state?.from || '/admin/dashboard';
      navigate(from, { replace: true });
    } catch (err) {
      console.warn('Admin Sign In:', err?.message || err);
      setError(err.message || 'Incorrect email or password.');
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-page flex flex-col items-center justify-center min-h-[85vh] p-4 bg-slate-950">
      <div className="admin-login-card bg-slate-900 p-8 rounded-2xl border border-slate-800 shadow-2xl max-w-md w-full space-y-6">
        {/* Logo */}
        <div className="admin-login-logo flex justify-center">
          <div className="logo-mark">
            <svg width="40" height="40" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#4f46e5" />
              <path d="M10 16l4 4 8-8" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        </div>

        <div className="text-center">
          <h1 className="admin-login-title text-xl font-black text-white">BlizFlow Admin</h1>
          <p className="admin-login-subtitle text-xs text-slate-400 mt-1.5 leading-relaxed">
            Secure administrator access.
            <br />
            Only authorized BlizFlow administrators can access this portal.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="admin-login-form space-y-4" noValidate>
          {/* Email */}
          <div className="form-group flex flex-col gap-1.5">
            <label htmlFor="admin-email" className="text-xs font-bold text-slate-300">Email address</label>
            <input
              id="admin-email"
              type="email"
              autoComplete="email"
              placeholder="Enter administrator email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              className={`w-full px-3.5 py-2.5 bg-slate-800 border border-slate-750 text-white rounded-xl text-xs font-medium focus:bg-slate-850 focus:outline-none focus:border-indigo-500 transition ${error ? 'border-red-500/50 bg-red-950/20' : ''}`}
            />
          </div>

          {/* Password */}
          <div className="form-group flex flex-col gap-1.5">
            <label htmlFor="admin-password" className="text-xs font-bold text-slate-300">Password</label>
            <div className="password-wrapper relative">
              <input
                id="admin-password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
                className={`w-full pl-3.5 pr-10 py-2.5 bg-slate-800 border border-slate-750 text-white rounded-xl text-xs font-medium focus:bg-slate-850 focus:outline-none focus:border-indigo-500 transition ${error ? 'border-red-500/50 bg-red-950/20' : ''}`}
              />
              <button
                type="button"
                className="password-toggle absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-300 transition"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                <EyeIcon open={showPassword} />
              </button>
            </div>
          </div>

          {/* Remember me */}
          <div className="form-row flex items-center justify-between">
            <label className="checkbox-label flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="w-4 h-4 rounded border-slate-700 bg-slate-800 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-xs text-slate-300 font-medium">Remember me</span>
            </label>
          </div>

          {/* Error */}
          {error && (
            <div className="login-error flex items-center gap-2 bg-red-950/40 text-red-400 border border-red-900/40 p-3 rounded-xl text-xs animate-shake" role="alert">
              <LockIcon />
              <span>{error}</span>
            </div>
          )}

          {/* Sign In */}
          <button
            type="submit"
            className="btn-signin w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-indigo-600/10"
            disabled={loading}
          >
            {loading ? (
              <>
                <span className="spinner-inline animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                Signing in...
              </>
            ) : (
              'Sign In'
            )}
          </button>

          {/* Back to Merchant Portal */}
          <button
            type="button"
            className="btn-back w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-bold rounded-xl transition flex items-center justify-center gap-1.5 cursor-pointer"
            onClick={() => navigate('/')}
            disabled={loading}
          >
            <ArrowLeftIcon />
            <span>Back to Merchant Portal</span>
          </button>
        </form>
      </div>
    </div>
  );
}
