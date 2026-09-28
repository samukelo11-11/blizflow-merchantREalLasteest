import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAdminAuthChanged } from '../services/adminAuth';

interface AdminRouteGuardProps {
  children: React.ReactNode;
}

const AUTH_CHECK_TIMEOUT_MS = 10000;

export default function AdminRouteGuard({ children }: AdminRouteGuardProps) {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let unsub: (() => void) | undefined;

    try {
      unsub = onAdminAuthChanged((adminUser) => {
        // Auth state received — clear safety timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        if (!adminUser) {
          navigate('/admin/login', {
            replace: true,
            state: { from: location.pathname },
          });
        } else {
          setIsAdmin(true);
        }
        setChecking(false);
      });

      // Safety net: prevent permanent "checking" if auth listener never fires
      timeoutRef.current = setTimeout(() => {
        console.warn('AdminRouteGuard: Auth check timed out. Redirecting to login.');
        setChecking(false);
        navigate('/admin/login', {
          replace: true,
          state: { from: location.pathname },
        });
      }, AUTH_CHECK_TIMEOUT_MS);
    } catch (err) {
      console.error('AdminRouteGuard: Auth initialization failed.', err);
      setChecking(false);
      navigate('/admin/login', {
        replace: true,
        state: { from: location.pathname },
      });
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (unsub) {
        unsub();
      }
    };
  }, [navigate, location.pathname]);

  if (checking) {
    return (
      <div
        className="admin-loading-screen flex flex-col items-center justify-center p-8 min-h-[50vh] space-y-4"
        role="status"
        aria-live="polite"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        <p className="text-sm text-slate-500 font-bold animate-pulse">Verifying admin access...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}