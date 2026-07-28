const production = process.env.EAS_BUILD_PROFILE === "production";
const androidMapsKey = production
  ? process.env.TIPSY_TOURIST_MOBILE_ANDROID_PRODUCTION
  : process.env.TIPSY_TOURIST_MOBILE_ANDROID_DEVELOPMENT;
const iosMapsKey = production
  ? process.env.TIPSY_TOURIST_MOBILE_IOS_PRODUCTION
  : process.env.TIPSY_TOURIST_MOBILE_IOS_DEVELOPMENT;

export default {
  expo: {
    name: "Tipsy Tourist",
    owner: "iainhoolahan",
    slug: "tipsy-tourist-mobile",
    scheme: "tipsytourist",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/app-icon-map.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#fffaf1",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.tipsytourist.mobile",
      config: { googleMapsApiKey: iosMapsKey },
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
        NSLocationWhenInUseUsageDescription:
          "Tipsy Tourist uses your location to start and centre pub crawl routes.",
      },
    },
    android: {
      package: "com.tipsytourist.mobile",
      config: {
        googleMaps: { apiKey: androidMapsKey },
      },
      adaptiveIcon: {
        backgroundColor: "#fffaf1",
        backgroundImage: "./assets/android-icon-map-background.png",
        foregroundImage: "./assets/android-icon-foreground.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      permissions: ["ACCESS_COARSE_LOCATION", "ACCESS_FINE_LOCATION"],
    },
    plugins: [
      "expo-font",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "Tipsy Tourist uses your location to start and centre pub crawl routes.",
        },
      ],
    ],
    web: { favicon: "./assets/favicon.png" },
    extra: {
      eas: {
        projectId: "fc3533c0-4be0-4c12-8d40-2ea6659eaaf6",
      },
    },
  },
};
