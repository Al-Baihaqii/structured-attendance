# Supabase Free logical backup and restore

Supabase recommends regular external dumps for Free projects; do not assume paid
managed backup/PITR features are available. See [Supabase backups](https://supabase.com/docs/guides/platform/backups).
Assign an operator, schedule (at least daily and before migrations), retention
policy, and recovery objectives. Monitor failures and periodically measure restore
time. Backup frequency sets the maximum expected data-loss window.

## Secure connections

Install PostgreSQL client tools matching the server major version (or a compatible
newer `pg_dump`). Use a direct or session-pooler TLS connection, never transaction
pooling. Provision local libpq service definitions `attendance_source` and
`attendance_restore` using `PGSERVICEFILE`, with passwords supplied by a private
`PGPASSFILE` or secret manager. Require `sslmode=verify-full` with the provider CA
where needed. Restrict file permissions (0600 on Unix; owner-only ACL on Windows).
Keep these files outside the repository. Never put real connection URIs/passwords
in commands, shell history, examples, screenshots, or logs.

Confirm service names resolve to the intended source and a **separate disposable
restore project**, including provider project ID, database, and host. Resolve target
identity in the operator console before any restore. Do not rely on database name
alone: Supabase projects often all use `postgres`.

## Backup

```sh
pg_dump --dbname="service=attendance_source" --schema=public --format=custom --no-owner --no-privileges --file=attendance-backup.dump
pg_restore --list attendance-backup.dump
```

Check exit status and archive contents, including all application tables,
`_prisma_migrations`, foreign keys, partial unique indexes and checks. `pg_dump`
provides a consistent snapshot without stopping normal writes. Encrypt the archive
immediately, record checksum/date/application revision/migration head, and copy it
to access-controlled storage outside the Supabase project. Restrict/delete local
plaintext copies after confirming the encrypted copy. The archive contains names,
attendance reasons, password hashes and audit history: treat it as sensitive data.

This backs up the application's `public` schema, not managed Supabase schemas,
platform settings, custom roles/grants, storage object bytes, Redis, or secret-manager
configuration. Record required grants/config separately without credentials. This
app uses custom auth; do not dump/restore managed `auth` or `storage` schemas casually.

## Restore rehearsal and incident recovery

1. Provision an isolated disposable database/project compatible with the source and
   required extensions. Block public traffic, disable Data API exposure, and verify
   the `attendance_restore` service points there, never at the live source.
2. Decrypt and verify the checksum, inspect `pg_restore --list`, and review SQL with
   `pg_restore --file=restore-review.sql attendance-backup.dump`. Protect this SQL
   like the backup. Only restore archives from trusted operators.
3. The command below is **destructive to objects present in the archive at the
   restore target**. Use it only on the verified isolated disposable target:

   ```sh
   pg_restore --dbname="service=attendance_restore" --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction attendance-backup.dump
   ```

   Check every failure; do not ignore errors or continue a partial restore. If
   provider-managed dependencies prevent schema/object recreation, reconcile the
   archive's restore list on the isolated target with the provider's supported
   procedure before retrying. Never drop managed schemas to bypass an error.
4. Reapply reviewed least-privilege grants (they were intentionally not restored).
   Verify anon/authenticated cannot access app data. With CLI env targeting **only
   the restored database**, run `npx prisma migrate status`. First validate the
   restored snapshot against its saved revision; apply newer reviewed migrations
   with `migrate deploy` only when moving to a newer release.
5. Compare counts and key invariants: no orphan/cross-group attendance, unique
   group meeting numbers, one active assignment/group, correct assignment/session
   ownership. Smoke-test scoped reads, attendance edit/version conflict, login, and
   CSV output with isolated UAT Redis/config. Record achieved recovery time and
   backup age. A readable archive alone is not a restore test.
6. For an actual incident, stop/route writes away, preserve the failed database for
   diagnosis, restore to a separate target, verify it, then deliberately switch
   runtime connections. Rotate `AUTH_SECRET` if needed to invalidate sessions from
   before the restored state. Account for writes after the backup and communicate
   the recovery point. Never restore over the only surviving production copy.
