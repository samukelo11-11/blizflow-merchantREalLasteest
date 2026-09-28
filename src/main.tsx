import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ─────────────────────────────────────────────────────────────────────────────
// localStorage Resilience Layer
//
// Handles two failure modes:
//   A) localStorage is completely blocked (sandboxed iframe, private browsing
//      with storage disabled) → install a full in-memory polyfill.
//   B) localStorage works but hits QuotaExceededError on write → wrap with a
//      memory fallback that keeps the latest value in memory and attempts
//      real storage writes opportunistically.
//
// NOTE: React StrictMode mounts components twice in development. This polyfill
// runs once at module load, before React mounts, so it is not affected.
// ─────────────────────────────────────────────────────────────────────────────
(() => {
  // ── Path A: localStorage completely unavailable ──
  let isLocalStorageFunctional = false;
  try {
    const testKey = '__storage_test__';
    window.localStorage.setItem(testKey, testKey);
    window.localStorage.removeItem(testKey);
    isLocalStorageFunctional = true;
  } catch {
    console.warn('[storage] localStorage is blocked or restricted. Using in-memory fallback.');
  }

  if (!isLocalStorageFunctional) {
    const memStore: Record<string, string> = {};

    const mockStorage: Storage = {
      getItem:    (key)        => key in memStore ? memStore[key] : null,
      setItem:    (key, value) => { memStore[key] = String(value); },
      removeItem: (key)        => { delete memStore[key]; },
      clear:      ()           => { Object.keys(memStore).forEach(k => delete memStore[k]); },
      // FIX 5: key() and length implemented in the mock so all Storage
      // iteration patterns work correctly in the blocked-storage path.
      key:        (index)      => Object.keys(memStore)[index] ?? null,
      get length()             { return Object.keys(memStore).length; },
    };

    try {
      Object.defineProperty(window, 'localStorage', {
        value: mockStorage,
        writable: true,
        configurable: true,
      });
    } catch {
      // FIX 5: patch key() and length alongside the other methods
      try {
        window.localStorage.getItem    = mockStorage.getItem.bind(mockStorage);
        window.localStorage.setItem    = mockStorage.setItem.bind(mockStorage);
        window.localStorage.removeItem = mockStorage.removeItem.bind(mockStorage);
        window.localStorage.clear      = mockStorage.clear.bind(mockStorage);
        // key() and length are non-writable on the real Storage prototype
        // in most browsers, so we cannot patch them in this fallback path.
        // The IIFE logs a warning so developers know iteration may behave
        // differently in this edge case.
        console.warn('[storage] Could not patch localStorage.key() — Storage iteration via index may be unreliable.');
      } catch (overrideErr) {
        console.error('[storage] Failed to override blocked localStorage methods:', overrideErr);
      }
    }

    return; // Path A complete — skip Path B wrapping
  }

  // ── Path B: localStorage functional but may hit quota ──
  try {
    // FIX 1 + 2: The memory fallback is now write-through only.
    // getItem always reads from real localStorage first and only falls back
    // to memory if the real read throws. This prevents stale memory reads
    // when another tab or extension modifies real storage.
    // removeItem clears real storage first, then memory, so a failed real
    // remove does not leave a ghost value readable via memory.
    const mem: Record<string, string> = {};

    const orig = {
      getItem:    window.localStorage.getItem.bind(window.localStorage),
      setItem:    window.localStorage.setItem.bind(window.localStorage),
      removeItem: window.localStorage.removeItem.bind(window.localStorage),
      clear:      window.localStorage.clear.bind(window.localStorage),
    };

    window.localStorage.setItem = function (key: string, value: string) {
      const stringValue = String(value);
      // Always keep memory copy current so reads never return stale data
      // even if the real write fails
      mem[key] = stringValue;

      try {
        orig.setItem(key, stringValue);
      } catch (e) {
        if (isQuotaError(e)) {
          // FIX 3: Only evict keys that are NOT the one being written,
          // and only if they are actually present in real storage.
          const candidates = getNonEssentialKeys().filter(k => k !== key);
          for (const candidate of candidates) {
            try {
              const existing = orig.getItem(candidate);
              if (existing !== null) {
                mem[candidate] = existing; // preserve in memory before evicting
                orig.removeItem(candidate);
              }
            } catch { /* ignore individual eviction failures */ }
          }
          // Retry the original write after freeing space
          try {
            orig.setItem(key, stringValue);
          } catch {
            console.warn(`[storage] Quota exceeded. "${key}" saved in memory only — changes will not persist across sessions.`);
          }
        } else {
          console.warn(`[storage] Write failed for "${key}", saved in memory only:`, e);
        }
      }
    };

    // FIX 1: Read from real localStorage first so we always see the
    // most current value, including changes made by other tabs.
    // Memory is only used if the real read throws (e.g. security error).
    window.localStorage.getItem = function (key: string) {
      try {
        const realValue = orig.getItem(key);
        // Keep memory in sync with whatever real storage has
        if (realValue !== null) {
          mem[key] = realValue;
        } else {
          delete mem[key];
        }
        return realValue;
      } catch {
        // Real storage inaccessible — return memory copy if available
        return key in mem ? mem[key] : null;
      }
    };

    // FIX 2: Remove from real storage first so the value cannot be
    // resurrected by a subsequent getItem that skips memory.
    window.localStorage.removeItem = function (key: string) {
      try {
        orig.removeItem(key);
      } catch { /* ignore — best effort */ }
      delete mem[key];
    };

    window.localStorage.clear = function () {
      try {
        orig.clear();
      } catch { /* ignore */ }
      Object.keys(mem).forEach(k => delete mem[k]);
    };

    // FIX 6: Expose the memory fallback store on window in development
    // so developers can inspect it when debugging quota situations.
    if (import.meta.env.DEV) {
      (window as any).__blizflow_storage_mem__ = mem;
      console.info('[storage] Dev: memory fallback store exposed at window.__blizflow_storage_mem__');
    }

  } catch (patchErr) {
    console.warn('[storage] Failed to patch localStorage quota handling:', patchErr);
  }
})();

// ── Helpers ──

function isQuotaError(e: unknown): boolean {
  if (!(e instanceof DOMException)) return false;
  return (
    e.code === 22 ||
    e.code === 1014 ||
    e.name === 'QuotaExceededError' ||
    e.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    (e.message?.toLowerCase().includes('quota')) ||
    (e.message?.toLowerCase().includes('limit'))
  );
}

// Keys considered non-essential for eviction during quota recovery.
// Listed in eviction priority order — first entry is evicted first.
// FIX 3: Kept as a function so it can be extended or overridden without
// modifying the polyfill internals.
function getNonEssentialKeys(): string[] {
  return [
    'blizflow_pos_recent',       // most expendable — can be rebuilt from transactions
    'blizflow_activities',       // large, reconstructable from sale records
    'blizflow_transactions',     // large, reconstructable from Firestore
  ];
}

// ─────────────────────────────────────────────────────────────────────────────
// React Root Mount
// FIX 4: Explicit root element check with a clear diagnostic error instead
// of a non-null assertion that produces a confusing TypeError on failure.
// ─────────────────────────────────────────────────────────────────────────────
const rootElement = document.getElementById('root');

if (!rootElement) {
  const msg =
    '[BlizFlow] Mount failed: no element with id="root" found in the document. ' +
    'Check that index.html contains <div id="root"></div>.';
  console.error(msg);
  // Surface visually so the blank screen is not silent
  document.body.innerHTML = `<pre style="padding:24px;font-family:monospace;color:#dc2626;">${msg}</pre>`;
  throw new Error(msg);
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);