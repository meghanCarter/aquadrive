# AQUADRIVE mobile client v2

This client requires the API in `../server/`. Read `../README.md` and `../DEPLOYMENT.md` for account setup, local running, HTTPS configuration, Android APK generation and EcoCash configuration.

Use Node.js 24 LTS, then `npm ci`, `npm run typecheck`, `npm run lint` and `npm start`.

Set only the public API URL in `EXPO_PUBLIC_API_URL`. Merchant keys and administrator credentials belong exclusively on the server. No fake users or role-switching demo is included.
