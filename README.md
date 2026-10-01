# AQUADRIVE v2

A mobile client and persistent API for water delivery. Supports tanker water and 20 litre bottles, separate customer/supplier/admin accounts, server-calculated quotes, stock reservations, supplier approval, delivery transitions, foreground GPS sharing, cash receipts and a configurable EcoCash adapter through Paynow.

**Status:** implemented and locally tested. No public deployment, signed APK or live EcoCash transaction is included in this package. This is a pilot implementation, not a verified production launch.

## Contents

- `aquadrive/`: Expo SDK 57 mobile client using Expo Router.
- `server/`: Node.js 24 API with a persistent SQLite database.
- `server/public/`: generated web build, served by the API after export (not committed).
- `Dockerfile`: combined web/API deployment build.
- `render.yaml`: single-instance paid Render service and a 1 GB persistent disk.
- `DEPLOYMENT.md`: hosting, administrator and payment configuration.
- `VALIDATION.md`: completed checks and limitations.

## Local run

Use Node.js 24 LTS. In `server/`:

```sh
npm ci
cp .env.example .env
npm start
```

Windows PowerShell: replace the `cp` command with `Copy-Item .env.example .env`.

To generate the web client, run `npm ci` and `npx expo export --platform web --output-dir ../server/public` from `aquadrive/`, then restart the API. Open `http://localhost:4000`. To run the mobile client in Expo Go, in `aquadrive/`:

```sh
npm ci
```

Create `.env` with `EXPO_PUBLIC_API_URL=http://YOUR_COMPUTER_LAN_IP:4000`, then run `npm start`. Local HTTP is supported in development. Release builds require HTTPS (except localhost for browser validation). The phone and server must share a reachable network. The server cannot be reached from a phone using `localhost`.

## First accounts

1. Create a real customer account in the app.
2. Create a supplier account. Enter the business, service city, water source, vehicle, capacity, available stock, price per litre/bottle and delivery fee.
3. Upload PDF/JPEG/PNG verification evidence (maximum 5 MB). Submit the profile and set availability.
4. Create an administrator using the server CLI. Provide `ADMIN_EMAIL`, `ADMIN_PASSWORD` (12+ characters), optionally `ADMIN_NAME` and `ADMIN_PHONE`, in the server environment, then run `npm run admin:create`. Remove the password from the environment after creation. No default administrator or password is shipped.
5. Administrator signs in, downloads and reviews the evidence, writes a review note and approves the supplier.
6. Customer selects the city, address, quantity and supplier. The server reserves stock and calculates the final price.
7. Supplier accepts, starts delivery and marks arrival. Customer confirms receipt. Supplier records cash collection, or customer authorises EcoCash if configured.

Administrator signup is deliberately unavailable. Approval is an operational review, not an automatic water-quality certification. Approval expires after 90 days. Profile edits reset approval. Stock additions and availability changes use separate controls.

## Delivery and payment behavior

- Supplier matches require city, service, approval, availability, vehicle capacity and stock.
- Stock is reserved when an order is requested, and restored once on cancellation or decline.
- One supplier account represents one vehicle and one water service. It can have only one accepted/active delivery at a time.
- Supplier accepts and updates delivery. Only the customer can confirm receipt.
- Cancellation/decline is available before departure. Afterwards, support must handle disputes manually.
- Only the assigned supplier can record cash collection after the customer confirms receipt.
- EcoCash is disabled unless server-side merchant credentials exist. It is initiated after completed delivery, so there is no prepayment-refund path for cancelled deliveries in this version.
- Payment attempts are saved before contacting the gateway. Unknown or rejected attempts require operator investigation rather than an automatic second debit.
- Gateway confirmation verifies its signature, merchant reference and amount. Webhooks are confirmed by polling the stored gateway URL. Disputed/refunded states can be reconciled.
- GPS sharing requires supplier permission and stops when the delivery screen closes or the app is backgrounded. Customers can open the last reported supplier coordinates in Google Maps. This is not continuous background tracking or an embedded navigation engine.
- Active screens refresh from the API every 8 seconds. No push notifications are included.

## Tests

From `aquadrive/`: `npm run typecheck`, `npm run lint`.

From `server/`: `npm test`.

Source projects include lockfiles. The release exports are JavaScript/Hermes bundles, not installable Android packages.
