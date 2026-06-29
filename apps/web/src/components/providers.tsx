import { TooltipProvider } from '@jasonruesch/react';
import type { ReactNode } from 'react';
import { useApplyTheme } from '~/stores/theme.store';

/**
 * App-wide providers, mounted once in the root layout: tooltip timing from the
 * design system, plus reflecting the persisted theme/brand onto <html>.
 */
export function Providers({ children }: { children: ReactNode }) {
  useApplyTheme();
  return <TooltipProvider delayDuration={300}>{children}</TooltipProvider>;
}
