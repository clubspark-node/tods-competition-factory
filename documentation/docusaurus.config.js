/** @type {import('@docusaurus/types').DocusaurusConfig} */
module.exports = {
  title: 'Competition Factory',
  tagline: 'Open-source engine for tournament management — draws, scheduling, scoring, and more.',
  url: 'https://courthive.github.io',
  baseUrl: '/competition-factory/',
  // Explicit to satisfy the GitHub Pages deploy warning. `true` matches the
  // existing folder-style output (docs/foo/index.html → /docs/foo/), so live
  // URLs are unchanged and GitHub Pages no longer needs a direct-access
  // redirect to add the slash. (Was previously unset — never removed.)
  trailingSlash: true,
  onBrokenLinks: 'warn',
  favicon: 'img/favicon.ico',
  organizationName: 'CourtHive',
  projectName: 'competition-factory',
  markdown: {
    mermaid: true,
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  themeConfig: {
    colorMode: {
      defaultMode: 'dark',
      respectPrefersColorScheme: true,
    },
    navbar: {
      title: 'Competition Factory',
      logo: {
        alt: 'CourtHive Logo',
        src: 'img/CourtHive.svg',
        srcDark: 'img/CourtHive-dark.svg',
      },
      items: [
        {
          to: 'docs/',
          activeBasePath: 'docs',
          label: 'Docs',
          position: 'left',
        },
        {
          href: 'https://github.com/CourtHive/competition-factory',
          label: 'GitHub',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'dark',
      links: [],
      copyright: `Copyright © ${new Date().getFullYear()} CourtHive`,
    },
  },
  presets: [
    [
      '@docusaurus/preset-classic',
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
      },
    ],
  ],
  plugins: [
    [
      require.resolve('@cmfcmf/docusaurus-search-local'),
      {
        maxSearchResults: 8,
        indexBlog: false,
        style: undefined,
      },
    ],
  ],
};
