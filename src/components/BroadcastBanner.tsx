/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { db } from '../services/firebaseConfig';
import { doc, onSnapshot } from 'firebase/firestore';
import { SystemBroadcast } from '../types';
import { 
  Info, AlertTriangle, AlertCircle, X, Megaphone,
  Clock, ShieldAlert, Sparkles
} from 'lucide-react';

interface BroadcastBannerProps {
  className?: string;
  compact?: boolean;
}

export default function BroadcastBanner({ className = '', compact = false }: BroadcastBannerProps) {
  const [broadcast, setBroadcast] = useState<SystemBroadcast | null>(null);
  const [isDismissed, setIsDismissed] = useState(false);

  // Real-time listener for current platform broadcast
  useEffect(() => {
    let unsub = () => {};

    const checkFallback = async () => {
      // 1. Try localStorage
      try {
        const local = localStorage.getItem('blizflow_current_broadcast');
        if (local) {
          const parsed = JSON.parse(local) as SystemBroadcast;
          if (parsed && parsed.active && parsed.message) {
            setBroadcast(parsed);
            const dismissedVer = sessionStorage.getItem(`blizflow_dismissed_broadcast_${parsed.updatedAt}`);
            setIsDismissed(dismissedVer === 'true');
          }
        }
      } catch {}

      // 2. Try Server API
      try {
        const res = await fetch('/api/broadcast');
        if (res.ok) {
          const json = await res.json();
          if (json.success && json.broadcast && json.broadcast.active) {
            setBroadcast(json.broadcast);
            const dismissedVer = sessionStorage.getItem(`blizflow_dismissed_broadcast_${json.broadcast.updatedAt}`);
            setIsDismissed(dismissedVer === 'true');
          }
        }
      } catch {}
    };

    try {
      unsub = onSnapshot(
        doc(db, 'system_announcements', 'current'),
        (snapshot) => {
          if (snapshot.exists()) {
            const data = snapshot.data() as SystemBroadcast;
            if (data.active && data.message) {
              setBroadcast(data);
              try {
                localStorage.setItem('blizflow_current_broadcast', JSON.stringify(data));
              } catch {}
              // Check if user dismissed this specific version in this session
              const dismissedVer = sessionStorage.getItem(`blizflow_dismissed_broadcast_${data.updatedAt}`);
              setIsDismissed(dismissedVer === 'true');
            } else {
              setBroadcast(null);
            }
          } else {
            checkFallback();
          }
        },
        (err) => {
          console.warn('[BroadcastBanner] Snapshot listener note:', err.message);
          checkFallback();
        }
      );
    } catch (e) {
      console.warn('[BroadcastBanner] Failed to attach announcement listener:', e);
      checkFallback();
    }

    const storageHandler = () => checkFallback();
    window.addEventListener('storage', storageHandler);

    return () => {
      unsub();
      window.removeEventListener('storage', storageHandler);
    };
  }, []);

  const handleDismiss = () => {
    if (!broadcast) return;
    setIsDismissed(true);
    try {
      sessionStorage.setItem(`blizflow_dismissed_broadcast_${broadcast.updatedAt}`, 'true');
    } catch {}
  };

  if (!broadcast || !broadcast.active || isDismissed) {
    return null;
  }

  // Format relative or readable time
  const formatTime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) + ' • ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const typeConfig = {
    info: {
      wrapperBg: 'bg-indigo-950/90 border-indigo-700/70 text-indigo-100',
      badgeBg: 'bg-indigo-900/90 text-indigo-300 border-indigo-700/80',
      badgeLabel: 'SYSTEM UPDATE',
      icon: Info,
      iconColor: 'text-indigo-400',
      accentGlow: 'shadow-indigo-950/40',
    },
    warning: {
      wrapperBg: 'bg-amber-950/90 border-amber-600/70 text-amber-100',
      badgeBg: 'bg-amber-900/90 text-amber-300 border-amber-700/80',
      badgeLabel: 'PLATFORM NOTICE',
      icon: AlertTriangle,
      iconColor: 'text-amber-400',
      accentGlow: 'shadow-amber-950/40',
    },
    urgent: {
      wrapperBg: 'bg-rose-950/95 border-rose-600/80 text-rose-100',
      badgeBg: 'bg-rose-900/90 text-rose-200 border-rose-700/80',
      badgeLabel: 'URGENT ACTION',
      icon: AlertCircle,
      iconColor: 'text-rose-400',
      accentGlow: 'shadow-rose-950/40',
    }
  };

  const config = typeConfig[broadcast.type] || typeConfig.info;
  const IconComponent = config.icon;

  if (compact) {
    return (
      <aside aria-label="System Announcement" className={`w-full py-2 px-4 border-b flex items-center justify-between text-xs backdrop-blur-md shadow-sm transition-all ${config.wrapperBg} ${className}`}>
        <div className="flex items-center gap-2.5 overflow-hidden flex-1 mr-2">
          <div className="shrink-0 p-1 rounded-lg bg-black/20">
            <IconComponent className={`w-3.5 h-3.5 ${config.iconColor}`} />
          </div>
          <span className={`text-[10px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded border shrink-0 ${config.badgeBg}`}>
            {config.badgeLabel}
          </span>
          <div className="truncate">
            {broadcast.title && <strong className="font-bold mr-1.5">{broadcast.title}:</strong>}
            <span className="opacity-95">{broadcast.message}</span>
          </div>
        </div>
        {!broadcast.persistent && (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss system notification"
            className="shrink-0 text-white/70 hover:text-white p-1 rounded hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </aside>
    );
  }

  return (
    <aside aria-label="System Announcement" className={`w-full border-b backdrop-blur-md p-3.5 sm:px-6 shadow-md transition-all ${config.wrapperBg} ${className}`}>
      <div className="max-w-7xl mx-auto flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 flex-1">
          <div className="p-2 rounded-xl bg-black/25 shrink-0 mt-0.5 border border-white/10">
            <IconComponent className={`w-4 h-4 ${config.iconColor}`} />
          </div>

          <div className="space-y-1 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${config.badgeBg}`}>
                {config.badgeLabel}
              </span>
              {broadcast.title && (
                <h4 className="text-xs font-black tracking-tight text-white">
                  {broadcast.title}
                </h4>
              )}
              {broadcast.updatedAt && (
                <span className="text-[10px] opacity-60 flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3 inline" />
                  {formatTime(broadcast.updatedAt)}
                </span>
              )}
              {broadcast.persistent && (
                <span className="text-[9px] font-bold bg-white/10 px-1.5 py-0.5 rounded text-white/80">
                  Required Notice
                </span>
              )}
            </div>

            <p className="text-xs leading-relaxed opacity-95 font-sans whitespace-pre-line">
              {broadcast.message}
            </p>

            {broadcast.author && (
              <span className="text-[10px] opacity-70 block pt-0.5 font-medium">
                Issued by {broadcast.author}
              </span>
            )}
          </div>
        </div>

        {!broadcast.persistent ? (
          <button
            onClick={handleDismiss}
            aria-label="Dismiss system notification"
            className="text-white/60 hover:text-white p-1.5 rounded-lg hover:bg-white/10 transition cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        ) : (
          <span className="text-[10px] text-white/40 italic shrink-0 hidden sm:inline">
            Active Notice
          </span>
        )}
      </div>
    </aside>
  );
}
