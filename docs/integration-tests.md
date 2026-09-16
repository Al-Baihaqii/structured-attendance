# PostgreSQL integration tests

Opt-in only: `npm test` retains its existing command and runs no database integration tests.
Use Node, installed project dependencies, a generated Prisma client (`npm run db:generate`),
and a separate disposable local PostgreSQL instance matching the deployed PostgreSQL major version.
No extra JavaScript packages are required.

## Safety requirements

Provision an empty database AND a login named `structured_attendance_test` on a separate
local PostgreSQL instance. The login must own this database and have migration DDL privileges,
but must not be a superuser or have access to development/production databases.
Use an unpublished/private instance or bind its port to loopback only.
Do not point a tunnel/proxy on localhost at a remote database.
The guard validates naming and destination, but cannot prove physical isolation or role privileges.
Never reuse development/production credentials.

The runner requires `TEST_DATABASE_URL`. It accepts only localhost/127.0.0.1/::1,
the exact database and login above, a password, and no URL query parameters or fragments.
Percent-encode special characters in the password. No fallback to DATABASE_URL exists.
Both DATABASE_URL and DIRECT_URL are replaced in child processes before Prisma/application
imports. Existing .env files need no changes. Set the variable in your shell; it is not loaded
from .env by this runner. Do not commit credentials.

## Run locally (PowerShell)

Set `$env:TEST_DATABASE_URL` to your dedicated connection URL with this shape:
`postgresql://structured_attendance_test:<encoded-password>@127.0.0.1:55432/structured_attendance_test`

Then run:

```powershell
npm run test:integration
```

The runner first applies committed migrations with `prisma migrate deploy`, then runs
`node:test` through tsx with test files serialized. It never runs seed, db push, or reset.
Migration output is withheld on failure to avoid credential disclosure.
The smoke test verifies completed migrations, creates/reads a unique City, and removes only
that fixture in finally. A failed process can leave fixtures; dispose of the dedicated instance
and provision a fresh one rather than resetting an arbitrary URL. Do not run suites concurrently
against the same database. No automatic database/container provisioning or teardown is included.

## Helpers and future route tests

`withTestPrisma` validates the test environment, checks database/login identity, and disconnects
in finally. Import application modules only after the runner has configured the environment.
`installAuthenticationOverride` installs a test-only CommonJS require-cache override; install it
before requiring route handlers and restore it after requests finish. `asUser(user, callback)`
uses AsyncLocalStorage for request-local actors (null represents unauthenticated). It does not
test cookies or real authentication. Do not replace Prisma or SQL locking with mocks.
The current milestone includes no concurrency tests or production business logic changes.
