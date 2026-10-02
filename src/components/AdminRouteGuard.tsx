/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { onAdminAuthChanged, getSynchronousAdminUser } from '../services/adminAuth';

interface AdminRouteGuardProps {
  children: React.ReactNode;
}

const AUTH_CHECK_TIMEOUT_MS = 3000;

export default function AdminRouteGuard({ children }: AdminRouteGuardProps) {
  const syncAdmin = getSynchronousAdminUser();
  const [checking, setChecking] = useState(!syncAdmin);
  const [isAdmin, setIsAdmin]   = useState(!!syncAdmin);
  const navigate  = useNavigate();
  const location  = useLocation();

  const locationRef = useRef(location.pathname);
  useEffect(() => {
    locationRef.current = location.pathname;
  }, [location.pathname]);

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // If we already know the admin is authenticated synchronously, do not set any timeout
    if (!syncAdmin) {
      timeoutRef.current = setTimeout(() => {
        console.warn('[AdminRouteGuard] Auth check timed out. Redirecting to login.');
        setChecking(false);
        setIsAdmin(false);
        navigate('/admin/login', {
          replace: true,
          state: { from: locationRef.current },
        });
      }, AUTH_CHECK_TIMEOUT_MS);
    }

    let unsub: (() => void) | undefined;

    try {
      unsub = onAdminAuthChanged(adminUser => {
        // Clear any pending timeout immediately
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }

        if (!adminUser) {
          setIsAdmin(false);
          setChecking(false);
          navigate('/admin/login', {
            replace: true,
            state: { from: locationRef.current },
          });
        } else {
          setIsAdmin(true);
          setChecking(false);
        }
      });
    } catch (err) {
      console.error('[AdminRouteGuard] Auth subscription failed:', err);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      setChecking(false);
      setIsAdmin(false);
      navigate('/admin/login', {
        replace: true,
        state: { from: locationRef.current },
      });
    }

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (unsub) unsub();
    };
  }, [navigate, syncAdmin]);

  // Loading state (only shown if no cached admin session exists on initial cold load)
  if (checking) {
    return (
      <div
        className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 space-y-4"
        role="status"
        aria-live="polite"
      >
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600" />
        <p className="text-sm text-slate-500 font-bold">
          Verifying administrator access...
        </p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return <>{children}</>;
}
