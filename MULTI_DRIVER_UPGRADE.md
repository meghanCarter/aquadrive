# Company fleet upgrade

Decision: companies manage separate driver accounts and vehicles. Supplier login is the company manager. Driver accounts are invited, rather than accepting a company ID submitted by a public caller.

## Workflow
1. Company completes its supplier profile and opens Drivers & vehicles.
2. Manager creates a single-use invitation (expires after 24 hours) and privately gives it to the driver.
3. Driver opens Join a company as a driver and creates their own credentials.
4. Manager adds vehicles and assigns a driver and vehicle before accepting a fleet order.
5. Assigned driver starts delivery, enables foreground or background phone GPS, marks arrival and records cash collection after customer receipt confirmation.
6. Customer sees assigned driver contact and vehicle details and can call the driver.

## Controls
Company membership, order ownership, optimistic order versions, driver/vehicle availability and delivery status are checked on the server. Drivers can read only assigned orders. Company managers cannot upload GPS for an order assigned to a driver. Reassignment is blocked after departure. Only the customer confirms receipt. Legacy single-supplier orders remain compatible.

Driver identities use membership records while preserving the existing SQLite user-role constraint. Public responses and authenticated authorization derive the driver role from that membership; driver accounts cannot use company profile or fleet-management APIs.

## Address autofill
Android/iOS use the phone location provider for reverse geocoding after foreground permission. GPS updates the pin; a successful lookup suggests city/address. Customers must check house numbers and landmarks. Lookup failure leaves manual entry available. Web only places the GPS pin and requests manual address entry. No new public geocoding service is configured.

## Validation and remaining work
API tests cover invitation reuse, company separation, assigned-order privacy, unauthorized GPS rejection, two-driver concurrency and vehicle conflicts. Lint, typecheck and Android JS export must pass before distribution. Phone GPS/background behavior, address accuracy and installation require real-device testing. Fleet removal, invitation revocation and vehicle editing are not yet exposed in the UI. Persistent production database storage and backup remain unresolved on the free deployment.

The APK must be rebuilt from interface-reference-rebuild using the existing Expo project and signing key. Backend deployment must include server/fleet.mjs and the database table additions before testing driver registration. Never publish invitation codes or signing credentials.
