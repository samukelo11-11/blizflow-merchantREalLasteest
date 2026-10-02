import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAdminAuthChanged } from '../services/adminAuth';

interface AdminRouteGuardProps {
  children: React.ReactNode;
}

// FIX 2: Reduced from 10s to 3s — Firebase auth resolves in under 2s
// on a normal connection. 10s is long enough for the admin to think
// the app is broken.
const AUTH_CHECK_TIMEOUT_MS = 3000;

export default function AdminRouteGuard({ children }: AdminRouteGuardProps) {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin]   = useState(false);
  const navigate  = useNavigate();
  const location  = useLocation();

  // Store location.pathname in a ref so the effect can access the
  // current path without re-running when it changes.
  // FIX 1: location.pathname removed from dependency array so the
  // effect only runs once on mount, not on every admin page navigation.
  const locationRef = useRef(location.pathname);
  useEffect(() => { locationRef.current = location.pathname; }, [location.pathname]);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    try {
      unsub = onAdminAuthChanged(adminUser => {
        // Auth state received — clear safety timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        if (!adminUser) {
          navigate('/admin/login', {
            replace: true,
            state: { from: locationRef.current },
          });
        } else {
          setIsAdmin(true);
        }
        setChecking(false);
      });

      // FIX 2: 3s timeout — fast enough to not look broken,
      // long enough for slow connections
      timeoutRef.current = setTimeout(() => {
        console.warn('[AdminRouteGuard] Auth check timed out. Redirecting to login.');
        setChecking(false);
        navigate('/admin/login', {
          replace: true,
          state: { from: locationRef.current },
        });
      }, AUTH_CHECK_TIMEOUT_MS);

    } catch (err) {
      console.error('[AdminRouteGuard] Auth initialization failed:', err);
      setChecking(false);
      navigate('/admin/login', {
        replace: true,
        state: { from: locationRef.current },
      });
    }

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (unsub) unsub();
    };
  // FIX 1: Only navigate in deps — location.pathname removed
  }, [navigate]);

  if (checking) {
    return (
      <div
        className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 space-y-4"
        role="status"
        aria-live="polite"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        <p className="text-sm text-slate-500 font-bold animate-pulse">
          Verifying admin access...
        </p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}