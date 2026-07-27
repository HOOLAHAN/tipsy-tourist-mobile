export default {
  expo: {
    name: 'Tipsy Tourist', slug: 'tipsy-tourist-mobile', scheme: 'tipsytourist', version: '1.0.0', orientation: 'portrait',
    icon: './assets/icon.png', userInterfaceStyle: 'automatic',
    splash: { image: './assets/splash-icon.png', resizeMode: 'contain', backgroundColor: '#fffaf1' },
    ios: { supportsTablet: true, bundleIdentifier: 'com.tipsytourist.mobile', infoPlist: { NSLocationWhenInUseUsageDescription: 'Tipsy Tourist uses your location to start and centre pub crawl routes.' } },
    android: { package: 'com.tipsytourist.mobile', config: { googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY } }, adaptiveIcon: { backgroundColor: '#fffaf1', foregroundImage: './assets/android-icon-foreground.png', monochromeImage: './assets/android-icon-monochrome.png' }, permissions: ['ACCESS_COARSE_LOCATION', 'ACCESS_FINE_LOCATION'] },
    plugins: [
      'expo-font',
      ['expo-location', { locationWhenInUsePermission: 'Tipsy Tourist uses your location to start and centre pub crawl routes.' }],
    ],
    web: { favicon: './assets/favicon.png' },
  },
};
