import { useEffect } from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeMode = 'light' | 'dark' | 'system';
export type Brand = 'default' | 'acme';

interface ThemeState {
  theme: ThemeMode;
  brand: Brand;
  setTheme: (theme: ThemeMode) => void;
  setBrand: (brand: Brand) => void;
}

/** Appearance preferences (client state), persisted across reloads. */
export const useThemeStore = create<ThemeState>()(
  persist(
    (set) => ({
      theme: 'system',
      brand: 'default',
      setTheme: (theme) => set({ theme }),
      setBrand: (brand) => set({ brand }),
    }),
    { name: 'coalesce-theme' },
  ),
);

function resolveTheme(mode: ThemeMode): 'light' | 'dark' {
  if (mode !== 'system') return mode;
  return window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

/**
 * Reflect theme/brand onto the <html> element via `data-theme` / `data-brand`,
 * which is how `@jasonruesch/react` switches its token palette. Re-runs when the
 * preference changes and follows the OS when set to "system".
 */
export function useApplyTheme(): void {
  const theme = useThemeStore((s) => s.theme);
  const brand = useThemeStore((s) => s.brand);

  useEffect(() => {
    const root = document.documentElement;
    const apply = () => root.setAttribute('data-theme', resolveTheme(theme));
    apply();
    root.setAttribute('data-brand', brand);

    if (theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, brand]);
}
