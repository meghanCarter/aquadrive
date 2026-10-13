# AQUADRIVE Firebase migration

## Verified project

- Project ID: `aquadrive-85381`
- Owner account selected by user: `mickeljohnson5478@gmail.com`
- Firebase plan: Spark; console shows no-cost ($0/month).
- Firestore: Standard, `(default)`, `africa-south1` (Johannesburg).
- Initial rules: deny all client reads and writes.
- No app data has been migrated. The existing API still uses SQLite.
- No Firebase Hosting release has been deployed.
- Cloud Shell inside the review browser displays `Site Unavailable`; authenticated CLI deployment is not currently available in this environment.

## Prepared Hosting build

`firebase.json` configures the SPA fallback, same-origin static map assets, map CSP, MIME type and security headers. `scripts/build-firebase.mjs` requires an explicit HTTPS API origin and copies the exact map implementation and installed Leaflet assets into the web export.

The browser map now loads from the frontend origin rather than the API origin. Coordinates are passed via same-origin iframe messages; the API remains authenticated separately. Native maps continue to load from the configured API.

The build displays a pre-release warning unless `RELEASE_READY=yes` is supplied. Do not use that setting until all production gates have evidence.

### Review deployment (not a production launch)

Prerequisites: Node.js 24, npm, git, Firebase CLI; signed in to the selected owner account. CLI sign-in must happen through Google's secure login flow. Do not paste access tokens, private keys or passwords into chat or commit them.

In a Bash terminal, including Cloud Shell where accessible:

```sh
git clone --branch interface-reference-rebuild https://github.com/meghanCarter/aquadrive.git
cd aquadrive
npm ci --prefix aquadrive
npm ci --prefix server
EXPO_PUBLIC_API_URL=https://aquadrive-demo.onrender.com node scripts/build-firebase.mjs
npx firebase-tools login
npx firebase-tools hosting:channel:deploy interface-review --project aquadrive-85381 --expires 7d
```

This deliberately creates an expiring interface-review channel. It still connects to the temporary Render database. The actual channel origin returned by the CLI must be added to Render `ALLOWED_ORIGINS` before authenticated API calls will work. A preview deploy alone is not a working production service.

The permanent Hosting site must be deployed only after the durable API migration, workflow checks, origin configuration and operator readiness are validated. Deploy Hosting separately from Firestore rules/indexes; the empty index file is a starting point, not an approved replacement for future migration indexes.

## Required data migration

The current API contains SQL queries and synchronous transactions. Firestore is not a drop-in file or connection-string replacement.

1. Introduce asynchronous repositories for users, sessions, supplier profiles, orders, events, document tickets and payment attempts.
2. Preserve authorization at every API boundary. Initially keep Firestore client access denied and use a least-privilege server identity. Never expose that identity in the web bundle.
3. Enforce unique emails, per-customer idempotency and one active vehicle using transactional sentinel documents. Preserve order-version checks.
4. Read required documents before transaction writes. Firestore may rerun transaction callbacks; payment gateway calls, messages and other irreversible side effects must occur outside callbacks.
5. Reserve/release stock atomically with order transitions, maintain audit events, and test competing requests and retry behavior.
6. Decide supplier-evidence storage. Cloud Storage requires Blaze; the user has approved only a $0 budget. The current 5 MB file limit exceeds Firestore's 1 MiB document limit. Do not silently place whole uploaded files in Firestore, publish evidence on Hosting, or keep evidence only on Render's ephemeral filesystem.
7. Implement a dry-run import with schema/version validation and ownership checks. Preserve hashed-password/session handling securely; migration of credentials must not expose values in logs.
8. Run the existing lifecycle/security tests against the new provider, add contention/retry tests, and verify persistence across API restarts before cutover.
9. Establish a recoverable backup approach. Firebase scheduled backups shown in this project's console require Blaze; none were enabled.
10. Verify Spark quotas against real usage. Eight-second full-order polling can consume read quotas quickly; use bounded queries/subscriptions and measure usage before rollout.

## Outstanding access and decisions

- Authenticated Firebase CLI deployment is not available from the current execution workspace. A console login does not authenticate this separate CLI.
- A private, durable supplier-document storage approach compatible with the budget remains unresolved.
- Physical Android installation, permission dialogs, locked-screen GPS, network loss, receipt/payment flow and off-host restore remain unverified.

Official references: https://firebase.google.com/docs/hosting/quickstart ; https://firebase.google.com/docs/hosting/test-preview-deploy ; https://firebase.google.com/docs/firestore/quotas ; https://firebase.google.com/docs/firestore/manage-data/transactions ; https://firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024
