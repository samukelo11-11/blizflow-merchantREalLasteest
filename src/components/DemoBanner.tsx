/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { 
  Sparkles, 
  RotateCcw, 
  LogOut, 
  UserPlus, 
  Info, 
  Check, 
  AlertCircle 
} from 'lucide-react';

interface DemoBannerProps {
  onResetDemo: () => void;
  onExitDemo: () => void;
  onCreateRealAccount: () => void;
}

export default function DemoBanner({
  onResetDemo,
  onExitDemo,
  onCreateRealAccount
}: DemoBannerProps) {
  const [resetFeedback, setResetFeedback] = useState(false);
  const [showConfirmReset, setShowConfirmReset] = useState(false);

  const handleResetClick = () => {
    onResetDemo();
    setShowConfirmReset(false);
    setResetFeedback(true);
    setTimeout(() => setResetFeedback(false), 2500);
  };

  return (
    <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-indigo-700 text-white shadow-md border-b border-amber-400/40 relative z-50">
      <div className="max-w-7xl mx-auto px-4 py-2 flex flex-col md:flex-row items-center justify-between gap-2.5">
        
        {/* Left: Badge & Sandbox Explainer */}
        <div className="flex items-center gap-2.5 text-center md:text-left flex-wrap justify-center">
          <div className="flex items-center gap-1.5 bg-black/30 backdrop-blur-xs px-2.5 py-0.5 rounded-full border border-white/20">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-black uppercase tracking-wider text-amber-200">
              Interactive Demo Sandbox
            </span>
          </div>
          <span className="text-xs font-medium text-amber-50">
            Isolated local store — Feel free to ring up sales, restock, or add expenses!
          </span>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {resetFeedback && (
            <span className="bg-emerald-600 text-white text-[11px] font-bold px-2.5 py-1 rounded-lg flex items-center gap-1 shadow-xs animate-fade-in">
              <Check className="w-3.5 h-3.5" /> Demo Reset Complete!
            </span>
          )}

          {showConfirmReset ? (
            <div className="flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-lg border border-white/30">
              <span className="text-[11px] font-bold text-amber-200">Reset to starter demo data?</span>
              <button
                type="button"
                onClick={handleResetClick}
                className="bg-amber-400 hover:bg-amber-300 text-slate-950 text-[11px] font-black px-2 py-0.5 rounded transition cursor-pointer"
              >
                Yes
              </button>
              <button
                type="button"
                onClick={() => setShowConfirmReset(false)}
                className="text-white hover:text-slate-200 text-[11px] font-medium px-1 cursor-pointer"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowConfirmReset(true)}
              className="bg-white/15 hover:bg-white/25 active:bg-white/30 text-white text-xs font-bold px-2.5 py-1 rounded-lg border border-white/20 transition flex items-center gap-1 cursor-pointer shadow-2xs"
              title="Reset sample products and sales back to defaults"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset Demo</span>
            </button>
          )}

          <button
            type="button"
            onClick={onCreateRealAccount}
            className="bg-white hover:bg-amber-50 text-indigo-950 text-xs font-black px-3 py-1 rounded-lg shadow-sm transition flex items-center gap-1.5 cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
            <span>Create Real Account</span>
          </button>

          <button
            type="button"
            onClick={onExitDemo}
            className="bg-black/25 hover:bg-black/40 text-white text-xs font-bold px-2.5 py-1 rounded-lg border border-white/10 transition flex items-center gap-1 cursor-pointer"
            title="Leave Demo Sandbox"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit Demo</span>
          </button>
        </div>

      </div>
    </div>
  );
}
