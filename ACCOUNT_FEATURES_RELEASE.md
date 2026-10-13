# AQUADRIVE account and settings release

13 October 2026. References: the two supplied Uber Account/Settings screenshots. Adopt their account organization and relevant behavior using AQUADRIVE branding and water-delivery rules.

## Explicit decisions
- Include financial features in scope.
- Automatic gateway-funded wallet credit, not administrator-issued credit.
- Gift delivery, not gift vouchers.
- Free membership with no recurring charge or promised discount.
- Existing $0 hosting budget remains. No paid Render resource or new payment transaction is created by this release.

## Reference-to-product mapping
| Reference | AQUADRIVE implementation |
|---|---|
| Account header and Help / Wallet / Activity | Account screen with role-appropriate tiles and account name |
| Add home, work and shortcuts | Customer-owned durable saved addresses, GPS suggestions, editing and reversible removal; selectable when ordering |
| Privacy | Address GPS shortcut preference, phone-permission controls, stop background sharing, bounded own-account snapshot, operator-reviewed privacy requests |
| Appearance | Device/light/dark modes; styles and status bar follow account preference |
| Accessibility | Larger text, device font scaling, screen-reader labels and reduced stack transitions |
| Communication | Call or delivery-message preference, passed to the order and used by delivery participants |
| Reserve | Advance delivery requests 1 hour to 30 days ahead; the company confirms the requested time before departure |
| Pick-up preferences | Default delivery instructions and saved-address notes |
| Taxis / service preference | Preferred bulk tanker or 20 L bottled-water service; no taxi offering |
| Driver-nearby alert | In-app banner while delivery details are open, within approximately 500 m using fresh GPS with known accuracy no worse than 200 m; no push/SMS/email |
| Messages | Order-linked participant conversation, private authorization, cursor pagination and deduplicated send retries |
| Send a gift | Prepaid wallet order, private claim code, recipient acceptance before departure and recipient-only receipt confirmation |
| Membership | Persisted free membership state, reversible join/leave; no invented benefits |
| Legal | Product/data behavior information; approved operator terms/privacy policy remain outstanding |

## Wallet and gift controls
- Wallet funding requires a configured Paynow merchant plus WALLET_FUNDING_ENABLED=true. It is OFF by default and must remain OFF until live payment/refund/settlement verification and approved operating terms.
- Top-ups are requested through EcoCash; the UI does not collect card details. Amounts are whole cents, 1-1000 server-currency units per request. Merchant currency must match.
- Persist attempts before gateway I/O. An unresolved top-up prevents another new attempt. Request keys protect retries.
- Poll verified gateway responses; reference and amount must match. Wallet credit requires Paid/Delivered, not an awaiting-delivery state. Reconciliation credits or reverses once.
- Reversed credit can leave a negative balance if already spent; further wallet purchases are blocked. No customer-to-customer money transfer, cash-out or automatic cash refund exists.
- Wallet checkout requires the exact current quote and currency. Spending, inventory reservation and order creation are atomic; simultaneous requests cannot overspend.
- Eligible cancellation/decline returns wallet credit to the original payer once. It is not a gateway cash refund.
- Gift recipient details are reviewed before purchase; the sender privately shares a 48-character claim code. Codes expire after seven days and can be replaced only before an unclaimed gift starts.
- A recipient reviews/accepts the address and claims with their customer account. The sender cannot claim their own gift or confirm the recipient's receipt. Recipient account/phone ownership verification is not SMS-based.
- Supplier payouts/settlement and legally approved refund rules are not automated. Resolve them before activation with real money; a supplier-visible Paid order is not proof of supplier payout.

## Scheduling boundaries
Advance requests reserve stock on creation, just like ordinary requests. There is no automatic future-capacity calendar, recurring delivery, guaranteed future-driver match, push reminder or automatic expiry of unaccepted orders. Company confirmation records the appointment; drivers still must check its time and coordinate travel. Fleet conflict checks remain conservative: a driver/vehicle cannot have another active assigned order, including an advance request. Cancel/decline releases reserved stock and any eligible wallet credit.

## Operator-facing additions
Admin Database includes preferences, addresses, delivery messages, support, memberships, wallet ledger and sanitized top-up records. Support replies are audited. Session/password hashes, gift claim hashes and gateway poll URLs are not exposed by the financial browsing views. Full backup/migration tools include the new tables; reads are batched to reduce remote transaction latency.

## Mobile build compatibility
expo-system-ui is installed for SDK 57 device themes. app.config.js spreads the existing app.json configuration so the EAS project ID, owner, Android package and signing identity are preserved. Do not replace the user's existing Cloud Shell app.json/project link or create a new signing key. The currently assigned backend URL remains https://aquadrive-demo.onrender.com despite the service name aquadrive.

## Verification and remaining activation
Backend checks cover permissions, preference/address isolation, optimistic versions, message retries, support and membership, funding gates, quote confirmation, credit verification/reversals, concurrent spending, cancellation refunds, gift claims and appointment confirmation. Mobile lint/type checks and Android/web exports must pass before publication. Physical-device UI/GPS behavior and real merchant funding are not proven by local tests. No live money should be requested during verification while funding is disabled.

The earlier PDFs describe the 12 October release and need a revised edition for these new features.
