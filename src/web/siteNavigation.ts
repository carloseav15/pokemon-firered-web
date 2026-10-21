import './siteNavigation.css';

const links = [
  ['home', '/', 'Home'],
  ['play', '/play.html', 'Play'],
  ['world', '/world.html', 'World Map'],
  ['dex', '/dex.html', 'Pokédex'],
  ['tools', '/tools.html', 'Tools'],
] as const;

for (const nav of document.querySelectorAll<HTMLElement>('[data-site-navigation]')) {
  nav.setAttribute('aria-label', 'Main navigation');
  nav.lang = 'en';
  nav.classList.add('site-navigation');
  for (const [page, href, label] of links) {
    const link = document.createElement('a');
    link.href = href;
    link.textContent = label;
    if (nav.dataset.siteNavigation === page) link.setAttribute('aria-current', 'page');
    nav.append(link);
  }
}
