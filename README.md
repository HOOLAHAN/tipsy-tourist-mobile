# Tipsy Tourist Mobile

The native iOS and Android companion to Tipsy Tourist, built with React Native and Expo.

## Features

- Plan a route between an address, postcode, or coordinate pair
- Choose pub and attraction counts and walking, cycling, or driving
- Plot the optimised route and numbered stops on a native map
- Use the device location as the route start
- View venue details and open phone numbers or websites
- View and reorder the itinerary
- Switch between classic, dark, and neon themes

## Setup

1. Copy `.env.example` to `.env`.
2. Add a Google Maps API key with Maps SDK for Android, Maps SDK for iOS, and Directions API access. Restrict production keys by app identifier and API.
3. Install dependencies with `npm install`.
4. Start Expo with `npm start`, then open the app on a simulator or device.

The app defaults to the deployed Tipsy Tourist Lambda API. Override `EXPO_PUBLIC_API_URL` in `.env` when using another stage.

## Checks

```sh
npm run typecheck
npm run doctor
```

The Google Directions API call currently runs from the client to match the deployed website. Before a public launch, proxy directions through Lambda so the key cannot be extracted from the app binary.
