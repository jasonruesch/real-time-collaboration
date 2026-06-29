import { Link } from 'react-router';
import { Outlet } from 'react-router';
import { Providers } from '~/components/providers';
import { ThemeToggle } from '~/components/theme-toggle';

/** Root layout: app-wide providers plus the persistent top bar. */
export default function RootLayout() {
  return (
    <Providers>
      <div className="flex h-full flex-col">
        <header className="flex items-center justify-between border-b border-line px-4 py-2">
          <Link to="/" className="flex items-center gap-2 font-semibold">
            <span
              className="inline-block size-4 rounded-full bg-accent"
              aria-hidden
            />
            Coalesce
          </Link>
          <ThemeToggle />
        </header>
        <main className="min-h-0 flex-1">
          <Outlet />
        </main>
      </div>
    </Providers>
  );
}
