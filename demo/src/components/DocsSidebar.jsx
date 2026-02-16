import { useLocalStorage } from '../hooks/useLocalStorage';

const PLUGIN_NAV = [
  { slug: 'analytics', title: 'Analytics', href: '/plugins/analytics' },
  { slug: 'auto-promote', title: 'Auto-Promote', href: '/plugins/auto-promote' },
];

export function DocsSidebar({ sections, activeSlug, activePlugin }) {
  const [theme, setTheme] = useLocalStorage('rw-theme', null);

  const isDark = theme === 'dark' || (!theme && typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches);

  function toggleTheme() {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    document.body.classList.toggle('theme-dark', next === 'dark');
  }

  return (
    <aside class="docs-nav">
      <div class="docs-brand">Rich Wind</div>
      <nav>
        {sections?.map((section) =>
          section.pages.length > 0 && (
            <div key={section.kind} class={`docs-nav-section docs-nav-section--${section.kind}`}>
              <div class="docs-nav-section-title">{section.title}</div>
              {section.pages.map((page) => (
                <a
                  key={page.slug}
                  href={page.slug ? `/docs/${page.slug}` : '/docs'}
                  class={`docs-link${!activePlugin && page.slug === activeSlug ? ' is-active' : ''}`}
                >
                  {page.title}
                </a>
              ))}
            </div>
          )
        )}
        <div class="docs-nav-section docs-nav-section--plugins">
          <div class="docs-nav-section-title">Plugins Showcase</div>
          {PLUGIN_NAV.map((p) => (
            <a
              key={p.slug}
              href={p.href}
              class={`docs-link${activePlugin === p.slug ? ' is-active' : ''}`}
            >
              {p.title}
            </a>
          ))}
        </div>
      </nav>
      <div class="docs-controls">
        <label class="docs-toggle">
          <input
            type="checkbox"
            checked={isDark}
            onChange={toggleTheme}
            aria-label="Toggle dark mode"
          />
          <span>Dark mode</span>
        </label>
      </div>
      <div class="docs-nav-footer">
        <a href="/" class="docs-meta-link">Demo</a>
        <a href="https://github.com/FarooqAlaulddin/rich-wind" class="docs-meta-link" target="_blank" rel="noreferrer">GitHub</a>
      </div>
    </aside>
  );
}
