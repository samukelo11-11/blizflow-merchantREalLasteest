/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

const DEV_MODE_STORAGE_KEY = 'blizflow_dev_mode';

/**
 * FIX 4: Explicit check callers can use before attempting to enable dev mode.
 * Returns true only when the build itself is a development build.
 * In production bundles import.meta.env.DEV is statically replaced with
 * false by the bundler, so this entire branch tree is tree-shaken out.
 */
export const isDevModeSupported = (): boolean => {
  return Boolean(import.meta.env.DEV);
};

/**
 * FIX 2: Cache the localStorage read result so repeated calls
 * (e.g. from render loops or frequent log calls) do not hammer
 * the DOM storage API on every invocation.
 *
 * The cache is invalidated whenever setDevMode() is called,
 * keeping it consistent without requiring a page reload.
 */
let _devModeCache: boolean | null = null;

/**
 * Returns true only if ALL of the following are true:
 *  - The current build is a development build (import.meta.env.DEV)
 *  - The runtime environment has localStorage available
 *  - The user has explicitly opted in via setDevMode(true)
 *
 * FIX 1: Production builds can never return true here because
 * import.meta.env.DEV is statically false in production, meaning
 * no localStorage value can ever activate dev mode in prod.
 */
export const isDevModeActive = (): boolean => {
  // FIX 1 + 2: Bail out immediately in production — no localStorage
  // read needed at all. Bundler statically eliminates this in prod builds.
  if (!import.meta.env.DEV) return false;

  // FIX 2: Return cached value if available
  if (_devModeCache !== null) return _devModeCache;

  // FIX 5: Guard against non-browser / SSR environments
  if (typeof window === 'undefined' || !window.localStorage) {
    _devModeCache = false;
    return false;
  }

  try {
    _devModeCache = localStorage.getItem(DEV_MODE_STORAGE_KEY) === 'true';
  } catch {
    // localStorage blocked (e.g. private browsing with storage disabled)
    _devModeCache = false;
  }

  return _devModeCache;
};

/**
 * Enables or disables dev mode.
 *
 * FIX 3: Throws in production so any accidental call to setDevMode(true)
 * in prod code surfaces immediately as a loud error during testing,
 * rather than silently writing a flag that isDevModeActive() would
 * then correctly ignore but which pollutes localStorage unnecessarily.
 *
 * FIX 5: Guards against non-browser environments.
 */
export const setDevMode = (active: boolean): void => {
  // FIX 3: Hard block in production
  if (!import.meta.env.DEV) {
    throw new Error(
      '[DevMode] setDevMode() cannot be called in a production build. ' +
      'This is a no-op in prod but throwing so it surfaces in tests.'
    );
  }

  // FIX 5: SSR / non-browser guard
  if (typeof window === 'undefined' || !window.localStorage) {
    console.warn('[DevMode] setDevMode() called in a non-browser environment. Ignored.');
    return;
  }

  try {
    if (active) {
      localStorage.setItem(DEV_MODE_STORAGE_KEY, 'true');
    } else {
      localStorage.removeItem(DEV_MODE_STORAGE_KEY);
    }
  } catch (err) {
    console.warn('[DevMode] Could not write dev mode flag to localStorage:', err);
  }

  // FIX 2: Invalidate the cache so the next isDevModeActive() call
  // reads the updated value instead of returning the stale cached one
  _devModeCache = active;
};
