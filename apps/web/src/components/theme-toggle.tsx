import { IconButton } from '@jasonruesch/react';
import { Monitor, Moon, Sun } from 'lucide-react';
import { type ThemeMode, useThemeStore } from '~/stores/theme.store';

const ORDER: ThemeMode[] = ['light', 'dark', 'system'];
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const NEXT_LABEL = { light: 'dark', dark: 'system', system: 'light' } as const;

/** Cycles light → dark → system. */
export function ThemeToggle() {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const Icon = ICON[theme];

  return (
    <IconButton
      variant="ghost"
      aria-label={`Theme: ${theme}. Switch to ${NEXT_LABEL[theme]}.`}
      onClick={() => setTheme(ORDER[(ORDER.indexOf(theme) + 1) % ORDER.length])}
    >
      <Icon size={18} aria-hidden />
    </IconButton>
  );
}
