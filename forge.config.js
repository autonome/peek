// @ts-check

/**
 * @type {import('@electron-forge/shared-types').ForgeConfig}
 */
export default {
  packagerConfig: {
    asar: true,
    icon: './assets/appicon',
    appBundleId: 'com.peek.app',
    appCategoryType: 'public.app-category.productivity',
    // Register as handler for http/https URLs
    protocols: [
      { name: 'HTTP', schemes: ['http'] },
      { name: 'HTTPS', schemes: ['https'] }
    ],
    // Uncomment this section when ready to sign the app for distribution
    /*
    osxSign: {
      identity: 'Developer ID Application: Your Name (TEAMID)',
      hardenedRuntime: true,
      'gatekeeper-assess': false,
      entitlements: 'entitlements.plist',
      'entitlements-inherit': 'entitlements.plist',
      'signature-flags': 'library'
    },
    */
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'Peek',
        authors: 'Dietrich Ayala',
        description: 'Web user agent for working with the web in a more agent-ish fashion than a browser',
        iconUrl: 'https://raw.githubusercontent.com/autonome/peek/main/assets/appicon.ico',
        setupIcon: './assets/appicon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'linux'],
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          maintainer: 'Dietrich Ayala',
          homepage: 'https://github.com/autonome/peek',
          icon: './assets/appicon.png',
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          maintainer: 'Dietrich Ayala',
          homepage: 'https://github.com/autonome/peek',
          icon: './assets/appicon.png',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
  ],
};
