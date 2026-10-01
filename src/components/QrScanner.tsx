import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Camera, Loader2, QrCode, X } from 'lucide-react';

type DetectedCode = { rawValue: string };
type QrDetector = { detect: (source: ImageBitmapSource) => Promise<DetectedCode[]> };

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => QrDetector;
  }
}

interface QrScannerProps {
  open: boolean;
  onClose: () => void;
  onDetected: (value: string) => void;
  title?: string;
}

export default function QrScanner({ open, onClose, onDetected, title = 'Scan QR code' }: QrScannerProps) {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const streamRef     = useRef<MediaStream | null>(null);
  const frameRef      = useRef<number | null>(null);
  const isDetectedRef = useRef(false);
  const hasVideoData  = useRef(false);

  // FIX 1: Stabilise the callback in a ref so the effect closure always
  // calls the latest version without needing to re-run the effect.
  const onDetectedRef = useRef(onDetected);
  useEffect(() => { onDetectedRef.current = onDetected; }, [onDetected]);

  const [status, setStatus]       = useState<'starting' | 'ready' | 'unsupported' | 'error'>('starting');
  const [message, setMessage]     = useState('Opening camera…');
  const [manualValue, setManualValue] = useState('');
  const [videoHasData, setVideoHasData] = useState(false);

  const stopCamera = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!open) {
      setManualValue('');
      setVideoHasData(false);
      hasVideoData.current = false;
      return;
    }

    let disposed = false;
    isDetectedRef.current = false;
    hasVideoData.current  = false;
    setStatus('starting');
    setMessage('Opening camera…');
    setVideoHasData(false);

    const start = async () => {
      const BarcodeDetector = window.BarcodeDetector;
      if (!BarcodeDetector) {
        if (!disposed) {
          setStatus('unsupported');
          setMessage('Camera scanning is not supported in this browser. Use Chrome or Edge on HTTPS, or enter the code manually below.');
        }
        return;
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch (error: any) {
        if (disposed) return;
        setStatus('error');
        if (error?.name === 'NotAllowedError' || error?.message?.includes('Permission')) {
          setMessage('Camera permission was denied. Click the lock icon in your browser address bar to allow access, or enter the code manually below.');
        } else {
          setMessage('Camera is unavailable. Ensure no other app is using it, or enter the code manually below.');
        }
        return;
      }

      if (disposed) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }

      streamRef.current = stream;
      const video = videoRef.current;
      if (!video) { stream.getTracks().forEach(t => t.stop()); return; }

      video.srcObject = stream;

      // FIX 5: Catch play() rejections and route to error state
      try {
        await video.play();
      } catch (playErr) {
        if (disposed) return;
        console.warn('[QrScanner] video.play() rejected:', playErr);
        setStatus('error');
        setMessage('Could not start camera preview. Please try again.');
        return;
      }

      if (disposed) return;

      let detector: QrDetector;
      try {
        detector = new BarcodeDetector({
          formats: ['qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'data_matrix'],
        });
      } catch {
        detector = new BarcodeDetector({ formats: ['qr_code'] });
      }

      setStatus('ready');
      setMessage('Point the camera at a QR code or barcode.');

      const scanFrame = async () => {
        if (disposed || isDetectedRef.current || !videoRef.current) return;
        try {
          if (videoRef.current.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            // FIX 6: Track when video actually has frame data so the
            // guide overlay only appears over a live feed, not a black screen
            if (!hasVideoData.current) {
              hasVideoData.current = true;
              setVideoHasData(true);
            }
            const codes = await detector.detect(videoRef.current);
            const value = codes[0]?.rawValue?.trim();
            if (value && !isDetectedRef.current) {
              isDetectedRef.current = true;
              stopCamera();
              // FIX 1: Call via ref so we always have the latest callback
              onDetectedRef.current(value);
              return;
            }
          }
        } catch {
          // Frame unavailable mid-start — continue scanning
        }
        frameRef.current = requestAnimationFrame(scanFrame);
      };

      frameRef.current = requestAnimationFrame(scanFrame);
    };

    start();

    return () => {
      disposed = true;
      stopCamera();
    };
  }, [open, stopCamera]);

  // FIX 3: Clear manualValue after successful submission without using a nested form element
  const handleManualSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const val = manualValue.trim();
    if (val) {
      setManualValue('');
      onDetectedRef.current(val);
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2 text-slate-900">
            <QrCode className="h-5 w-5 text-indigo-600" />
            <h2 className="text-sm font-black">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">

          {/* Camera viewport */}
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-950">
            <video
              ref={videoRef}
              muted
              playsInline
              className="h-full w-full object-cover"
            />

            {/* FIX 6: Guide overlay only when video has real frame data */}
            {status === 'ready' && videoHasData && (
              <div className="pointer-events-none absolute inset-[15%] rounded-2xl border-2 border-white shadow-[0_0_0_999px_rgba(15,23,42,0.34)]" />
            )}

            {status === 'starting' && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white">
                <Loader2 className="h-7 w-7 animate-spin" />
                <span className="text-xs font-bold">Opening camera</span>
              </div>
            )}

            {(status === 'unsupported' || status === 'error') && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center bg-slate-900">
                <Camera className="h-8 w-8 text-rose-500" />
                {/* FIX 4: aria-live so screen readers announce the error */}
                <span
                  className="text-xs font-semibold leading-relaxed text-slate-200"
                  aria-live="assertive"
                  role="alert"
                >
                  {message}
                </span>
              </div>
            )}
          </div>

          {/* FIX 4: Live region for ready/starting status for screen readers */}
          <p
            className="text-center text-[10px] font-medium text-slate-400"
            aria-live="polite"
          >
            {status === 'ready' ? message : status === 'starting' ? 'Starting camera…' : 'Enter code manually below.'}
          </p>

          {/* Manual input fallback without nested form */}
          <div className="pt-2 border-t border-slate-100">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              Or Enter Manually
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={manualValue}
                onChange={e => setManualValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleManualSubmit();
                  }
                }}
                placeholder="Type barcode or code digits…"
                className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-600 focus:bg-white text-sm text-slate-900 font-mono"
                autoComplete="off"
              />
              <button
                type="button"
                onClick={() => handleManualSubmit()}
                disabled={!manualValue.trim()}
                className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
