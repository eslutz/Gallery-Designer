import { Bug, Coffee, Globe, Heart } from 'lucide-react';

// lucide-react's "Github" icon is a hand-drawn outline take on the mark, not
// GitHub's actual logo. This is GitHub's official Octicon "mark-github" path
// (github.com/primer/octicons, MIT licensed) instead.
function GithubMarkIcon({ size }: { size: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

// role="contentinfo" is set explicitly because <footer> only gets that
// landmark role implicitly when it isn't nested inside main/article/aside/
// section/nav — and the whole app lives inside a single root <main>.
export function AppFooter() {
  return (
    <footer className="app-footer" role="contentinfo">
      <div className="app-footer-inner">
        <p className="app-footer-license">
          Gallery Designer is open source under the{' '}
          <a
            href="https://github.com/eslutz/Gallery-Designer/blob/main/LICENSE"
            target="_blank"
            rel="noopener noreferrer"
          >
            MIT License
          </a>
          .
        </p>
        <nav className="app-footer-links" aria-label="Project links">
          <a
            href="https://github.com/eslutz/Gallery-Designer"
            target="_blank"
            rel="noopener noreferrer"
          >
            <GithubMarkIcon size={14} />
            GitHub
          </a>
          <a
            href="https://github.com/eslutz/Gallery-Designer/issues"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Bug size={14} aria-hidden="true" focusable="false" />
            Issues
          </a>
          <a href="https://ericslutz.dev" target="_blank" rel="noopener noreferrer">
            <Globe size={14} aria-hidden="true" focusable="false" />
            ericslutz.dev
          </a>
          <a href="https://github.com/sponsors/eslutz" target="_blank" rel="noopener noreferrer">
            <Heart size={14} aria-hidden="true" focusable="false" />
            GitHub Sponsors
          </a>
          <a href="https://coindrop.to/ericslutz_dev" target="_blank" rel="noopener noreferrer">
            <Coffee size={14} aria-hidden="true" focusable="false" />
            Coindrop
          </a>
        </nav>
      </div>
    </footer>
  );
}
