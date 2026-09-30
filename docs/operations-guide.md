# Operations and handover guide

Audience: the service owner and technical support team. This document describes
operator procedures, not automated monitoring or a contractual SLA. Assign named
owners and agreed response/recovery targets during handover.

## Handover record

Complete the following in the client's controlled handover register. Store secret
references, not secret values.

| Item | Evidence to record |
| --- | --- |
| Application | Production URL, hosting project, Git release revision, deployment date |
| Ownership | Client service owner, technical operator, escalation contact, access transfer completion |
| Services | Supabase and Upstash project identifiers, billing/renewal owner, domain/DNS owner |
| Access | SUPER_ADMIN custodian, secret-manager locations, least-privilege operator accounts |
| Validation | UAT approval, build/test results, final migration status, scoped-access smoke checks |
| Recovery | Backup owner, schedule/retention, latest successful restore, agreed recovery objectives |
| Exceptions | Accepted dependency advisories, deferred live concurrency coverage, platform-specific limitations |

Do not infer an SLA, backup schedule, completed restore, or operational support
contract from repository documentation. These require explicit client/operator agreement.

## Routine operation

| When | Operator checks |
| --- | --- |
| Each operational day, or agreed interval | Login availability, elevated error/429/503 counts, database/Redis service health and quotas, backup freshness |
| Each release | Tests/build, migration review/status, dependency audit, environment/ingress changes, scoped smoke checks |
| Periodically | Access review, account ownership, secret rotation needs, restoration rehearsal, provider capacity and billing |
| Before destructive maintenance | Target identity, approved procedure, backup verification, recovery plan and client communication |

Use hosting/provider dashboards and approved logging tools. Do not log request
bodies, passwords, cookies, tokens, full connection strings, or raw rate-limit
identifiers. Attendance reasons and downloaded CSVs contain personal information.
Collect only necessary diagnostic evidence and restrict access/retention.

The Activity Log screen is SUPER_ADMIN-only and is a domain audit trail, not a
complete infrastructure or security monitoring service. Its read queries omit
metadata. Attendance audit metadata does not retain reason text; no-op attendance
submissions do not create change logs. Do not promise full historical reason-text
reconstruction from logs.

## Account and assignment administration

- Use authorized application workflows; keep named accounts and review access when
  staff change roles. Never share a SUPER_ADMIN account for routine work.
- Revoke/reassign all active groups before deactivating or changing a Musyrif's
  city/role. Do not bypass the invariant through manual database updates.
- A former Musyrif loses group access. The replacement can read previous attendance,
  but can edit only the active tenure's meetings; admins retain scoped access.
- Members remain group-owned and deactivation preserves history. Deleted groups
  remain readable to authorized users but reject mutations.
- Password changes invalidate existing sessions through versioning. There is no
  self-service recovery screen; authorized technical account maintenance must use
  the existing protected workflow/API when a UI control is absent. Production seed
  is never a password-reset tool.

## Incident triage

Ask for the time, deployment, affected page/action, role, and sanitized error message.
Check the current release and recent configuration changes before modifying code.

| Symptom | Checks and minimal response |
| --- | --- |
| Login 401 | Credentials/account active state; keep generic responses and never ask for a password in a ticket |
| Login 429 | Shared username/IP limits; respect Retry-After, inspect aggregate traffic, do not disable limiting |
| Login 503 | Redis configuration/connectivity/quota and trusted-IP mode/header; existing sessions need not be affected |
| Local login 503 | Check effective environment source/presence; both Redis values must be empty for local bypass. See [environment reference](environment-reference.md) |
| Mutation 403 | Exact APP_ORIGIN versus browser Origin; role/scope/active assignment; do not add wildcard origins |
| Mutation 415 / 413 | JSON content type / request-size bound; inspect the client, do not remove guard checks |
| Page not found or group missing | Wrong ID, out-of-scope access, ended assignment, or deleted group hidden from operational list |
| Attendance 409, ATTENDANCE_VERSION_CONFLICT | Another save changed the version; review and reload latest data before resubmitting |
| Mutation 409, GROUP_DELETED | Historical group is read-only; do not bypass the mutability guard |
| Generic 500 / transaction timeout | Check server/provider diagnostics, database connectivity, pool saturation and locks; retain atomicity and avoid blind retries |
| Export differs from visible report | Reapply the form's date filter; verify recorded-entry denominator and current hierarchy attribution |

For a lost response after meeting creation, inspect the meeting list before retrying:
a committed request can have lost its response, and creation does not expose an
idempotency key. For assignment or attendance failures, inspect current state before
retrying. Do not manually replay mutation SQL or remove locks to restore availability.

Login limiting counts successful and failed attempts: 5 per normalized username and
30 per trusted IP per 15-minute sliding window. Shared NAT can affect several users.
Redis failures intentionally block new logins; restore connectivity/configuration
rather than weakening production trust. If additional diagnostics are needed, log
only safe stage codes/presence booleans temporarily and remove them after diagnosis.

## Backups and recovery

Follow [the Supabase Free logical backup/restore runbook](backup-restore.md). Assign
an owner, use at least daily and pre-migration backups as a proposed baseline, and
agree the actual retention and recovery objectives with the client. Encrypt archives,
keep an off-project copy, monitor failures, and rehearse restoring to an isolated
disposable target. Record both backup age and measured restore duration.

Group CSV exports are not a recoverable application backup: they exclude credentials,
assignments, audit state, schema and migration history. Logical database dumps also
do not replace records of platform configuration, secrets, or grants. Never restore
over the sole surviving production copy; preserve it for diagnosis and verify the
restored target before switching traffic. Consider session invalidation after recovery.

## Releases and configuration changes

Use [the deployment sequence](deployment-guide.md). Review pending SQL before a
single controlled `migrate deploy` job; never use `db push`, `migrate dev`, or reset
on production. Preserve release outcomes without connection secrets.

For secret rotation, coordinate replicas and provider credentials. Changing
`AUTH_SECRET` invalidates sessions and changes rate-limit buckets. An application
rollback is safe only against a compatible database; restoration has a recovery
point and can lose later writes. Plan and communicate this rather than treating
rollback as an unconditional button.

## Known limitations to retain in the handover

- The [dependency triage](dependency-security.md) is dated; run a new audit and
  explicitly record acceptance/remediation rather than asserting the current build
  has no vulnerable dependencies.
- [PostgreSQL integration coverage](integration-tests.md) currently establishes a
  smoke-test foundation. Real concurrency testing remains deferred; mocked lock and
  rollback tests are not live-database evidence.
- Vercel UAT success does not certify Cloud Run or generic-host configuration.
- The app has no dedicated service health endpoint; `/login` checks rendering, not
  all dependencies. Verify Redis/database through an agreed application smoke flow.
- Notification controls and the static dashboard header date are not an implemented
  notification service or authoritative operational clock.

Close handover only after service access, recovery ownership, support contacts, and
known exceptions have been acknowledged by the client and technical operator.
