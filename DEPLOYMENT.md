# AQUADRIVE deployment

## Prepared Render service

The root `render.yaml` specifies:

- One Docker web service, name `aquadrive-api`.
- Plan ID `0.5c-512mb` (paid compute), one instance.
- A 1 GB persistent disk mounted at `/var/data`.
- SQLite database `/var/data/aquadrive.sqlite`.
- `/health` endpoint.
- HTTPS public origin supplied as `PUBLIC_URL` and `ALLOWED_ORIGINS`.
- Currency `USD`.

No paid service has been created. Confirm the actual compute, storage and workspace charges in the Render dashboard before provisioning. Persistent disks require a paid service. Disk storage is listed at $0.25/GB/month as checked on 1 October 2026, but compute/workspace/bandwidth/build charges are separate and the total has not been confirmed.

A single-instance SQLite deployment fits an initial pilot. It cannot be horizontally scaled or offer zero-downtime deploys with the attached disk. A broader rollout should migrate to managed PostgreSQL, object storage, a durable job queue and a backup/monitoring policy.

## Deployment steps

1. Place the source package in a Git repository that Render can access. Keep both `aquadrive/` and `server/` at the repository root.
2. Create a Render Blueprint from `render.yaml`, or manually configure the equivalent Docker service. The Docker build exports the web app and installs the API dependencies.
3. Set `PUBLIC_URL` to the final service HTTPS URL, e.g. `https://YOUR_SERVICE.onrender.com`.
4. Set `ALLOWED_ORIGINS` to that exact HTTPS origin. If another web client host is used, add it as a comma-separated origin. Native app requests do not carry a browser Origin header.
5. Attach the persistent disk. An ephemeral or free service will lose SQLite data on restart.
6. Set `TRUST_PROXY_HOPS` to the verified trusted proxy count for the deployment. The supplied Render configuration assumes one proxy. Recheck rate limiting if network topology changes.
7. Deploy and verify `/health`.
8. Create the first administrator in the Render service shell using `npm run admin:create`, with credentials configured securely in the server environment. Remove the bootstrap password afterwards.
9. Register and verify actual suppliers, then test a cash delivery with two physical Android devices before exposing the pilot to customers.

Render is installed in the conversation, but no Render service-management tools were exposed in the available callable tool registry during this build. No remote service, disk, repository or deployment has been created.

## Android installation

In `aquadrive/`, set `EXPO_PUBLIC_API_URL` to the deployed HTTPS URL before building. This variable is public and may contain only the API address, never payment keys or administrator passwords.

```sh
npx eas-cli@latest login
npx eas-cli@latest build --platform android --profile preview
```

The supplied `eas.json` requests an internal APK. An Expo account, an accessible EAS project and signing credentials are required. No account session or signed APK is included. Install the resulting APK on Android and test permissions, foreground GPS, restart behavior and the cash workflow. Native device testing was not performed in this workspace.

## EcoCash through Paynow

Configure these only in the Render service environment:

- `PAYNOW_INTEGRATION_ID`
- `PAYNOW_INTEGRATION_KEY`
- `PAYNOW_CURRENCY` (must match `CURRENCY` and the merchant integration currency)

The integration must have EcoCash enabled. `PUBLIC_URL` supplies the payment callback and return URLs. New integrations start in Paynow test mode. Test with the merchant account email and documented sandbox numbers, then request live activation from Paynow. Verify success, delayed success, cancellation, timeout and signature/amount mismatch behavior. Do not claim live payment support until the merchant integration has been activated and a real transaction has been verified.

The app never requests an EcoCash PIN. Customers authorise the mobile-money request through the provider's mechanism.

Unknown payment attempts are held to prevent duplicate debit. Review them in the merchant dashboard and reconcile; the app has no automatic charge retry or refund initiation. Administrator order details can request reconciliation. Paid/awaiting-delivery/delivered gateway states represent payment success. Disputed/refunded responses update the payment record when checked. Settlement, supplier payouts, platform commission and accounting reconciliation remain operational responsibilities.

## Backups and recovery

From the service shell, use a different destination file:

```sh
npm run backup -- /var/data/aquadrive-backup.sqlite
```

This uses SQLite's online backup API. Copy backups to separate storage and test restoration. A backup kept only on the same disk is not disaster recovery. Restrict access: the database contains user information, hashed passwords, session hashes, orders and supplier evidence.

For restoration, stop the API, restore a verified backup to `DB_PATH`, remove obsolete WAL/SHM files for that restored database while stopped, then restart and verify account/order state. Do not restore a live SQLite database using ordinary file replacement.

## Remaining launch requirements

- Confirm the paid hosting budget, deploy the server and configure the Android API URL.
- Build and test a signed Android APK on physical devices.
- Obtain and validate live merchant credentials.
- Establish supplier verification, water-quality review, service areas, vehicle access and delivery support procedures.
- Define container deposits/returns for bottled water and contract terms for tanker orders. Current quotes cover water plus delivery only.
- Set privacy/retention terms, customer support, account recovery and an administrator contact. Automated email/phone ownership verification and forgotten-password email are not implemented.
- Add monitoring, off-disk backups and document malware scanning. Files are limited and checked for format signatures, not scanned for malware.
- Add background location, push notifications and more advanced fleet scheduling if required. They are outside this tested pilot implementation.

References: https://render.com/docs/disks ; https://render.com/docs/blueprint-spec ; https://render.com/pricing ; https://docs.expo.dev/build-reference/apk/ ; https://developers.paynow.co.zw/docs/paynow/nodejs_quickstart/ ; https://developers.paynow.co.zw/docs/paynow/status_update/ ; https://developers.paynow.co.zw/docs/paynow/test_mode/
