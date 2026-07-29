import { Bug, Coffee, Github, Globe, Heart } from 'lucide-react';

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
            <Github size={14} aria-hidden="true" focusable="false" />
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
