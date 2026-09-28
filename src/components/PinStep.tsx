/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { ShieldCheck, Lock, AlertCircle, Clock, ArrowRight, LogOut, CheckCircle2 } from 'lucide-react';
import { setupPin, verifyPin, getPinLockoutStatus } from '../auth/pinSecurity';

interface PinStepProps {
  uid: string;
  userEmail?: string;
  mode: 'setup' | 'verify';
  onSuccess: () => void;
  onSignOut: () => void;
}

export default function PinStep({
  uid,
  userEmail,
  mode,
  onSuccess,
  onSignOut,
}: PinStepProps) {
  const [pin, setPin] = useState<string[]>(['', '', '', '']);
  const [confirmPin, setConfirmPin] = useState<string[]>(['', '', '', '']);
  const [isConfirming, setIsConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [cooldown, setCooldown] = useState<number>(0);
  const [setupComplete, setSetupComplete] = useState(false);

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Check initial lockout state
  useEffect(() => {
    const status = getPinLockoutStatus(uid);
    if (status.isLocked) {
      setCooldown(status.remainingSeconds);
    }
  }, [uid]);

  // Cooldown countdown
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  // Focus first input on mount or step change
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRefs.current[0]?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, [isConfirming]);

  const handleDigitChange = (index: number, val: string, isConfirm = false) => {
    setError(null);
    const cleaned = val.replace(/\D/g, '').slice(-1); // Only single digit
    const targetArr = isConfirm ? [...confirmPin] : [...pin];
    targetArr[index] = cleaned;

    if (isConfirm) {
      setConfirmPin(targetArr);
    } else {
      setPin(targetArr);
    }

    // Auto-advance to next input
    if (cleaned && index < 3) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if 4 digits are complete
    if (cleaned && index === 3) {
      const fullPin = targetArr.join('');
      if (fullPin.length === 4) {
        if (mode === 'setup') {
          if (!isConfirming) {
            // Move to confirm stage
            setTimeout(() => {
              setIsConfirming(true);
              setConfirmPin(['', '', '', '']);
            }, 200);
          } else {
            // Execute setup verification
            handleSetupSubmit(fullPin);
          }
        } else {
          // Verification mode
          handleVerifySubmit(fullPin);
        }
      }
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>, isConfirm = false) => {
    if (e.key === 'Backspace') {
      const targetArr = isConfirm ? confirmPin : pin;
      if (!targetArr[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    }
  };

  const handleSetupSubmit = async (confirmationPin: string) => {
    const originalPin = pin.join('');
    if (originalPin !== confirmationPin) {
      setError('PINs do not match. Please enter your PIN again.');
      setIsConfirming(false);
      setPin(['', '', '', '']);
      setConfirmPin(['', '', '', '']);
      setTimeout(() => inputRefs.current[0]?.focus(), 100);
      return;
    }

    setIsSubmitting(true);
    try {
      await setupPin(uid, originalPin);
      setSetupComplete(true);
      setTimeout(() => {
        onSuccess();
      }, 700);
    } catch (err: any) {
      setError(err?.message || 'Failed to set up PIN. Please retry.');
      setIsConfirming(false);
      setPin(['', '', '', '']);
      setConfirmPin(['', '', '', '']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifySubmit = async (enteredPin: string) => {
    setIsSubmitting(true);
    try {
      const res = await verifyPin(uid, enteredPin);
      if (res.success) {
        onSuccess();
      } else {
        setError(res.message || 'Incorrect PIN.');
        setPin(['', '', '', '']);
        if (res.isLocked && res.remainingSeconds) {
          setCooldown(res.remainingSeconds);
        } else {
          setTimeout(() => inputRefs.current[0]?.focus(), 100);
        }
      }
    } catch {
      setError('An error occurred during verification. Please retry.');
      setPin(['', '', '', '']);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVirtualKeyClick = (digit: string) => {
    if (cooldown > 0 || isSubmitting) return;
    const currentArr = isConfirming ? confirmPin : pin;
    const nextEmptyIndex = currentArr.findIndex((v) => !v);
    if (nextEmptyIndex !== -1) {
      handleDigitChange(nextEmptyIndex, digit, isConfirming);
    }
  };

  const handleVirtualBackspace = () => {
    if (cooldown > 0 || isSubmitting) return;
    const currentArr = isConfirming ? [...confirmPin] : [...pin];
    for (let i = 3; i >= 0; i--) {
      if (currentArr[i]) {
        currentArr[i] = '';
        if (isConfirming) setConfirmPin(currentArr);
        else setPin(currentArr);
        inputRefs.current[i]?.focus();
        break;
      }
    }
  };

  const activeArray = isConfirming ? confirmPin : pin;

  return (
    <div className="bg-slate-50 min-h-screen py-10 px-4 md:px-6 flex items-center justify-center font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
        
        {/* Header */}
        <div className="border-b border-slate-100 px-6 py-5 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-black">
              <Lock className="w-4 h-4" />
            </div>
            <div>
              <h1 className="text-sm font-bold text-slate-900">
                {mode === 'setup' ? 'Set Up Quick Access PIN' : 'Device Security Check'}
              </h1>
              <p className="text-[11px] text-slate-500">
                {userEmail || 'BlizFlow Security Layer'}
              </p>
            </div>
          </div>
          <button
            onClick={onSignOut}
            title="Sign out of this session"
            className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 md:p-8 space-y-6">
          <div className="text-center space-y-1.5">
            <h2 className="text-lg font-bold text-slate-900">
              {mode === 'setup'
                ? isConfirming
                  ? 'Confirm Your 4-Digit PIN'
                  : 'Create Your 4-Digit PIN'
                : 'Enter Your BlizFlow PIN'}
            </h2>
            <p className="text-xs text-slate-500 max-w-xs mx-auto">
              {mode === 'setup'
                ? isConfirming
                  ? 'Re-enter the 4 digits to confirm your device PIN.'
                  : 'Fast and secure local device unlock for your store.'
                : 'Enter your 4-digit PIN to access your merchant portal on this device.'}
            </p>
          </div>

          {cooldown > 0 && (
            <div className="bg-amber-50 border border-amber-200 text-amber-800 text-xs p-3 rounded-xl flex items-center gap-2 font-medium">
              <Clock className="w-4 h-4 text-amber-600 flex-shrink-0" />
              <span>Too many incorrect attempts. Locked for <strong>{cooldown}s</strong></span>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 text-xs p-3 rounded-xl flex items-start gap-2 font-medium">
              <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {setupComplete ? (
            <div className="py-8 flex flex-col items-center justify-center gap-3 text-emerald-600">
              <CheckCircle2 className="w-12 h-12 animate-bounce" />
              <p className="text-sm font-bold text-slate-800">PIN Configured Successfully!</p>
              <p className="text-xs text-slate-500">Entering your merchant onboarding area...</p>
            </div>
          ) : (
            <>
              {/* 4-Digit Input Boxes */}
              <div className="flex justify-center gap-3 md:gap-4 my-2">
                {[0, 1, 2, 3].map((index) => (
                  <div key={index} className="relative">
                    <input
                      ref={(el) => { inputRefs.current[index] = el; }}
                      type="password"
                      inputMode="numeric"
                      pattern="[0-9]*"
                      maxLength={1}
                      disabled={cooldown > 0 || isSubmitting}
                      value={activeArray[index]}
                      onChange={(e) => handleDigitChange(index, e.target.value, isConfirming)}
                      onKeyDown={(e) => handleKeyDown(index, e, isConfirming)}
                      className={`w-12 h-14 md:w-14 md:h-16 text-center text-xl md:text-2xl font-black rounded-xl border transition-all ${
                        activeArray[index]
                          ? 'border-indigo-600 bg-indigo-50/30 text-indigo-950 shadow-sm'
                          : 'border-slate-200 bg-slate-50 focus:bg-white focus:border-indigo-500'
                      } focus:outline-none focus:ring-2 focus:ring-indigo-500/20 disabled:opacity-50`}
                    />
                  </div>
                ))}
              </div>

              {/* On-Screen Numeric Keypad for Mobile/Touch convenience */}
              <div className="max-w-[280px] mx-auto grid grid-cols-3 gap-2.5 pt-2">
                {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
                  <button
                    key={digit}
                    type="button"
                    disabled={cooldown > 0 || isSubmitting}
                    onClick={() => handleVirtualKeyClick(digit)}
                    className="h-12 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-bold text-base transition duration-150 cursor-pointer disabled:opacity-40"
                  >
                    {digit}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    if (isConfirming) {
                      setIsConfirming(false);
                      setPin(['', '', '', '']);
                      setConfirmPin(['', '', '', '']);
                    }
                  }}
                  disabled={!isConfirming || isSubmitting}
                  className="h-12 rounded-xl text-slate-400 hover:text-slate-600 font-medium text-xs transition duration-150 cursor-pointer disabled:opacity-0"
                >
                  Reset
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || isSubmitting}
                  onClick={() => handleVirtualKeyClick('0')}
                  className="h-12 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-800 font-bold text-base transition duration-150 cursor-pointer disabled:opacity-40"
                >
                  0
                </button>
                <button
                  type="button"
                  disabled={cooldown > 0 || isSubmitting}
                  onClick={handleVirtualBackspace}
                  className="h-12 rounded-xl bg-slate-50 hover:bg-slate-100 active:bg-slate-200 text-slate-500 font-medium text-xs transition duration-150 cursor-pointer disabled:opacity-40 flex items-center justify-center"
                >
                  ⌫
                </button>
              </div>

              {/* Footer info */}
              <div className="pt-2 text-center">
                <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  Cryptographically protected with Web Crypto PBKDF2
                </p>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
