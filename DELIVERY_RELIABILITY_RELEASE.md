# AQUADRIVE delivery confirmation and notification release

15 October 2026. Scope: recipient delivery confirmation and order notification reliability. No paid infrastructure, payment activation, scheduled backup service or unrelated new feature is included.

## Recipient proof
After arrival, the delivery recipient can request a six-digit random PIN. For a gift, this is the accepted recipient, not its payer. The PIN is returned only to that recipient, once per request, with no-store caching. A replacement invalidates its predecessor. Only a hash tied to the order is stored. No PIN appears in order JSON, events, admin browsing, exports or push payloads.

The PIN lasts 30 minutes. Replacement is limited to once a minute. Five incorrect attempts lock confirmation and replacement for ten minutes. Failed attempts commit even though the HTTP response rejects the request. Only the currently assigned driver, or supplier when no driver is assigned, can submit it. Status and order version are checked. Successful completion deletes the PIN and records confirmation method, actor and time. A PIN cannot complete the same delivery twice.

The recipient's existing authenticated direct confirmation remains available, including in older APKs. It records method "Recipient account". Therefore a PIN is an additional operator confirmation mechanism, not a mandatory second factor for all delivery completions. Neither method independently proves water quantity or quality. Recipients must check the delivery before confirming or sharing the PIN.

## Saved notification inbox
Requested, accepted, dispatched, arrived, completed, cancelled, declined, driver assignment and company appointment confirmation create notification rows for participating customer/company/assigned driver/accepted gift recipient, excluding the actor. GPS uploads and financial/rating operations do not spam the inbox. Records are inserted inside the same transaction as delivery events. There is no backfill of historical events.

Account shows the unread count; Notifications shows latest-first pages of 50 and links to deliveries. Only the owning account can read or mark its notifications. Opening an old assignment may be refused if that driver no longer has access. Current foreground polling refreshes counts every 20 seconds and on returning to the app. The inbox itself refreshes on opening/manual refresh; it is not an offline local copy. A failed connection must not mark records read. Own-account export includes up to 500 notifications.

## Background phone push: implemented, awaiting activation
The APK includes the SDK 57 notification module and opt-in registration controls. Existing app.json owner, package and EAS project ID are preserved. Android notification channel and OS permission are requested only on explicit opt-in. The backend registers at most five devices per account, tied to active sessions. Sign-out removes the session's device registrations; disabled users, expired sessions and revoked devices do not dispatch new pending jobs. Another account cannot take over an active registration.

PUSH_NOTIFICATIONS_ENABLED defaults false and must remain false until Android FCM v1 credentials (and APNs if iOS is offered) are configured on the existing Expo project. The installed native build needs the matching Firebase Android configuration and original package/signing identity. Do not commit service-account credentials or EXPO_ACCESS_TOKEN. The latter is optional for Expo push access-token protection and is server-only.

When enabled, event creation also persists device jobs. The backend checks a small batch every 30 seconds while its process is awake. Requests have a timeout, retries use backoff, leases recover interrupted work, and missing/unregistered devices are suppressed. Receipt checks begin after 15 minutes; provider rejection is recorded and DeviceNotRegistered disables the device. ProviderAccepted means FCM/APNs accepted it, not that a phone displayed it. A request that succeeded remotely but lost its response can cause a duplicate push; this is at-least-once transport. The durable inbox row is unique per participant/event. Jobs expire after 24 hours, and already-read notifications skip new sends.

Push payloads are generic and contain only internal delivery/notification IDs, never names, addresses, message text or PINs. Taps open the authenticated notification inbox, not arbitrary remote URLs. No third-party push request is made while the flag is false.

Free Render hosting may sleep, delaying dispatch until the service wakes. This release cannot promise immediate background alerts on the free plan. Do not add a paid worker without a budget decision. Native push and notification taps require a rebuilt APK and physical-device tests; Expo Go does not prove release push behaviour.

## Operator and data handling
Admin Database exposes sanitized notifications and push job state, attempts and errors. Device tokens, PIN hashes and provider ticket IDs are excluded from admin datasets and account exports. Full private backups and migrations include the new tables in dependency order. Backups remain sensitive and need secure handling. This release does not establish a scheduled backup/restore programme.

## Required verification before push activation
1. Reuse the existing EAS project and signing key; configure matching Android Firebase client file and FCM v1 server credentials in EAS.
2. Rebuild APK, sign in, opt in, then verify acceptance, assignment, dispatch and arrival with the app open and closed.
3. Confirm tap navigation, OS permission denial, opt-out, sign-out, revoked-token handling and recovery after a network outage.
4. Verify no PIN/address appears on the lock screen or provider payload.
5. Enable PUSH_NOTIFICATIONS_ENABLED only for the controlled test; assess latency on free hosting before any reliability claim.

Tests cover PIN recipient/operator boundaries, expiry, lockout persistence, one-time consumption, inbox ownership/read state, GPS suppression, funding-independent push activation gate, queued retries/receipts, device revocation and logout. Physical device behaviour and native credential validity cannot be established by these backend checks.

## Android client configuration received
The Firebase client file for aquadrive-85381 / com.aquadrive.mobile is included as aquadrive/google-services.json and referenced by app.config.js. This is client configuration, not an FCM service-account private key. FCM v1 server credentials in EAS, APK rebuild and physical-device verification are still required before enabling background push.
