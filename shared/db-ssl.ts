/**
 * Resolve the `ssl` option for a Postgres connection.
 *
 * Managed providers (Neon, Heroku, RDS, …) terminate TLS with certificates that
 * don't chain to a root the client trusts, so they need `rejectUnauthorized: false`.
 * A local Homebrew/Docker Postgres ships with `ssl = off` and rejects the TLS
 * handshake outright, so SSL must be disabled entirely there.
 *
 * Default: off for localhost, on for everything else.
 * Override with `DATABASE_SSL=true|false` (or `sslmode=disable|require` in the URL).
 */
export function resolveDbSsl(
  connectionString: string | undefined,
): { rejectUnauthorized: false } | false {
  const enabled = { rejectUnauthorized: false } as const;

  const override = process.env.DATABASE_SSL?.trim().toLowerCase();
  if (override === "true" || override === "require") return enabled;
  if (override === "false" || override === "disable") return false;

  if (!connectionString) return false;

  try {
    const url = new URL(connectionString);
    const sslmode = url.searchParams.get("sslmode")?.toLowerCase();
    if (sslmode === "disable") return false;
    if (sslmode) return enabled;

    const host = url.hostname;
    const isLocal =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "" || // unix socket
      host.endsWith(".local");
    return isLocal ? false : enabled;
  } catch {
    // Not a parseable URL (e.g. a bare socket path) — assume local.
    return false;
  }
}
