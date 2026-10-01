# AQUADRIVE v2 validation

Checked on 1 October 2026.

## Passed

- TypeScript strict type checking and Expo ESLint checks.
- Expo SDK dependency compatibility check using its installed compatibility map (offline; external React Native Directory validation was unavailable).
- Android Hermes bundle and web production exports.
- Lockfile installation dry runs for mobile and server packages.
- Server dependency audit: no reported vulnerabilities at the time checked. This does not prove the application is secure.
- Eight automated API/gateway test groups: registration and login, role restrictions, session revocation, private order access, server prices, idempotent ordering, quantity/city matching, stock reservation/restoration, delivery transitions, version conflicts, single active vehicle, GPS uploads, cash permissions, evidence privacy/format checks, approval reset, persistent users/orders after database reopening, gateway amount/reference checks, signed gateway parsing, payment status interpretation and bottled-water prices/stock.
- Three isolated browser sessions at 390 × 844: supplier signup and evidence upload, administrator sign-in and supplier approval, customer signup and order, supplier acceptance/departure/arrival, customer receipt, supplier cash collection, customer rating and authenticated delivery reload.
- No uncaught browser exceptions or document horizontal overflow during that workflow.
- Phone-width delivery screen visually inspected.

## Not verified

- Render remote deployment, disk attachment, actual service charges or remote backup restoration.
- Docker image build: Docker tooling is not installed in this execution environment. The underlying dependency installation, API startup and web export were checked separately.
- EAS authentication, signed APK compilation, installation, physical-device behavior or Android permission dialogs.
- Actual GPS readings from a phone. Location upload, access controls and server storage were tested with supplied coordinates; the client integrates Expo foreground location APIs.
- Live or Paynow-sandbox transactions. Merchant credentials were not supplied; gateway reconciliation tests used controlled responses, including signed fixture responses generated with a test-only key.
- Background GPS, embedded maps/navigation, push notifications, account ownership verification, email account recovery, refunds initiated from AQUADRIVE, payout settlement, advanced fleet scheduling or operational water-quality certification.

No claim of a completed production launch is made. The README and deployment guide distinguish implemented behavior from integration and operational requirements.
