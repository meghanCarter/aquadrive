# AQUADRIVE production readiness — 2 October 2026

Target: a real water-delivery mobile service, using the supplied customer, supplier and administrator interface sheet. The public Render service remains a staging demo. It is not approved for real customer operations.

## Decisions

- User requests a production application rather than further demo work.
- Current hosting budget: $0/month, confirmed 2 October 2026.
- Continue code and interface work. Do not provision chargeable infrastructure or remove staging warnings to imply launch readiness.
- Preserve the actual product catalog (bulk tanker quantities and 20 L bottles) and supplier-set prices. The reference image's sample sizes, prices, names and totals do not establish business rules.
- Driver/customer coordinates must not be forwarded to the public OSRM routing service until the specific destination/disclosure is approved. Automatic approval review rejected enabling it. ETA configuration remains off.

## Interface implementation

The interface-reference-rebuild branch now implements the reference's droplet brand, blue/navy palette, introductory welcome/onboarding screens, centered login/registration, compact dark screen headers, mobile-width content, icon-based role navigation, four customer action tiles, tanker banner illustration, compact water quantity selection, supplier cards, supplier dashboard statistic cards, filtered administrator supplier lists and a separate review view, active-delivery and payment-record screens.

These are code-native vector illustrations. They are not the reference's photographic truck assets. Pixel-level equivalence and phone-width visual comparison have not been verified. Administrator customer management, centralized pricing, statistical reports and push notifications shown in the reference are not implemented. No inactive buttons pretend these features exist.

## Release gates

| Requirement | Current evidence | Owner / next action |
|---|---|---|
| Durable account/order/evidence storage | Current Render SQLite is in /tmp; restarts can erase it | Owner: provide hosting budget or approve an independently verified durable provider; developer: implement/test deployment and restore |
| Interface fidelity | Source layout rebuilt against supplied image; local lint/types/web/Android exports pass | Developer: compare rendered customer/supplier/admin screens at phone widths |
| Full delivery workflow | Backend permission, pricing, stock, delivery and payment checks pass | Developer + owner: repeat workflow on final deployment with two physical phones |
| Installed Android app | JavaScript/Hermes bundle exports; no signed APK or phone installation verified | Owner: connect an Expo/EAS account; developer: build APK and validate installation |
| GPS and background execution | Foreground and opt-in native background code exists; phone behavior unverified | Driver: permission tests, screen lock, background, loss of connection, stop/logout, battery restrictions |
| Road ETA | Code/cache/validation tests pass; provider configuration blocked | Owner: explicitly approve routing destination/disclosure, or select an acceptable provider |
| Cash operations | Receipt permissions and lifecycle tested locally | Owner: confirm real supplier cash reconciliation and support process |
| EcoCash | Configurable Paynow adapter; no live credentials/transaction verified | Owner: merchant onboarding; developer: provider test and reconciliation validation |
| Account recovery | Password changes exist; email/phone ownership verification and recovery absent | Developer + owner: select mail/SMS provider and recovery policy |
| Supplier and water-quality operations | Evidence upload/review code exists; approval is not water certification | Owner: real supplier verification, quality standards, service areas, support and complaints |
| Privacy/support | No final operator-approved privacy/retention/support terms | Owner: provide business/support identity and policy decisions |
| Backup/restore and monitoring | Backup CLI exists; off-host recovery unverified | Developer + owner: schedule backups, protect access, restore into a clean service and verify |

## Validation boundary

13 backend tests pass, including private-order access, GPS staleness/accuracy, route-response validation, caching and map script response headers. Lint/typecheck and Expo web/Android exports pass locally. These checks are not evidence of physical-phone GPS, signed APK delivery, durable hosting, native background execution, live payments or a production launch.

There is no confirmed launch date. Set it only after the storage, visual review and phone-test gates have evidence. Earlier VALIDATION.md and DEPLOYMENT.md describe the original October 1 pilot and are historical; this file records the current release constraints.
