# Tipsy Tourist Mobile

The native iOS and Android companion to Tipsy Tourist, built with React Native and Expo.

The project targets Expo SDK 54 so it runs in the current App Store and Play Store versions of Expo Go.

## Features

- Plan a route between an address, postcode, or coordinate pair
- Choose pub and attraction counts and walking, cycling, or driving
- Plot the optimised route and numbered stops on a native map
- Use the device location as the route start
- View venue details and open phone numbers or websites
- View and reorder the itinerary
- Switch between polished light and dark themes

## Setup

1. Copy the development entries from `env.template` into `.env.development.local`.
2. Add the platform-restricted development keys and the temporary mobile-services key described below.
3. Install dependencies with `npm install`.
4. Start Expo with `npm start`, then open the app on a simulator or device.

The app defaults to the deployed Tipsy Tourist Lambda API. Override `EXPO_PUBLIC_API_URL` locally when using another stage.

## Google Maps keys

Native map rendering uses keys whose environment-variable names match Google Cloud:

- `TIPSY_TOURIST_MOBILE_ANDROID_DEVELOPMENT`
- `TIPSY_TOURIST_MOBILE_ANDROID_PRODUCTION`
- `TIPSY_TOURIST_MOBILE_IOS_DEVELOPMENT`
- `TIPSY_TOURIST_MOBILE_IOS_PRODUCTION`

The iOS app currently displays Apple Maps, so the iOS Google keys are prepared but not required yet. Direct client calls currently use `EXPO_PUBLIC_TIPSY_TOURIST_MOBILE_SERVICES_DEVELOPMENT` or `EXPO_PUBLIC_TIPSY_TOURIST_MOBILE_SERVICES_PRODUCTION`. These values are public and must be replaced by Lambda-proxied calls before store release.

EAS selects development or production through `EXPO_PUBLIC_TIPSY_TOURIST_ENVIRONMENT`, which is configured per profile in `eas.json`.

## Checks

```sh
npm run typecheck
npm run doctor
```

Directions, autocomplete and place-photo calls currently run from the client. Before a public launch, proxy them through Lambda so the services key can be removed from the app binary.
