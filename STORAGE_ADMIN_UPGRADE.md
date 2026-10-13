# Durable storage and restricted administration

Decision (12 October 2026): keep the $0 hosting budget. Use Render free compute with a separate Turso database within its free allowance. No paid Render disk or database was activated.

## What is implemented
- Async libSQL database connection: TURSO_DATABASE_URL and TURSO_AUTH_TOKEN stay on the server. Existing SQLite schema and records are supported.
- Request-local interactive transactions preserve inventory, assignment and payment invariants. Failed writes roll back; local concurrent requests are serialized safely.
- Public login shows Customer and Supplier only. Drivers log in with their own company credentials through Supplier. Administrators use the normal login; the server resolves their role. Public signup cannot create an administrator.
- Admin Database screen: all users, suppliers, drivers, vehicles, orders, payment attempts, document metadata, delivery events and admin audit history, with search and pagination.
- Controlled edits: user details and suspension/reactivation, unused vehicle details, supplier verification, and cancellation before departure with stock restoration. Changes require reasons and are logged. Passwords, session tokens, invitation codes and payment credentials are never shown.
- Sanitized paginated JSON exports are readable/copyable in the app. They exclude credentials and file bytes and are not backups.
- Server tools create full SQLite backups and migrate an existing SQLite database into an empty destination atomically. Full backups contain secrets and require secure handling.
- Optional one-time admin provisioning uses server-only ADMIN_EMAIL and ADMIN_PASSWORD. Existing non-admin identities are never silently promoted. Remove bootstrap credentials after success.

## Activation procedure
1. Create a Turso free account and an `aquadrive` database. Stay on the free plan; do not enable paid overages. Obtain its URL and database token.
2. Preserve existing Render data before any restart/deploy. Free Render has no persistent disk or ordinary shell access. Current live rows and any old backup availability have not been verified. Do not assume local development data is the live database. If the live file cannot be recovered, explicitly agree on a fresh database and acknowledge lost demo records before cutover.
3. In a trusted server environment run `npm run migrate -- /path/to/source.sqlite` against the empty destination if a source exists. Validate record counts, document bytes and foreign keys. Large migrations may need operational tooling; failures roll back rather than partially import.
4. Set TURSO_DATABASE_URL, TURSO_AUTH_TOKEN, REQUIRE_DURABLE_STORAGE=true in Render environment. Never prefix secrets with EXPO_PUBLIC_. Remove stale DB_PATH after cutover to avoid confusion. Set ADMIN_EMAIL and a new ADMIN_PASSWORD only for first provisioning; remove them afterwards. These settings trigger deployment/restart, so complete preservation first.
5. Deploy the reviewed backend, verify health and actual remote writes, restart and verify the same rows remain. Create, log in, suspend and reactivate test accounts. Verify public roles cannot read admin endpoints.
6. Rebuild the APK from interface-reference-rebuild with the existing Expo project and signing key. Admin tabs appear only after successful admin authentication.
7. Schedule protected off-host backups, test restoration and monitor database quotas. Free-tier hosting is not an unlimited storage guarantee or a completed backup policy.

## Operator commands
From `server`, with server credentials supplied securely:
- `npm run admin:create`
- `npm run migrate -- /secure/source.sqlite`
- `npm run backup -- /secure/new-backup.sqlite`

The database provider's private console is for operator SQL/schema management. The app provides controlled business record management, not unrestricted SQL execution or hard deletion of delivery/payment history.

Validation: 22 backend tests passed, including admin access denials for customers, suppliers and drivers; migration/backup checks; concurrent retries; and guarded admin provisioning. Mobile lint, typecheck and Android JavaScript export passed.

Status update, 13 October 2026: user explicitly chose an empty database; old demo records were not migrated. Turso-backed release 64c771fb072b18d8aca75125506875e472bef3fc is live on Render (deploy dep-db6tmtk9v7es739pmdqg). The server provisioned an administrator, and bootstrap ADMIN_EMAIL/ADMIN_PASSWORD were cleared afterwards. Health returned 200, unauthenticated admin access returned 401, customer admin access returned 403, and one Storage verification (test) account plus its session survived two full redeploys. The obsolete temporary-storage warning was removed. The designated admin email is mickeljohnson406@gmail.com; owner login still needs user confirmation.

Remaining: rebuilt Android APK, scheduled protected backups and cloud restore validation, phone/GPS testing and configured live payment/routing verification. One clearly named verification customer account remains; it is not a real customer.
