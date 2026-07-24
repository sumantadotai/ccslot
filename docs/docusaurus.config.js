// @ts-check
import { themes as prismThemes } from 'prism-react-renderer'

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'ccslot',
  tagline: 'Multiple Claude Code accounts on one machine',
  favicon: 'img/logo.svg',

  future: { v4: true },

  url: 'https://ccslot.sumanta.ai',
  // Custom domain, so the site is served from the root. static/CNAME keeps the
  // domain across deploys — Pages drops it otherwise.
  baseUrl: '/',
  organizationName: 'sumantadotai',
  projectName: 'ccslot',
  trailingSlash: false,

  onBrokenLinks: 'throw',
  // The whole site is one JSX page; Docusaurus can only see anchors in MDX, so it
  // reports #commands / #mcp as broken when they are plain section ids.
  onBrokenAnchors: 'ignore',
  markdown: { hooks: { onBrokenMarkdownLinks: 'warn' } },

  i18n: { defaultLocale: 'en', locales: ['en'] },

  stylesheets: [
    'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=JetBrains+Mono:wght@400;500;700&display=swap',
  ],

  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      ({
        // Single page: no docs plugin, no blog. Everything lives in src/pages/index.js.
        docs: false,
        blog: false,
        theme: { customCss: './src/css/custom.css' },
      }),
    ],
  ],

  themeConfig:
    /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
    ({
      image: 'img/banner.svg',
      colorMode: { defaultMode: 'dark', respectPrefersColorScheme: true },
      navbar: {
        title: 'ccslot',
        logo: { alt: 'ccslot', src: 'img/logo.svg' },
        items: [
          { to: '/#commands', label: 'Commands', position: 'right' },
          { to: '/#mcp', label: 'MCP identities', position: 'right' },
          { href: 'https://www.npmjs.com/package/ccslot', label: 'npm', position: 'right' },
          { href: 'https://github.com/sumantadotai/ccslot', label: 'GitHub', position: 'right' },
        ],
      },
      footer: {
        style: 'dark',
        links: [],
        copyright:
          'MIT © Sumanta Kabiraj · <a href="https://github.com/sumantadotai/ccslot">source</a> · <a href="https://www.npmjs.com/package/ccslot">npm</a>',
      },
      prism: {
        theme: prismThemes.github,
        darkTheme: prismThemes.vsDark,
        additionalLanguages: ['bash', 'json'],
      },
    }),
}

export default config
