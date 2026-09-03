# ARCHITECT.md — Reevera

**Status:** Production architecture. Not an MVP sketch.
**Authority:** This document defines the system. Code follows it. If code and this document disagree, this document wins until it is deliberately amended (see §31).
**Companion:** `AGENTS.md` defines *how* to work. This defines *what* to build. Read both.

---

## 1. How to use this document

- Read this before writing any code in this repo. Every session, not once.
- Sections marked **DECISION** are settled. Do not re-litigate them in a PR. Raise them as an amendment instead.
- Sections marked **OPEN** are genuinely unsettled. If your task touches one, stop and ask.
- Sections marked **CHANGED** differ from the earlier product/architecture draft. The reason is stated. If someone hands you the old draft, this file supersedes it.
- If a task requires violating a DECISION, do not proceed. Surface the conflict.

---

## 2. Product definition

Reevera is an autonomous video production system. A user provides an idea; Reevera plans, generates, inspects, assembles, renders, and publishes video.

```
Idea -> AI Director -> Structured production plan -> Generated assets
     -> Inspection -> Assembly -> Render -> Platform versions -> Publish
```

### 2.1 What Reevera is

A **production system** with durable project state, a dependency graph, cost control, and quality gates. The AI providers are interchangeable parts inside it.

### 2.2 What Reevera is not (non-goals)

- Not a thin wrapper over one video API.
- Not a real-time collaborative editor (single-writer per project in v1).
- Not a general-purpose NLE. The timeline is generated and adjustable, not a full editing suite.
- Not a stock/asset marketplace.

### 2.3 Honest scope boundary

Current generative video produces clips of roughly 5–10 seconds. A 10-minute film is 60–120 independently generated clips. Cross-clip identity, lighting, and motion continuity at that length is **not a solved problem**, and no amount of orchestration fully solves it today.

**DECISION — CHANGED (2026-08-28):** Sold durations are set by the plans (§19.6), not by this section. The earlier tiering (short-form first, long-form unsold) is superseded:

1. 15–90 second single-location, 1–3 character pieces — the quality benchmark every tier is built and tested against.
2. Up to 1 minute (Starter) — multi-scene narrative.
3. Up to 5 minutes (Creator) and up to 12 minutes (Studio) — sold and supported. Projects longer than 10 minutes are marked experimental in the UI and require explicit acknowledgement of continuity limits before spend.

The honesty above still stands: tier 3 falls out of the same pipeline; it just will not look as good, and the UI must not pretend otherwise.

---

## 3. Locked technology decisions

**DECISION** — the stack. "Swappable" means the choice is not load-bearing; replace it only with a stated reason.

| Layer | Choice | Swappable | Why |
|---|---|---|---|
| Language (backend) | Node.js + TypeScript (strict) | No | Schema-typed boundaries across queues and providers are mandatory at this complexity |
| API framework | Fastify | Yes | Schema-first validation, fast, small |
| Schema/validation | TypeBox (JSON Schema) | Yes | Native Fastify integration; one schema drives validation, types, and docs |
| Database | PostgreSQL 16+ | No | Transactional integrity for credits and versioning |
| DB access | Drizzle ORM + `drizzle-kit` generated SQL migrations | Yes | See §3.2 |
| Cache / queue backing | Redis 7+ | Yes | — |
| Job queue | BullMQ | Yes | Mature, supports delays, rate limits, repeatable jobs |
| Object storage | S3-compatible (Cloudflare R2 primary) | Yes | Zero egress cost matters heavily for a video product |
| Media assembly | FFmpeg | No | — |
| Caption/graphics compositing | FFmpeg filters (`drawtext`/`ass` subtitles) | Yes | See §17.3 |
| Realtime | SSE | Yes | See §9 |
| Frontend (app) | React + TypeScript + Vite | Yes | See §3.1 |
| Frontend (marketing/auth) | Static HTML/CSS/JS | Yes | No framework needed there |
| Reverse proxy | Nginx | Yes | — |
| Container runtime | Docker (all services) | No | Worker images need pinned FFmpeg builds |
| Observability | OpenTelemetry -> collector -> (Grafana stack or hosted) | Yes | Tracing across queue hops is not optional |

### 3.1 Frontend framework **CHANGED**

The earlier draft specified vanilla HTML/CSS/JS for everything. That is fine for a landing page and wrong for this application.

The editor requires: a multi-panel layout with synchronized state (scene list, preview, director chat, timeline), optimistic updates, undo/redo over versioned entities, live job progress on dozens of concurrent assets, and drag-based timeline manipulation. Hand-rolled DOM state management for that is where the project loses two months.

**DECISION:**
- `/`, `/login`, `/register`, `/pricing`, docs — static HTML/CSS/JS. Fast, SEO-friendly, no build step.
- `/dashboard` and everything under `/project/:id` — React + TypeScript SPA.
- One shared API client. The backend contract is identical for both; the split is purely delivery.

### 3.2 DB access **CHANGED (2026-08-28)**

The earlier row specified Kysely + hand-written SQL migrations, with the rationale "no ORM magic over money or versioning." The rationale stands; the tool changed.

**DECISION:** Drizzle ORM, with migrations generated by `drizzle-kit` from the schema in `packages/db/src/schema/`. Reason: one declaration drives the table definitions, the types, and the migrations, and `drizzle-kit studio` gives direct database inspection during development — the config and schema live in one place instead of three.

Drizzle is a typed query builder with a schema layer, not an active-record ORM, so it does not import the magic the original rationale rejected. That only holds if these constraints are kept, and they are not optional:

- Balance reads on a spending path take an explicit row lock (`.for("update")`). Never a plain select (§19.2).
- The ledger insert and the materialized-balance update are written out in one explicit transaction. No lazy relation loading, no cascade helpers, no implicit writes anywhere on a money or versioning path.
- Version rows are inserted, never updated in place (§6.2).
- Generated migration SQL is reviewed before merge. `drizzle-kit push` is never run against staging or production; migrations remain a separate gated deploy step (§25).

If any of these becomes inconvenient, the answer is to drop to raw SQL for that path — not to relax the constraint.

Package manager: **npm workspaces**. No prior section specified one.

---

## 4. System topology

Separate **processes**, not microservices. One repo, one deploy pipeline, several runtimes.

```
                          Internet
                             |
                          Nginx (TLS)
                             |
        +--------------------+---------------------+
        |                    |                     |
   Static assets        API service           SSE service
   (CDN / Nginx)        (Fastify, N)          (Fastify, N)
                             |                     ^
                             v                     |
              +----------- Postgres ---------+     |
              |              |               |     |
              |          Redis (queues, pubsub)----+
              |              |
              |     +--------+---------+---------+----------+
              |     |        |         |         |          |
              |  director  media    inspect   render     publish
              |  worker    worker   worker    worker     worker
              |     |        |         |         |          |
              +-----+--------+---------+---------+----------+
                             |
                    Object storage (R2/S3)
```

### 4.1 Process roles

| Process | Scales on | Notes |
|---|---|---|
| `api` | Request rate | Stateless. No CPU-heavy work. Never shells out to FFmpeg. |
| `sse` | Concurrent open connections | Separate from `api` so long-lived connections don't starve request handling |
| `worker:director` | LLM concurrency | I/O bound, cheap |
| `worker:media` | Provider concurrency | I/O bound; polls/awaits provider jobs, downloads results |
| `worker:inspect` | GPU/VLM budget | May be I/O (hosted VLM) or CPU (embeddings) |
| `worker:render` | CPU cores | **CPU bound.** Must be isolated hosts. See §17.4 |
| `worker:publish` | Platform quota | Rate-limited by external quota, not by us |
| `scheduler` | Singleton | Reconciliation sweeps, retention jobs, quota resets. Leader-elected via Redis lock. Also consumes the `payments` queue (§19.7) — applying a billing event is a short transaction with no provider call in it, so it does not earn a process of its own. |

**DECISION:** `worker:render` never shares a host with `api` or `sse` beyond local development. FFmpeg will consume every core it is given.

---

## 5. The core architectural rule

**The LLM is not the database.**

The Director reasons and proposes. The backend validates, decides, and persists. Postgres is the sole source of truth.

```
User message
    -> Director (LLM)
    -> Proposed structured command (untrusted)
    -> Backend: schema validation -> authorization -> lock check -> business rules
    -> Postgres transaction (new version row)
    -> Dirty-state propagation
    -> Job enqueue
    -> Events to client
```

Consequences that are not negotiable:

- Director output is **untrusted input**. It passes the same validation gauntlet as a raw HTTP body (§8.4). A hallucinated `sceneId` is a rejected command, not a created scene.
- The Director never receives DB credentials, storage credentials, provider keys, or the ability to execute arbitrary code.
- No system behavior depends on the LLM remembering anything. Context is assembled from Postgres on every turn.
- If the Director is unavailable, the product degrades to manual editing. It does not fail closed on everything.

---

## 6. Domain model

### 6.1 Entities

```
User                      (role: user | admin | owner — §7.4)
Organization (v2 — schema reserved now, see §7.1)
Project
  ProjectVersion        (creative brief, script, style bible, world bible)
  DirectorContext       (bounded semantic memory; chat rows remain immutable)
  Character -> CharacterVersion
  Location  -> LocationVersion
  Scene     -> SceneVersion   (holds SceneSpec)
  Shot      -> ShotVersion
  ContinuityState         (per scene boundary)
  Timeline  -> TimelineVersion
  Render
  Publication
Asset
GenerationJob -> ModelRun
CreditLedgerEntry
SocialAccount
IdempotencyKey
AuditLogEntry
ModerationDecision
```

**NEW (2026-08-31) — project generation settings.** A project carries four
columns the user sets and the Director may not: `output_kind`
(`video | image`), `aspect_ratio`, `duration_target_seconds`, and
`generation_tier` (`draft | standard | cinematic`, default `standard`).

They are columns on `projects`, not fields in a `ProjectVersion` payload,
because they are not creative content. §6.2's version rows hold what the
Director proposes and a restore rewinds; these are the brief the user gave it,
and rewinding a scene must not silently change the frame shape of the film.

`duration_target_seconds` was previously a field in the project version payload,
written by `propose_script`. It is removed from there and from that tool's
schema. Two writable homes for "how long is this film" is two answers to the
same question, and the user's is the one that binds — the Director now reads it
as a constraint. Migration `0003` carries existing payload values across.

### 6.2 Versioning model **CHANGED**

The earlier draft had a separate `*_versions` table per entity plus a `current_version_id` FK on the parent. That creates a circular FK, five near-identical tables, and no way to express "revert the whole project to Tuesday."

**DECISION:** Keep per-entity version tables (they carry different payload shapes and are worth the clarity), but standardize them:

```sql
-- every *_versions table
id           uuid pk
parent_id    uuid not null references <parent>(id) on delete cascade
version      int  not null            -- monotonic per parent
payload      jsonb not null           -- schema-versioned, see below
payload_schema_version int not null
content_hash text not null            -- sha256 of canonical payload, see §16
created_by   text not null            -- 'user:<id>' | 'director' | 'system'
created_at   timestamptz not null
unique (parent_id, version)
```

- `current_version` lives on the parent as an `int`, **not** a FK to the child. No circular reference.
- A `project_snapshots` table records `(project_id, label, created_at, entity_versions jsonb)` mapping every entity to a version number. That is what "restore to yesterday" restores.
- Versions are immutable. Editing creates a new row. Nothing is ever updated in place.
- `payload_schema_version` is mandatory. Payload shapes will change; old rows must remain readable.

### 6.3 Invariants

These must hold at all times. Enforce with DB constraints where possible, service-level assertions otherwise, and test each one explicitly (§26).

1. **CHANGED (2026-08-30):** A user's credit balance may go negative, by at most
   what the requests already admitted could cost. It is never negative for any
   other reason, and a negative balance admits nothing further (§19.2).
2. **REMOVED (2026-08-30):** there are no reservations, so nothing is reserved.
3. **CHANGED (2026-08-30):** No generation job runs for a user whose balance is
   not positive.
4. A locked entity's payload cannot change except via an explicit unlock action by a user.
5. Every asset in `ready` state has a verified object in storage with a recorded byte size and checksum.
6. Every `generation_job` in a terminal state has either an `asset_id` or an `error`.
7. A shot cannot reference a character version that does not belong to its project.
8. A published `Publication` always references a `Render` in `completed` state.
9. No project is renderable while any of its shots are `dirty`.

---

## 7. Identity, tenancy, authorization

### 7.1 Tenancy

**DECISION:** Every domain row carries `owner_user_id` (and `organization_id`, nullable, reserved for v2). Multi-tenancy is enforced in the repository layer — every query is scoped by owner. There is no code path that fetches a project by ID alone.

Repository methods take an explicit actor:

```ts
projects.getById(actor, projectId)   // scoped, returns null if not owned
projects.getByIdUnsafe(projectId)    // exists only for workers; name is the warning
```

`*Unsafe` methods are permitted only inside workers operating on a job whose ownership was already resolved at enqueue time. Grep-ability is the point.

### 7.2 Sessions

**DECISION:**
- Access token: JWT, 15 minutes, in memory on the client. Never localStorage.
- Refresh token: opaque random 256-bit value, stored hashed in Postgres, delivered as `HttpOnly; Secure; SameSite=Lax` cookie, 30 days, **rotated on every use** with reuse detection (a replayed refresh token revokes the whole family and logs a security event).
- Logout revokes the family server-side. Stateless-only logout is not acceptable for a platform holding OAuth tokens for the user's social accounts.
- Passwords: Argon2id. Parameters in config, tuned to ~250ms on production hardware.

### 7.2a Email verification and social sign-in **NEW (2026-08-29)**

The earlier draft named `/auth/register` and `/auth/login` but never said how an
address is proven, and it had no sign-in identity providers at all — `SocialAccount`
(§6.1, §21) is publishing, not login. Both are settled here.

**DECISION — email is the identity key.** One account per address. A user proves the
address with a 6-digit code (10 minutes, 5 attempts, one pending code per user,
stored as a keyed HMAC so a database leak alone cannot brute-force it). An account
that has not proven its address can hold no session.

**DECISION — social sign-in is identity, not session.** Providers only answer "who is
this". Everything in §7.2 still owns the session: our own access token, our own
refresh family, our own logout. A hosted identity platform (Firebase, Clerk, Auth0)
would either duplicate that or replace it, so none is used. Provider identities live
in `user_identities(provider, provider_user_id)`, one row per user per provider.

Google is the first provider. Adding Apple, Microsoft or GitHub is a new adapter plus
one row of config, not a new design — but Apple needs a paid developer account, a
client secret that expires every 6 months, and a `form_post` callback that collides
with the "no form-encoded mutation endpoints" rule in §20. Raise that as its own
amendment when it ships.

**DECISION — linking rules.** When a provider presents an address that already has an
account, exactly one of these applies:

| Existing account | Action |
|---|---|
| Already has this provider linked | Sign in |
| No account | Create, verified |
| Exists, address **not** verified | Claim it: mark verified, **drop the password**, link |
| Exists, address **verified** | Do not link. Issue a 10-minute consent ticket; linking completes only after the account's own password is entered |

The claim rule is deliberate: a password on an unverified account was set by someone
who could not read the mailbox. The consent rule is the other half — a provider
proving it controls an address is not proof it is the person who owns the account, so
verified accounts are never auto-linked. An unverified address from a provider is
rejected outright; it proves nothing.

Consent tickets travel in an `HttpOnly` cookie, never in a redirect URL — a URL lands
in browser history and `Referer` headers.

### 7.3 Authorization

Three checks, in this order, on every mutating request:

1. **Authentication** — valid session.
2. **Ownership** — actor owns the target resource (repository-enforced).
3. **State/lock** — the resource is in a state that permits this action, and no relevant lock blocks it (§14.5).

Authorization decisions on sensitive operations (billing, publishing, key management, account deletion) write an `AuditLogEntry`.

### 7.4 Admin roles **DECISION**

- `users.role`: enum `user | admin | owner`. Default `user`. `owner` is the bootstrap operator and the only role that can grant or revoke `admin`.
- Admin is a platform-level role (not per-project, not per-org — orgs are v2, §7.1).
- Admin routes live under `/api/v1/admin/*` and pass a dedicated admin guard **after** normal authentication. Ownership checks (§7.3 step 2) do not apply to admin routes — the guard replaces them.
- **MFA is mandatory for `admin` and `owner`.** An account without MFA cannot hold an admin role; the role is stripped if MFA is disabled.
- Admin sessions use the same token machinery but a shorter refresh lifetime (8 hours) and a separate rate-limit bucket.
- Every admin mutation writes an `AuditLogEntry` with actor, action, target, and before/after state. There are no unaudited admin mutations.

---

## 8. API contract

All rules in `AGENTS.md` §5 apply. This section adds Reevera-specific bindings.

### 8.1 Versioning

**DECISION:** Path-prefixed: `/api/v1/...`. Breaking changes go to `/api/v2`. `v1` gets a minimum 6-month deprecation window once a paying customer exists.

### 8.2 Resource routes

```
POST   /api/v1/auth/register                 202, always — never says if the address is taken
POST   /api/v1/auth/resend-code              202, always
POST   /api/v1/auth/verify-email             { email, code } -> session
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh                  cookie only; returns the token, not the profile
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

GET    /api/v1/auth/google                   302 to Google (PKCE + state in a signed cookie)
GET    /api/v1/auth/google/callback          302 back to the app
POST   /api/v1/auth/google/link              { password } + consent cookie — see §7.2a

GET    /api/v1/account                       profile + plan + balances — NEW (2026-08-29)
GET    /api/v1/account/usage                 cycle spend; the one aggregate query
PATCH  /api/v1/account                       { name }
DELETE /api/v1/account                       202 scheduled; { immediate: true } -> 204 purged (§22)
DELETE /api/v1/account/deletion              cancels a scheduled deletion
POST   /api/v1/account/feedback              202; queued for the admin surface (§28)
GET    /api/v1/account/export                (§22, not built)

GET    /api/v1/plans                         plan catalogue (§19.6) — NEW (2026-08-29)

GET    /api/v1/projects                      (cursor paginated)
POST   /api/v1/projects
GET    /api/v1/projects/:id
PATCH  /api/v1/projects/:id                  { name, mode, outputKind, aspectRatio, durationTargetSeconds, generationTier }
DELETE /api/v1/projects/:id                  204; deletes it and everything under it — CHANGED (2026-08-30)

POST   /api/v1/projects/:id/director/messages
GET    /api/v1/projects/:id/director/messages (cursor paginated)
POST   /api/v1/projects/:id/director/cancel   202; stops the open turn — NEW (2026-08-30)
DELETE /api/v1/projects/:id/director/messages/:messageId
                                              removes it and everything after — NEW (2026-08-30)
PATCH  /api/v1/projects/:id/director/context  { autoCompact }
POST   /api/v1/projects/:id/director/context/compact

GET    /api/v1/projects/:id/scenes           (cursor paginated)
POST   /api/v1/projects/:id/scenes
GET    /api/v1/scenes/:id
PATCH  /api/v1/scenes/:id
GET    /api/v1/scenes/:id/versions           (cursor paginated)
POST   /api/v1/scenes/:id/restore            { version }

POST   /api/v1/scenes/:id/generate           (idempotency key required)
POST   /api/v1/shots/:id/regenerate          (idempotency key required)

GET    /api/v1/projects/:id/jobs             (cursor paginated, filterable)
GET    /api/v1/jobs/:id
POST   /api/v1/jobs/:id/cancel

GET    /api/v1/projects/:id/assets           (cursor paginated)
GET    /api/v1/assets/:id/url                (issues short-lived signed URL)
GET    /api/v1/projects/:id/generation       shots done / planned, the step in
                                             flight, why it stopped — NEW
                                             (2026-08-31). Not paginated: a
                                             fixed-size summary of one project,
                                             and a page of it could not carry a
                                             total.
POST   /api/v1/projects/:id/generation/pause  stops the *next* shot; the one
                                              running finishes — NEW (2026-08-31)
POST   /api/v1/projects/:id/generation/resume clears the pause and asks the
                                              worker for the next step. Also how
                                              a chain stopped by a failure is
                                              restarted — NEW (2026-08-31)
GET    /api/v1/scenes/:id/clips              the scene's shots and whatever clips
                                             exist, for review before the film is
                                             finished. Bounded by §8.4's 40 shots
                                             per scene — NEW (2026-08-31)

POST   /api/v1/projects/:id/renders          (idempotency key required)
GET    /api/v1/renders/:id

POST   /api/v1/renders/:id/publications      (idempotency key required)
GET    /api/v1/publications/:id

GET    /api/v1/credits/balance
GET    /api/v1/credits/ledger               (cursor paginated)
POST   /api/v1/credits/checkout             (idempotency key required)

GET    /api/v1/social-accounts
POST   /api/v1/social-accounts/:platform/connect
DELETE /api/v1/social-accounts/:id

GET    /api/v1/events/projects/:id           (SSE, see §9)

POST   /api/v1/webhooks/providers/:provider  (signed, unauthenticated)
POST   /api/v1/webhooks/payments             (signed, unauthenticated)

GET    /api/v1/admin/users                   (cursor paginated, filterable)
GET    /api/v1/admin/users/:id               (profile, plan, balances, spend summary)
POST   /api/v1/admin/users/:id/credits/adjust    { amount, reason }
POST   /api/v1/admin/users/:id/suspend           { reason }
POST   /api/v1/admin/users/:id/mfa/reset
GET    /api/v1/admin/projects/:id/cost            (itemized: provider calls, renders, storage)
GET    /api/v1/admin/renders/:id/cost
GET    /api/v1/admin/metrics                      (margin, cost/finished-minute, cache hit — §28.3)
GET    /api/v1/admin/moderation/appeals           (cursor paginated)
POST   /api/v1/admin/moderation/appeals/:id/resolve
POST   /api/v1/admin/kill-switches/:name          { enabled }   — the §24 flags
POST   /api/v1/admin/impersonate/:userId          (time-boxed, audited, §28.4)
```

### 8.3 Pagination

**DECISION:** Cursor-based everywhere. Opaque base64 cursor encoding `(created_at, id)`. `limit` default 20, hard max 100, clamped server-side. No offset pagination on any collection that grows.

```json
{ "data": [...], "page": { "nextCursor": "...", "hasMore": true } }
```

### 8.4 Validation

**DECISION:** Every route declares a TypeBox schema for params, query, body, and response. `additionalProperties: false` everywhere. Unknown fields are a 400, not a silent drop. Response schemas are enforced in non-production and used to strip fields in production — a field not in the schema cannot leak.

Hard limits, enforced at the schema layer:

| Input | Limit |
|---|---|
| Director message | 4,000 chars |
| Project name | 120 chars |
| Script text | 200,000 chars |
| SceneSpec JSON | 32 KB, max nesting depth 8 |
| Scenes per project | 500 |
| Shots per scene | 40 |
| Characters per project | 40 |
| Reference image upload | 10 MB, jpeg/png/webp only, magic-byte verified |
| Request body (default) | 256 KB |
| Array length (default) | 200 |

### 8.5 Errors

One shape, always:

```json
{
  "error": {
    "code": "SCENE_LOCKED",
    "message": "Scene 4 is locked and cannot be modified.",
    "details": { "sceneId": "..." },
    "requestId": "01J..."
  }
}
```

`code` is a stable enum the client switches on. `message` is human-facing and safe to display. Internal detail — stack traces, provider payloads, SQL — never crosses the boundary. `requestId` is the trace ID.

### 8.6 Rate limits

**DECISION:** Two layers.

- **Request rate** (Redis token bucket, per user + per IP): general reads 120/min, mutations 30/min, auth endpoints 10/min per IP. The counter lives in Redis, not process memory — the limit is per fleet, not per replica, and it costs the api process no memory that grows with the number of distinct callers. Counters carry the window as their TTL so Redis reclaims them itself.
- **Redis down is not a lockout.** The limiter fails open (`skipOnError`): it is abuse control, not an authorization gate, and the auth checks behind it are unaffected.
- **Cost rate** (§19.4): a per-user cap on credits committed per hour, and a global platform spend circuit breaker. This is the layer that actually protects the bank account.

`429` responses always include `Retry-After`.

### 8.7 Idempotency

**DECISION:** Required on every endpoint that spends money or creates a job: generate, regenerate, render, publish, checkout.

```sql
idempotency_keys(
  key text, user_id uuid, endpoint text,
  request_hash text, response_status int, response_body jsonb,
  state text,           -- 'in_progress' | 'completed'
  created_at, expires_at,
  primary key (user_id, key)
)
```

- Same key + same request hash while `in_progress` -> `409 REQUEST_IN_PROGRESS`.
- Same key + same hash, `completed` -> replay the stored response.
- Same key + **different** hash -> `422 IDEMPOTENCY_KEY_REUSED`.
- Retained 24 hours.

---

## 9. Realtime

**DECISION: SSE, not WebSockets, for v1.** **CHANGED** (the earlier draft left this open)

Every realtime need in this product is server -> client: job progress, asset ready, scene updated, render progress. Client -> server is already well served by ordinary POSTs. SSE gives automatic reconnect with `Last-Event-ID`, works through every proxy, and needs no separate protocol handling, heartbeat design, or backpressure machinery.

Revisit only when a genuinely bidirectional feature exists (multi-user collaborative editing). That is not v1.

### 9.1 Contract

```
GET /api/v1/events/projects/:id
```

- One connection per open project, max 3 per user. Exceeding closes the oldest.
- Events published to Redis pub/sub by workers, fanned out by the `sse` process.
- Each event carries a monotonic `id`. On reconnect the client sends `Last-Event-ID` and receives everything missed from a bounded Redis stream (retained 15 minutes). Older gap -> server sends `resync` and the client refetches project state.
- **Coalescing:** progress events for the same job are throttled to at most 1 per 500 ms per job; only the latest is sent. A 60-shot project must not emit thousands of events per second.
- **Deltas, not snapshots.** After the initial state fetch, events carry only what changed.
- Idle heartbeat comment every 20 s so proxies do not close the connection.
- **NEW (2026-08-30) — a gap is a property of the stream, not a frame count.** A
  resuming client is told to `resync` only when the stream no longer reaches
  back to its `Last-Event-ID`; everything still held is replayed. Counting
  missed frames instead mistakes a busy half-minute of Director streaming for an
  expired connection, and resyncs a client that could have resumed exactly.
- **NEW (2026-08-30) — a streaming turn is recoverable from Postgres.** Deltas
  are appends, and appending to a row that stops at "nothing yet" loses
  everything before the point a reader joined. So the Director row is written
  back on a short timer while the turn streams, not only at tool boundaries, and
  a client that joined an open turn refetches once when it ends. A tab switch, a
  back navigation and a reload all land on the same state as watching it live.

### 9.2 Event types

```
job.queued | job.started | job.progress | job.completed | job.failed | job.cancelled
asset.ready | asset.failed
scene.updated | shot.updated | character.updated
inspection.completed
render.progress | render.completed | render.failed
publication.updated
credits.updated
director.message | director.thinking
resync
```

Payloads are IDs plus changed fields. The client fetches detail via the REST API. Events are notifications, not a data channel.

---

## 10. Job system

### 10.1 State machine

```
queued -> admitted -> processing -> awaiting_provider -> downloading
       -> inspecting -> (completed | retrying -> processing | failed)
                                 -> cancelled (from any non-terminal state)
```

`retrying` re-enters `processing`. Terminal: `completed`, `failed`, `cancelled`.

### 10.2 Rules

**DECISION:**

- Every job is **idempotent**. Re-running it produces the same asset or a no-op. Enforced via content hash (§16): if an asset with this input hash already exists and is `ready`, the job completes immediately without calling any provider. This is both a correctness and a cost mechanism.
- Every job has a **lease**. A worker holds a lease with a heartbeat; a lease that expires returns the job to `queued` with `retry_count + 1`. No job is stuck forever because a worker was OOM-killed.
- Every job has an **absolute deadline** (`expires_at`). Past it, the job fails, whatever the provider already billed is charged, and the provider job is cancelled if the provider supports it.
- Retries use exponential backoff with jitter. Retry budget is per failure class:

| Failure class | Retries | Notes |
|---|---|---|
| Network/timeout | 5 | Backoff 2s -> 60s |
| Provider 5xx | 3 | Trips circuit breaker (§13.4) |
| Provider rate limit | 8 | Honor `Retry-After`; queue-level rate limiter |
| Provider content rejection | 0 | Never retry the same prompt; route to repair (§15) |
| Invalid output / failed inspection | 2 | Repair loop, then surface to user |
| Our bug (validation, 4xx to provider) | 0 | Fail loudly, alert |

- **Cancellation is real.** Cancelling propagates to the provider, charges what was actually spent, and marks dependent queued jobs cancelled.
- Job payloads are small: IDs and a content hash. Workers load state from Postgres. Never serialize a SceneSpec into a queue message.

### 10.3 Provider webhooks

Most video providers are async and callback-based.

**DECISION:**
- Signature verification on every webhook. Reject unsigned or stale (>5 min skew) deliveries.
- **Never trust ordering.** A `completed` callback may arrive before the `started` one. Handlers are state-machine transitions guarded by the current state, not blind writes.
- **Deduplicate** on `(provider, provider_event_id)` with a unique index.
- Webhook handler does the minimum: verify, persist the raw event, enqueue a job. It never calls a provider or downloads media inline.
- **Webhooks are an optimization, not a dependency.** A reconciliation sweep (§10.4) polls every job in `awaiting_provider` older than its expected duration. If a provider never calls back, the system still converges.

### 10.4 Reconciliation

The `scheduler` runs, on a fixed cadence:

- Expired leases -> requeue.
- `awaiting_provider` past expected duration -> poll provider.
- Jobs past absolute deadline -> fail + charge what the provider billed.
- Assets marked `ready` with no verifiable storage object -> mark corrupt, mark dependents dirty.
- Storage objects with no asset row -> orphan cleanup after 24 h.
- Stuck renders -> fail + notify.

Every sweep emits metrics. A rising reconciliation count is an early warning that something upstream is broken.

---

## 11. AI Director

### 11.1 Shape

One Director. Not a swarm. **DECISION:** the earlier draft's warning against ten agents talking to each other stands and is hereby locked.

```
Director (LLM, tool-calling)
   |
   +-- Workflow engine   (deterministic; owns phase transitions)
   +-- Model router      (deterministic; owns provider choice)
   +-- Inspector         (separate, narrow AI calls)
```

The Director decides *creative intent*. Deterministic code decides *everything mechanical*: what it costs, whether it is permitted, what order jobs run in, when a phase advances.

**CHANGED (2026-08-30) — model choice moves to the Director, validation does not.**
The earlier text put provider choice on the router's side of that line. It is
now the Director's proposal, for the reason every other creative call is: only
the Director knows how hard the shot is. A dialogue close-up needs native audio
and a locked identity; an establishing plate of an empty street needs neither,
and routing both to the same tier either spends premium credits on the plate or
starves the close-up. Deterministic priority order cannot see that difference —
it can only see the request, which is the same request in both cases.

So the Director names a model and the router **validates** it (§13.2): the
capability envelope, the budget ceiling, the circuit breaker. A model that
cannot produce the asked-for duration, aspect ratio or audio is a rejection with
its envelope attached, not a silent substitution. This keeps the §5 contract
intact — the Director proposes, the backend disposes — and it is the reason the
Director is given the priced capability catalog (§11.2 `read_model_catalog`) in
the first place: a cost decision made without prices is a guess.

### 11.2 Tools

Tools are backend functions with strict schemas. The Director may only call these.

```
read_project_state()      read_script()          read_scene(sceneId)
read_model_catalog(kind)  -- NEW (2026-08-30), see §11.1/§13.2
propose_script()          propose_script_edit()   (no duration — §6.1)
propose_character()       propose_character_edit()
propose_scene()           propose_scene_edit()
propose_shot()            propose_shot_edit()
propose_audio_cue()       propose_audio_cue_edit()
request_generation(target)    -- quality comes from the project generation tier (§6.1)
request_inspection(assetId)
request_render()
request_publish(renderId, platforms)
ask_user(question, options)
```

Naming is deliberate: **`propose_*`, not `create_*`.** The Director proposes; the backend disposes. A proposal that fails validation, hits a lock, or exceeds budget returns a structured error to the Director, which may revise or escalate to the user.

Destructive operations (delete project, purchase credits, disconnect social account, unlock a locked entity) have **no tool**. They are user-only actions.

### 11.3 Context assembly

Context is built deterministically from Postgres each turn. Never a growing chat log.

```
System instructions (static)
+ Project card         (brief, mode, platform, duration target, generation tier)
+ Style bible          (compact)
+ Character bible      (compact; full detail only for characters in scope)
+ Scene index          (numbers, one-line summaries, status)
+ Focused scene(s)     (full SceneSpec, only what the turn concerns)
+ Continuity state at the relevant boundary
+ Recent conversation  (last N turns, summarized beyond that)
+ Output brief         (output kind, aspect ratio, target runtime, generation tier — §6.1)
+ Generation state     (shots done/planned, the step in flight — NEW 2026-08-31)
+ Available credits + estimated cost of pending action
```

**NEW (2026-08-31) — the Director is told what generation did while it was not
looking.** §11.1 keeps the Director out of the loop between shots, and that is
still right: sixty round trips to say "yes, the next one" would cost more than
the shots. But the consequence was that a turn which ended — or was stopped —
while the pipeline kept running left the Director answering the user's next
question about a film it believed was unmade. So the state block carries the
counts, the step in flight and the reason the chain stopped, assembled from rows
that already exist in the same read as everything else. It costs no extra model
call, and it is what makes "wait for the rest" and "queue another" distinguishable
without asking.

The output brief is the one part of the state block the Director has no tool
for. It reads as a constraint, not a field waiting to be filled in: an image
project gets no shot durations, camera movement, dialogue or audio cues, and a
video project's scene durations have to add up to the target. When the brief and
the story genuinely do not fit, the Director says so and names the setting to
change — it does not quietly plan something else.

**DECISION:** Context is hard-budgeted. Exceeding it drops detail by priority (oldest conversation first, then non-focused scenes), never silently truncates mid-structure.

**DECISION — context compaction (2026-08-30):** Director messages are never
deleted or rewritten by compaction. Compaction generates a bounded semantic
continuation summary from the prior summary plus old completed turns, stores the
summary with a `compacted_through_seq` cursor, and keeps the three most recent
exchanges verbatim. Static system instructions, tool definitions, and current
project state are never summarized; they are assembled fresh as above. Users can
compact manually, and auto compact is on by default at 85% of the hard context
budget. Compaction is a Director-worker model call: it is queued, rate-limited,
balance-checked, recorded as a `ModelRun`, and never runs in the API process.
While that call is open, the chat shows indeterminate progress and both the UI
and the transactional turn guard reject new prompts until success or failure.
The hard input budget comes from the configured model's price-table context
window minus its maximum output allowance; the meter and 85% trigger use that
same model-derived limit, never a UI constant.
For the configured `glm-5.3` provider contract this is 1,000,000 input tokens,
with its 131,072-token maximum output reserved separately.

### 11.4 Loop control

**DECISION:**
- Max 24 **writes** per user turn. Read-only tools do not count. Exceeded -> the remaining calls are refused individually and the Director must return to the user with a status and a question.

  This budget is not a cost control and must not be tuned as one. Once the model has emitted a tool call its tokens are already spent, and refusing the call still costs the round trip that carries the refusal back, so refusing saves nothing. Spend is bounded by the per-turn token budget and by the balance check that admitted the turn. What this bounds is **blast radius** — tool calls are what change the project, and a tool call is cheap enough in tokens that the token budget alone would permit hundreds of them — and it is what forces the §11.5 collaborative checkpoint. Reads are excluded because neither reason applies: they change nothing, and §11.1 requires the Director to read before it writes.
- Max 9 model round trips per turn. Each re-sends the whole context, so this is where the spend actually is.
- A refused call must still return a result. A tool call the client never sees resolve renders as work still in progress, forever.
- Per-turn token budget; exceeded -> hard stop with a user-facing message.
- Every LLM call is logged as a `ModelRun` with token counts and cost. Director cost is a real line item and counts against the project budget.
- Tool call loops (same tool, same args, twice) are detected and broken by the workflow engine, not by the model's good judgement.

**NEW (2026-08-30) — a question can be asked again.** Retry and edit are one
operation: remove a user message and every message after it, then send text —
unchanged for retry, changed for edit. Rewound turns are **deleted**, not
tombstoned: §11.3 assembles context from these rows, so a row the Director can
still read is a row that still shapes the answer.

Three refusals, all checked under the project lock in one transaction with the
delete, because each of them is a race otherwise: a turn in flight
(`TURN_IN_PROGRESS`), a compaction in flight (`CONTEXT_COMPACTING`), and a
message at or below `compacted_through_seq` (`MESSAGE_COMPACTED`). The last one
is the interesting one — the summary has already absorbed that message, so
deleting the row would not remove it from the model's context, only leave the
summary describing a conversation that no longer exists. **OPEN:** rewinding
into compacted history requires invalidating or regenerating the summary. Until
that is designed, it is refused.

**NEW (2026-08-30) — a turn can be stopped.** `POST /projects/:id/director/cancel`
closes the open row and raises a flag the worker polls; the worker aborts the
provider call, charges what was actually spent, and finishes
the turn as `cancelled` with the blocks it produced. The row is closed by the
API rather than by the worker so that stopping works for a turn that is still
queued, or whose worker has died. Tool calls that had not run do not run — a
stop must not change the project.

### 11.5 Modes

- **Autopilot** — Director advances phases without stopping. Still gated by budget ceiling and moderation.
- **Collaborative** — hard checkpoints at script, characters, storyboard, final. Nothing expensive runs before its checkpoint is approved. **DECISION:** this is the default mode. Autopilot must be chosen explicitly with a visible cost estimate.
- **Director Mode** — manual control of every field. The Director becomes advisory.

---

## 12. SceneSpec and the prompt compiler

### 12.1 SceneSpec is the source of truth

Prompts are **derived artifacts**. They are never the stored representation of creative intent. A provider swap must not lose project data.

```json
{
  "schemaVersion": 3,
  "sceneId": "scene_07",
  "durationTarget": 8.0,
  "location": { "ref": "hospital_v1", "time": "night" },
  "characters": [{ "ref": "emma_v3", "state": "wet, forehead cut" }],
  "shot": { "type": "close-up", "cameraMovement": "slow dolly in", "lens": "50mm" },
  "visual": { "lighting": "cold moonlight", "mood": "uneasy", "styleRef": "style_v2" },
  "dialogue": { "speaker": "emma", "text": "Who's there?", "emotion": "guarded" },
  "audio": { "ambience": "heavy rain, interior", "sfx": ["distant metal clang"] },
  "audioCues": [{
    "cueId": "low_transition",
    "kind": "transition_music",
    "source": "external",
    "content": "low cello pulse carrying into the next scene",
    "direction": "restrained, no percussion, duck under speech",
    "anchor": { "type": "transition", "edge": "out", "leadSeconds": 2 },
    "durationSeconds": 5,
    "fadeInSeconds": 1,
    "fadeOutSeconds": 2,
    "gainDb": -12,
    "duckUnderSpeech": true
  }],
  "transition": { "in": "hard cut", "out": "hard cut" },
  "continuityIn": "continuity_scene_06_out"
}
```

All refs are versioned. `emma_v3`, not `emma`. A scene is reproducible because it names exactly which version of everything it used.

`shot.dialogue` is, by definition, native video audio for visible lip-synced speech. External narration, off-screen voice, music, ambience, and SFX live in `audioCues`; the two routes must never duplicate the same line.

### 12.2 Prompt compiler

```
SceneSpec + Character/Style/World/Continuity (resolved versions)
        -> Prompt Compiler (pure function, no I/O, no LLM)
        -> ProviderRequest { prompt, negative, refs, params }
```

**DECISION:** The compiler is a **pure function**. Same inputs, same bytes out. This is what makes content hashing (§16) and caching possible. Any nondeterminism — including an LLM in the compile path — breaks the cache and is prohibited.

Provider-specific prompt formatting lives in the adapter, not the compiler. The compiler emits a normalized intermediate; adapters render it to their provider's dialect.

---

## 13. Model router and provider adapters

### 13.1 Capability request **CHANGED (2026-08-30)**

Callers ask for a capability and **may name a model**. The vendor stays out of
the request either way — `model` is an id from the price table (§19.1), not an
SDK, an endpoint or a dialect, and everything vendor-shaped still stops at
`providers/` (§13.3).

```ts
router.video({
  model: "x-ai/grok-imagine-video",   // the Director's proposal; optional
  quality: "cinematic",
  durationSeconds: 8,
  needs: ["characterConsistency", "imageToVideo", "nativeAudio"],
  budgetCeilingCredits: 180,
  aspectRatio: "16:9"
})
```

Omitting `model` keeps the old behaviour: the router picks. It is omitted
wherever no creative judgement is involved — repair rerolls, reference sheets,
and anything the system requests on its own behalf.

### 13.2 Routing inputs **CHANGED (2026-08-30)**

**When the caller named a model,** the router does not rank; it *validates*, and
the checks are the same ones that would have filtered the candidate list:

1. the model exists in the price table and is of the requested kind;
2. the model belongs to the project's selected generation tier;
3. its declared envelope covers the request — duration range, aspect ratio,
   frame control, reference-image count, and `nativeAudio` against what the shot
   carries;
4. its quoted cost for this request is within `budgetCeilingCredits`;
5. its circuit breaker (§13.4) is closed.

A failed check is a **structured rejection carrying the envelope that failed**,
returned to the Director to revise. It is never a silent substitution: swapping
a model behind the Director's back produces an asset it did not plan for, at a
price it did not agree to, and hides the routing bug that caused it. Check 5 is
the one exception — a model that is only unavailable *right now* falls back to
the router's own ranking, and the substitution is recorded and surfaced.

**NEW (2026-08-31) — the generation tier is a catalog boundary.** Each
generation model declares one or more tiers in `models.json`. The Director sees
and may name only models in the project's tier; unnamed routing filters by the
same tier before applying capability and cost checks. This makes Draft a
low-cost catalog, Standard the default balanced catalog, and Cinematic the
premium catalog without letting the Director silently change the user's spend
intent. Within the chosen model, the same tier still selects the lowest,
middle, or highest supported resolution price point.

**When the caller named no model,** the deterministic order is: project
generation tier -> required capabilities -> circuit breaker state -> current
cost -> observed p50 latency -> observed success rate. Ties are broken by cost.

**Audio is a capability in both directions (NEW 2026-08-31).** A model declares
`nativeAudio` as `optional` (the API takes an audio switch), `always` (it
synthesizes its own audio on every clip and publishes no switch) or `never`.
Silence is then a requirement like any other: a shot carrying dialogue needs
`optional` or `always`, and a shot carrying none needs `optional`. An `always`
model returns a silent shot with music and effects invented under it —
unremovable, mixed beneath the authored cues of §12.1 — so it is rejected with
`NATIVE_AUDIO_UNAVOIDABLE` and the models that can be quiet attached.

This replaces the boolean `generatesAudio`, which could not tell "makes audio on
request" from "makes audio no matter what" and recorded Grok Imagine — which
always scores its own clips — as silent. The route carries the chosen model's
mode as well as `withAudio`, because `withAudio` is what the clip *will have*
and the mode is whether the provider may be told anything about it: the audio
switch is sent only to a model whose capability says it exists.

Either way the decision, its reason, and whether the Director proposed it are
persisted on the `ModelRun`. "Why did this cost that much" must be answerable
from the database — including "because the Director chose the expensive one."

### 13.3 Adapter interface

```ts
interface VideoProvider {
  readonly id: string;
  readonly capabilities: CapabilitySet;
  estimateCost(input: VideoInput): Promise<CostEstimate>;
  submit(input: VideoInput, idempotencyKey: string): Promise<ProviderJobRef>;
  getStatus(ref: ProviderJobRef): Promise<ProviderJobStatus>;
  fetchResult(ref: ProviderJobRef): Promise<ProviderResult>;
  cancel(ref: ProviderJobRef): Promise<void>;
}
```

Same shape for `ImageProvider`, `VoiceProvider`, `MusicProvider`, `SfxProvider`, `LlmProvider`, `VisionProvider`.

**DECISION:** Provider SDKs, response shapes, prompt dialects, and error codes never escape `providers/`. Everything above sees normalized types and a normalized error taxonomy (`RateLimited`, `ContentRejected`, `ProviderError`, `InvalidRequest`, `Timeout`, `InsufficientProviderCredit`).

### 13.4 Circuit breakers

Per provider, per capability. Open on error-rate or latency threshold, half-open probe on a timer. While open, the router excludes it. If all providers for a capability are open, jobs stay `queued` (not failed) and the user sees a degraded-service notice.

### 13.5 Cost recording

Every provider call records `estimatedCost` and `actualCost`. A persistent gap between them is a routing bug or a stale price table, and it is alerted on.

---

## 14. Consistency engine

This is the actual product. Everything above is plumbing.

### 14.1 Character identity **DECISION**

Text-to-video with a character description does not produce a consistent character. The pipeline is:

```
Character Bible + reference sheet
   -> identity-locked KEYFRAME (image model, reference-conditioned)
   -> keyframe passes identity check (§15.2)
   -> IMAGE-TO-VIDEO from that keyframe
```

**Shots containing a named character are never generated text-to-video.** The keyframe is the identity anchor and the cheap failure point — an image costs cents, a video clip costs dollars.

Each character has a canonical **reference sheet**, generated once and locked on approval: front neutral, three-quarter, profile, full body in default outfit, one expressive frame. Stored as assets, versioned with the character.

**As built (2026-08-31): three views, not five** — front, three-quarter, full
body. The first two carry the face and the third carries build, proportion and
wardrobe, which is what breaks when a scene cuts from a close-up to a wide.
Profile and the expressive frame added least per credit and are not generated;
adding them is one entry in `SHEET_VIEWS`.

Each view is shot against a plain backdrop with no set and no story, because a
reference that bakes in a location anchors that location too, and then every
shot of that character drags a corridor around with it. The sheet is keyed by
the character's version and the style version only — never by the scene that
noticed it was missing — so one sheet serves the whole film.

A keyframe references the **lead** character's three views plus the location
plate (§14.3a). Other characters in the shot are described rather than depicted:
the keyframe is a frame *of* someone, and handing the image model three more
faces to reconcile makes the one that matters worse. Reference bytes travel as
`data:` URIs like the conditioning frame does, so the asset bucket stays private
(§18.2).

A note on why the references go into the *image* model rather than the video
one: OpenRouter's video API documents `frame_images` as winning over
`input_references` when both are present, so a clip cannot condition on a
keyframe *and* carry a character sheet. Identity is therefore decided at the
keyframe, which is also where it is cheapest to get wrong.

### 14.2 Intra-scene continuity

Within a scene, consecutive clips condition on the **last frame of the previous clip** as the first frame. Motion and lighting carry across the cut. Between scenes, a deliberate cut resets.

### 14.3 Continuity state

Structured, not prose. Carried forward at every scene boundary:

```json
{
  "afterScene": 12,
  "characters": {
    "emma": { "outfit": "beige trench coat", "wet": true, "injury": "forehead cut", "holding": ["flashlight"] }
  },
  "world": { "weather": "heavy rain", "timeOfDay": "23:40" },
  "props": { "car": { "location": "hospital parking lot" } }
}
```

Scene N+1 inherits scene N's out-state as its in-state unless the script explicitly breaks it (time jump, location change). The Director may propose changes; the continuity engine records them as deltas so they are auditable.

**As built (2026-08-31).** A scene stores only its *delta*; the state in force
during scene N is every delta from scenes 1..N folded in scene order. There is
no out-state column to keep in step with the deltas that produced it, and the
fold is pure, so the same scene always compiles the same prompt (§16.1). Facts
are `subject -> key -> value`, with `null` meaning "no longer true" rather than
"blank" — the Director sends them as a flat list (`propose_continuity`) because
a map with model-chosen keys cannot be a closed schema (§7).

Continuity is stated to the keyframe, the clip, *and* the location plate. The
plate is the one that is easy to miss: a prop belongs to the place, so a flag
whose markings change is a plate that must be re-shot, and its key moves.

### 14.3a Location anchors **NEW (2026-08-31)**

§14.1 anchors *who* is in frame. Nothing anchored *where*, and in practice that
was the louder failure: two shots of one scene came back with different
architecture, a different ground surface and a flag whose emblem and lettering
were not the same object twice.

So a location gets one establishing plate — wide, no people — generated once and
fed into every keyframe shot there, beside the character sheet.

**It is keyed by the place, not by the scene.** `location.name`, `location.time`,
the style version and the continuity facts standing in it are what the hash is
made of, so scene 3 and scene 11 in the same corridor share one plate instead of
inventing two corridors. A scene id in that key would have re-created the drift
one indirection further away.

**Anchors never use the model or quality the caller named.** §13.2 reserves a
named model for creative choices; an anchor is infrastructure, and a sheet whose
model floated with the request would give one character two faces depending on
which shot happened to ask for it first. Their tier is fixed for the same reason.

Ordering is part of the plan, not a convention: `nextStep` returns every missing
sheet and plate for a scene before it returns any keyframe in it, because a
keyframe generated while its anchor is missing is a face invented once and then
inherited by every shot that conditions on it.

### 14.4 Style anchoring

The Style Bible produces a **style anchor image set** generated once per project. Every subsequent image generation references it. Style drift is measured against the anchor (§15.2), not judged by vibes.

### 14.5 Locks

Users lock approved values. Locks are enforced in the service layer, not the UI.

```
Lock targets: character (whole or per-field), script, scene, shot,
              voice, camera, music, location, style, timeline
```

**DECISION:** A locked field cannot be modified by the Director under any circumstance, including Autopilot. The Director receives a `LOCKED` error and must either work around it or ask the user to unlock. Unlocking is a user action with an audit entry.

---

## 15. Quality inspection

### 15.1 Honest framing **CHANGED**

The earlier draft showed scores like `characterConsistency: 0.94` as if they were readily available measurements. Some of these are genuinely measurable; others are noisy model judgements dressed as numbers. Treating them all as precise produces confident, wrong auto-rejections and burns money on pointless regeneration.

**DECISION:** Every metric declares its class.

| Metric | Method | Class | Use |
|---|---|---|---|
| `identity` | Face/embedding cosine vs canonical reference | **Measured** | Hard gate |
| `styleDrift` | CLIP + palette histogram distance vs style anchor | **Measured** | Hard gate |
| `temporalStability` | Optical-flow discontinuity, frame-diff spikes | **Measured** | Hard gate |
| `technical` | Resolution, fps, duration, black frames, audio presence, loudness | **Measured** | Hard gate |
| `promptAdherence` | VLM rubric against SceneSpec fields | **Judged** | Soft flag |
| `artifacts` | VLM rubric | **Judged** | Soft flag |
| `continuity` | VLM comparison to previous shot's last frame | **Judged** | Soft flag |
| `lipSync` | Alignment score where the provider exposes it | **Heuristic** | Soft flag |

- **Measured** metrics may auto-reject.
- **Judged** metrics may flag for user review and may trigger at most one repair attempt. They may not drive unbounded regeneration.
- Thresholds are **calibrated against a labeled internal set**, not invented. Until that set exists, thresholds are permissive and the system prefers surfacing to the user over auto-retrying.
- Every inspection result and the decision it drove is persisted. That dataset is what makes the thresholds trustworthy later.

### 15.2 Gates

```
Keyframe generated -> identity + style gate  (cheap, strict)
     pass -> video generation
     fail -> regenerate keyframe (max 3, then ask user)

Video generated -> technical + temporal + judged metrics
     pass -> lock asset
     fail -> repair (§15.3)
```

### 15.3 Repair loop

```
Classify failure
  |
  +-- identity drift      -> regenerate from the approved keyframe, stronger reference weight
  +-- style drift         -> re-anchor style refs, regenerate
  +-- artifact/instability-> reroll seed; if 2 rerolls fail, route to a different provider
  +-- prompt adherence    -> recompile prompt with tightened constraints
  +-- content rejection   -> do NOT retry; surface to user with the provider's reason
  |
  v
Re-inspect. Max 2 repair attempts per shot, then hand to the user.
```

**DECISION:** The repair loop has a **hard credit ceiling per shot** in addition to the attempt cap. Reaching either stops and asks. Autonomous loops with a money faucet attached get exactly two chances.

---

## 16. Dependency graph and dirty state

### 16.1 Content hashing

Every derived artifact is keyed by the hash of everything that produced it:

```
assetKey = sha256(canonical_json({
  compilerVersion,
  providerFamily, model, params,
  sceneSpec, characterVersions, locationVersions,
  styleVersion, continuityIn, seed
}))
```

Consequences:

- **Free caching.** A user reverting a change and re-generating gets the existing asset instantly, at zero cost.
- **Free dirty detection.** An artifact is dirty iff its recomputed key differs from its stored key. No manual flag propagation, no missed invalidation.
- **Free reproducibility.** The key names every input; the asset can always be regenerated identically.

This requires the prompt compiler to be pure (§12.2). That is why it is pure.

### 16.2 Graph

```
StyleVersion ---+
                +--> Keyframe --> ShotVideo --+
CharacterVersion+                             +--> SceneCut --> Timeline --> Render --> Publication
Native shot dialogue --------> ShotVideo -----+
External narration / music / SFX ------------------------------> Timeline
```

Edges are explicit rows in `asset_dependencies(asset_id, depends_on_asset_id)`. On any change, recompute keys downstream and mark divergent nodes dirty.

**DECISION:** Only dirty nodes regenerate. Changing background music never re-renders video. Changing a character's face dirties every keyframe and clip containing that character and nothing else. This rule is worth more than any single model choice — it is the difference between a $4 edit and a $60 edit.

---

## 17. Media pipeline

### 17.1 Assembly

FFmpeg, driven by an explicit filtergraph built from the Timeline. No shelling out with user strings — arguments are constructed as arrays, never interpolated into a shell command.

```
Shot clips -> normalize (codec, fps, resolution, color, loudness)
           -> apply transitions
           -> concat
           -> mix audio stems (dialogue / ambience / sfx / music) with ducking
           -> burn or attach captions
           -> encode master (H.264 high, or ProRes for archival tier)
           -> derive platform variants
```

### 17.2 Platform variants

Derived from the master, never regenerated:

| Platform | Aspect | Max duration | Notes |
|---|---|---|---|
| YouTube (long) | 16:9 | — | Full master |
| YouTube Shorts | 9:16 | 60s | Reframe |
| TikTok | 9:16 | per platform | Reframe, safe-area aware |
| Instagram Reels | 9:16 | 90s | Reframe |

**DECISION:** Reframing is a smart-crop driven by shot metadata (subject position is known from the SceneSpec and keyframe), not a center crop and not a re-generation.

### 17.3 Remotion **CHANGED**

The earlier draft listed Remotion alongside FFmpeg without deciding when each applies. Remotion renders by driving headless Chrome frame by frame. For a 10-minute video that is dramatically slower and more expensive than FFmpeg, and it introduces a browser into the render worker image.

**DECISION:** FFmpeg only in the core render path. Captions via subtitle filters, lower-thirds and simple overlays via `drawtext`/`overlay`. Remotion is reconsidered only if a genuine motion-graphics/templating feature is scoped, and if so it renders **overlay layers only**, composited by FFmpeg — never the full timeline.

### 17.4 Render workers

- Dedicated hosts. CPU-bound; sized by core count.
- Concurrency = `cores / threads_per_job`, never unbounded.
- Bounded local scratch with a disk-usage guard; a job that would exceed the guard fails before starting rather than filling the disk.
- Progress is parsed from FFmpeg output and emitted as throttled progress events.
- **Deterministic:** same timeline + same inputs -> same output. Encoder settings are pinned, FFmpeg version pinned in the image.
- Renders are chunked by scene with intermediate concat, so a failure at minute 9 does not discard minutes 1–8.

---

## 18. Storage

### 18.1 Layout

```
r2://reevera-assets/
  {userId}/{projectId}/
    refs/{characterId}/{versionHash}.png
    keyframes/{shotId}/{assetKey}.png
    clips/{shotId}/{assetKey}.mp4
    audio/{kind}/{assetKey}.wav
    renders/{renderId}/{variant}.mp4
    thumbs/{...}
```

Content-addressed filenames. Never overwritten; a new version is a new key.

### 18.2 Access

**DECISION:** Buckets are private. All access is via short-lived signed URLs issued by the API (5 minutes for preview, 15 minutes for download) after an ownership check. Storage credentials never reach the browser. Public URLs are issued only for a deliberately published render.

### 18.3 Lifecycle and quotas

Video is the dominant storage cost and it accumulates silently.

**DECISION:**

| Class | Retention |
|---|---|
| Rejected/failed generation outputs | 7 days |
| Superseded intermediate versions (not current, not locked) | 30 days |
| Current assets of an active project | While project is active |
| Final renders | Per plan (Starter 30d, Creator 1y, Studio indefinite) |
| Deleted project | **CHANGED (2026-08-30):** deleted outright, no window — see below |
| Refresh tokens, expired | Deleted — an expired token can never validate again |
| Refresh tokens, revoked | 24 h grace, then deleted — the family is already dead |
| Refresh tokens, used but unexpired | **Kept until expiry.** This row is what makes a stolen token's replay detectable (§7.2); deleting it early trades reuse detection for disk |
| Email verification codes | 24 h past expiry |

- Per-user storage quota by plan, enforced before generation. Exceeding it blocks new generation with a clear message, never a silent failure.
- Retention runs in `scheduler` and is idempotent.
- Row deletion is **batched and capped** per sweep (`ctid IN (… LIMIT n)`), so a
  backlog drains across ticks instead of holding a long lock on a table the login
  path writes to. Every retention predicate must be index-backed — verify the plan,
  do not assume it.
- Hard delete purges objects, then rows, and writes an audit entry. A deletion that fails at the object stage retries; it does not leave orphaned billing-relevant data.

**DECISION — CHANGED (2026-08-30): a deleted project is deleted.** The earlier
rule was a soft delete plus a 30-day purge sweep. The sweep was never written,
so in practice "delete" meant the row was hidden and everything under it —
scenes, shots, characters, the Director thread — stayed in the database forever.
Rather than write the sweep, the window is removed: `DELETE /projects/:id`
deletes the row, and every table that references a project cascades in the same
transaction. `projects.deleted_at` is dropped.

What this trades: there is no undo. The confirmation in the editor is the only
thing between a click and the data, which is why it names the project. Revisit
if a customer ever asks for a recycle bin — but a 30-day window that no sweep
ever emptied was not that feature either.

**`model_runs` is the exception** and detaches (`on delete set null`) rather than
cascading. §19.1 reconciles the ledger and §28.3 reports margin over time; if
deleting a project deleted what it cost, both would develop holes with nothing
left to explain them. The surviving row is grouped by owner.

---

## 19. Billing

### 19.1 Ledger **DECISION — CHANGED (2026-08-30)**

**One credit currency, no pools.** The earlier two-pool model (standard for
Seedance-class, premium for Kling/Veo-class, no conversion between them) is
superseded. It made the price of a generation depend on which bucket the router
happened to pick, and it forced every screen, every ledger row and every
reservation to carry a pool alongside the number. One currency is what a user can
actually reason about: a balance, and a price per request.

**One credit is $1/35.** A dollar buys 35 credits, whether it arrives as a
subscription or as a top-up. What a request costs is not a table of rates — it is
computed from the provider's own bill:

```
credits charged = provider_usd × 1.6 × 35
```

The 1.6 is the 60% margin and it lives in exactly one place (`models.json`).
`models.json` therefore records only USD — what the provider charges us — and
never a second, hand-maintained credit rate that could drift from it.

**Amounts are integer micro-credits.** Floats still have no business near money,
but a whole credit is ~2.9 cents and a small Director turn costs well under that;
rounding every one up to a credit would bill a fifth of a cent as three. The
ledger and the balance store `credits × 1_000_000` as integers, and only the
display layer divides.

Credits are an **append-only ledger**. There is no mutable "balance" column that code updates.

```sql
credit_ledger(
  id uuid pk,
  user_id uuid not null,
  kind text not null,        -- purchase | charge | refund | bonus | subscription_grant | expiry | adjustment
  amount bigint not null,    -- signed, integer micro-credits, never floats
  balance_after bigint not null,
  reference_type text, reference_id uuid,
  idempotency_key text,
  created_at timestamptz not null
)
unique (user_id, idempotency_key) where idempotency_key is not null
```

`user_credit_balance(user_id, available bigint, granted_this_cycle bigint, version int)` — one materialized row per user — is updated in the same transaction as the ledger insert, under `SELECT ... FOR UPDATE`. A periodic job recomputes it from the ledger and alerts on any drift. Drift is a data-integrity incident, not a rounding issue.

### 19.2 Spending **DECISION — CHANGED (2026-08-30)**

**Reservations are gone.** The earlier flow held an estimate before a request and
settled it afterwards. It cost two transactions per request, needed a stale-hold
sweep in the scheduler, and required an estimator accurate enough that a hold was
neither a lie nor a lock-out. Replaced by:

```
before a request:  balance > 0 ?  no -> 402 INSUFFICIENT_CREDITS, nothing runs
after a request:   charge provider_usd × 1.6 × 35, whatever it came to
```

One indexed read and one transaction. No estimator, no hold, no sweep.

**A balance may go negative, and that is the deliberate part.** A request admitted
with 0.1 credits left that turns out to cost 0.2 leaves the user at −0.1. The
charge is not capped at the balance — capping would make the last request before
empty partly free, which is a hole worth as much as the most expensive single
generation we sell. The overshoot is carried as debt:

- the next request is refused while the balance is ≤ 0;
- the next top-up adds to it, so the debt is paid down before anything is
  spendable again;
- the next renewal grants on top of it (§19.6), so the allowance arrives minus
  what was owed.

**What this trades away.** A hold gave a concurrency guarantee this does not: N
requests admitted at the same instant can each pass the positive check and each
charge, so the debt can reach N times one request's cost. It is bounded by the
per-user request rate limit (§8.6) and by turns being serialized per project —
not by the billing layer. That is an accepted risk, taken for the simplicity.

### 19.3 Estimation

**REMOVED (2026-08-30).** Nothing estimates a cost before spending it any more.
A request is admitted on a balance, not on a forecast, and the price it pays is
the provider's own bill.

### 19.4 Spend controls

Four independent limits, all required:

1. **Per-shot ceiling** — max credits for one shot including repairs.
2. **Per-project ceiling** — user-visible budget; hitting it pauses and asks.
3. **Per-user hourly commit cap** — anti-runaway.
4. **Global platform spend circuit breaker** — a hard daily provider-spend ceiling that halts generation and pages a human.

Limit 4 exists because the failure mode of an autonomous system with API keys is a five-figure bill overnight.

### 19.5 Customer provider keys — REMOVED (2026-09-02)

Reevera does not accept customer-supplied provider keys. All generation runs through
Reevera-managed provider credentials and the normal credit ledger; there is no
customer-key path, separate provider-currency budget, or orchestration-fee exception.

### 19.6 Plans and pricing — **DECISION — CHANGED (2026-08-30)**

Payment provider: Lemon Squeezy. Three plans, billed monthly, **plus pay-as-you-go
top-ups**. The two-pool allowance of the earlier draft is superseded by §19.1's
single currency, and the allowance is no longer a number written down here — it is
derived from the price, so raising a plan's price raises what it grants:

```
allowance = price_usd × 35 credits
```

| | Starter — $29/mo | Creator — $99/mo | Studio — $299/mo |
|---|---|---|---|
| Credits / cycle | 1,015 | 3,465 | 10,465 |
| Max finished video | 1 min | 5 min | 12 min |
| Export | 720p | 1080p | 1080p / best available |
| Voice | ElevenLabs | ElevenLabs premium | ElevenLabs premium |
| Consistency / scenes | Basic | Character + style, auto transitions | Advanced, brand presets, custom characters/voices |
| Publishing | Social-ready exports | YouTube, TikTok, Instagram | YouTube, TikTok, Instagram |
| Render queue | Standard | Priority | Fastest |
| Commercial usage | — | — | Included |

Rules:

- **Credits buy provider cost at 1.6×** (§19.1). What a second of video or a
  thousand characters of speech costs is therefore not fixed here — it follows the
  price table, and a cheaper model buys the user more. The earlier "1 generated
  second = 1 credit" rule is gone with the pools; it could not hold at 60% margin
  against any video model we route to.
- **Top-ups.** `POST /credits/checkout` takes either a plan or `topUpUsd`
  ($5–$1000). A top-up is a pay-what-you-want Lemon Squeezy variant, and the
  credits granted come from what the store actually charged — never from the
  checkout request, which is the one number a client could otherwise inflate.
- **Entitlements are enforced server-side.** Max duration and export resolution
  are validated at render submission against the plan, not trusted from the client.
- **Monthly reset on billing anniversary.** Unused credits do not roll over —
  including purchased ones, since there is one balance and no way to tell them
  apart. A positive balance is zeroed by a visible `expiry` row before the new
  allowance lands; a negative one is carried (§19.2). **OPEN:** whether topped-up
  credits should survive a renewal is worth revisiting once anyone has bought
  some. It needs a second balance bucket, which is why it is not built.
- **Regeneration and discarded scenes consume credits** (§16 makes an identical
  regeneration a cache hit — free — but any changed input is a new charge).
- **Long-form gating stays.** Selling 5/12-minute durations on Creator/Studio does
  not remove §2.3: projects above 10 minutes still require the explicit continuity
  acknowledgement before spend.
- Duration above plan cap requires plan upgrade, not a toggle. The target is a
  project setting the user picks from a fixed list (30/60/120/180/300/600/720
  s). The editor shows lengths above the plan's cap disabled rather than hiding
  them, and `PATCH /projects/:id` rejects one above the cap with `403 PLAN_LIMIT`.
  The client's greying-out is a courtesy; the write-time check is the control.

### 19.7 Subscription lifecycle (Lemon Squeezy)

Payment webhooks follow the provider-webhook rules (§10.3): signature verified, raw event persisted, deduplicated on LS event id, processed in a job — never inline.

- **Activation:** LS `subscription_created`/`payment_success` → `subscription_grant`, idempotent on the LS event id.
- **Top-up:** LS `order_created` on the top-up variant, `status: paid` → `purchase`
  for `total × 35 / 100` credits. An order for a plan variant is ignored here — the
  subscription events already granted for it.
- **Renewal:** same grant flow; scheduler expires prior-cycle remainder first (§19.6).
- **Dunning:** LS owns retries. On final failure (`subscription_expired`, `subscription_payment_failed` after its retry schedule): plan drops to lapsed at period end. Already-granted credits remain spendable (§24 degradation); no new grant.
- **Upgrade:** immediate. LS prorates the charge; the new cycle's allowance is granted pro-rated, not as a full second grant.
- **Downgrade:** applies at next renewal. Entitlements (resolution, duration cap) clamp at renewal, not retroactively — in-flight renders finish under the old plan.
- **Refund:** admin-initiated (§28.4) or chargeback. Writes a `refund` ledger entry reversing the purchase; already-consumed credits are not clawed back (balance floors at zero). Render retention is re-evaluated against the new plan (§18.3).
**NEW (2026-08-29) — where an event is applied.** The webhook route verifies the
signature, stores the raw delivery, and enqueues `payments`. The job runs in the
`scheduler` process (§4.1) and is idempotent on the ledger key derived from the
delivery, so a redelivery grants nothing twice. Lemon Squeezy sends no event id,
so the delivery is keyed by the SHA-256 of its body — a redelivery is
byte-identical and two distinct events never are. A delivery the queue never
received is picked up by the same sweep that handles the rest of §10.4.

**NEW (2026-08-29) — cycle grants set, they do not add.** `subscription_created`
and a `renewal` invoice expire the remainder and grant the plan's allowance. An
`initial` or `updated` invoice grants nothing: the subscription event that
accompanies it already did. A mid-cycle upgrade grants at the new plan; a
downgrade is stored on `subscriptions.pending_plan` and applies at renewal, which
is what "downgrade applies at next renewal" above requires.

- **Reconciliation:** daily job matches every LS payment and refund against ledger `purchase`/`subscription_grant`/`refund` entries. An unmatched row in either direction pages a human — same severity as ledger drift (§19.1). LS is the source of truth for money; the ledger is the source of truth for credits.

---

## 20. Trust and safety

**This section is a launch blocker, not a v2 nicety.** An autonomous system that generates video of people and publishes it to public platforms under a user's account has a specific, well-understood set of ways to cause serious harm. The earlier draft did not address it at all.

### 20.1 Gates

Moderation runs at three points. Each writes a `ModerationDecision`.

1. **Input gate** — on idea, script, character descriptions, and uploaded reference images. Runs before any spend.
2. **Pre-generation gate** — on compiled prompts, after the Director has expanded the user's intent (the Director can introduce content the user did not write).
3. **Output gate** — on generated keyframes and, sampled, on video frames. Always on any asset headed for publication.

### 20.2 Policy

Prohibited, hard-blocked, no override:

- Sexual content involving minors, or any sexualized depiction of a person who appears to be a minor. Uploaded references depicting minors are rejected outright.
- Non-consensual intimate imagery.
- Real identifiable people without a verified consent/rights basis — this covers uploaded photos of third parties, public figures, and likeness-matching prompts.
- Content depicting real people saying or doing things they did not (political figures especially).
- Instructional content for violence, weapons, or serious self-harm.

Gated (allowed with friction — user attestation, watermarking, publish restrictions):

- Uploaded reference photos of the user themselves (identity attestation required).
- Brand/trademark elements.
- Graphic but non-instructional violence for fiction.

### 20.3 Likeness and provenance

- Any uploaded human reference image requires an explicit rights attestation, logged with timestamp and IP.
- **DECISION:** All output carries C2PA content credentials marking it AI-generated, plus an invisible watermark where the encoder allows. This is increasingly required by platform policy and by law in several jurisdictions; retrofitting it later means re-rendering the entire back catalogue.
- Publishing adapters set each platform's AI-generated content disclosure flag. Not optional, not user-toggleable.

### 20.4 Enforcement

- Moderation blocks are per-user rate-limited; repeated hard-category attempts escalate to account review.
- A hard-category block is never explained in detail to the user (no roadmap for circumvention) and is always logged in full internally.
- An appeal path exists for gated-category false positives.

---

## 21. Social publishing

### 21.1 Adapter

```ts
interface SocialPublisher {
  readonly platform: Platform;
  readonly constraints: PlatformConstraints;   // aspect, duration, size, codec, title/desc limits
  validate(render: Render, meta: PublishMeta): ValidationResult;
  upload(render: Render, meta: PublishMeta, idem: string): Promise<PlatformRef>;
  getStatus(ref: PlatformRef): Promise<PublishStatus>;
  delete(ref: PlatformRef): Promise<void>;
}
```

Validation runs **before** upload. Uploading a 90-second video to a 60-second slot and failing at 95% is avoidable.

### 21.2 Platform realities **OPEN — verify current terms before building each adapter**

These are not implementation details; they determine whether a feature is shippable:

- **YouTube Data API** has a hard daily quota; a video upload is expensive in quota units. Quota is per-project, not per-user, so **quota is a shared platform resource that must be scheduled and budgeted**, with per-user fair-share allocation in `worker:publish`.
- **TikTok** direct-publish requires an approved app and audited scopes; unapproved apps are limited to draft upload. Design for "upload as draft, user confirms in app" as the baseline path.
- **Instagram** publishing requires a Business/Creator account via the Graph API and has its own publishing rate limits.
- All three have AI-generated content disclosure requirements (§20.3).

**DECISION:** Publishing degrades gracefully. If direct publish is unavailable, the product delivers the platform-ready file plus generated metadata for manual upload. The pipeline's value does not depend on holding a publish token.

### 21.3 Tokens

Encrypted at rest (envelope encryption, same as §19.5). Proactive refresh before expiry via `scheduler`. Refresh failure marks the account `needs_reauth`, notifies the user, and pauses scheduled publications for that account rather than failing them silently.

---

## 22. Security

Baseline, all mandatory:

- TLS only; HSTS; secure cookie flags.
- Argon2id password hashing (§7.2).
- Envelope encryption for all provider keys and OAuth tokens. Master key in a KMS or secrets manager, never in the repo, never in an env var checked into anything.
- Schema validation on every input (§8.4); allowlist only.
- Signed, short-lived storage URLs (§18.2). No public buckets.
- Webhook signature verification (§10.3).
- FFmpeg and any subprocess invoked with argument arrays. No shell interpolation, ever.
- Uploaded media validated by magic bytes, re-encoded before use, stripped of EXIF.
- SSRF protection on any URL the system fetches (provider results included): allowlisted hosts, no private IP ranges, no redirects to private ranges.
- Rate limiting on auth endpoints; generic error messages on login (no user enumeration).
- **MFA (TOTP):** available to all users, mandatory for `admin`/`owner` (§7.4). Recovery codes single-use, stored hashed.
- **CSRF:** the refresh cookie is `SameSite=Lax` and mutations are JSON-only POST/PATCH/DELETE with an `Origin`/`Referer` check on cookie-authenticated routes. No form-encoded mutation endpoints exist.
- **Account lockout:** exponential backoff on repeated login failures, per-account and per-IP. Lockout presents as a generic delay — it never confirms whether the account exists.
- **Data export and deletion (GDPR):** `GET /api/v1/account/export` returns a machine-readable archive of all owned entities; `DELETE /api/v1/account` triggers the §18.3 purge workflow plus PII scrub. Both audited; deletion requires re-authentication and a cooling-off period. **NEW (2026-08-29):** re-authentication is the account's password where it has one, and a session started within the last 10 minutes where it does not (a provider-only account has nothing to re-enter). The cooling-off window is 7 days, during which the account keeps working: `DELETE /api/v1/account/deletion` cancels it, and so does any fresh sign-in. **The window is waivable** — `DELETE /api/v1/account` with `immediate: true` purges on the spot. The window exists to catch a mis-click; a user who re-authenticates and asks a second time has not mis-clicked, and holding their data against their stated wish is the wrong default under GDPR. Both paths run the same re-authentication check, in one function, so there is no way to delete that skips it. The `scheduler` purges accounts past the window; feedback and audit rows survive with a null author, which is the point of scrubbing the person rather than the record.
- Audit log for auth events, billing, key management, publishing, unlocks, deletions.
- Dependency scanning in CI; pinned lockfiles; pinned base images.
- Secrets rotation procedure documented and rehearsed.

---

## 23. Observability

### 23.1 Tracing

**DECISION:** OpenTelemetry, with trace context propagated **through queue messages**. A single user action spanning API -> director -> queue -> provider -> webhook -> inspection -> render must be one trace. Without this, debugging a stuck project is guesswork.

### 23.2 Structured logging

Every log line carries: `timestamp, level, service, traceId, spanId, userId, projectId, jobId, event, durationMs, error`. JSON. No PII in logs — no prompts containing user content in plaintext logs; reference the `ModelRun` row instead.

### 23.3 Metrics

Technical: request latency (p50/p95/p99), error rate by code, queue depth and age by queue, job duration by type, lease expiries, reconciliation actions, provider latency/error/timeout rate by provider, circuit-breaker state, render duration per output minute, SSE connections, storage bytes by class.

Product/economic: generation success rate first-attempt vs after repair, repair rate by failure class, credits estimated vs charged, **gross margin per project**, cost per finished minute, cache hit rate on content hashes, moderation block rate by category, publish success rate by platform.

**Cost per finished minute** and **cache hit rate** are the two numbers that determine whether this business works. Instrument them on day one.

### 23.4 Alerts

Page a human for: global spend breaker tripped, ledger drift detected, all providers open for a capability, queue age above threshold, render worker disk guard tripped, auth anomaly (refresh-token reuse spike), webhook signature failures spiking, payment webhook failures.

### 23.5 SLOs

| Concern | Target |
|---|---|
| API availability | 99.9% |
| API p95 latency (non-generation) | < 300 ms |
| Job pickup latency p95 | < 10 s |
| Generation job success (incl. repair) | > 95% |
| Ledger correctness | 100%, any drift is an incident |

---

## 24. Reliability

- **Backups:** Postgres continuous archiving with PITR, ≥ 14 days. Restore is **tested on a schedule**; an untested backup is not a backup.
- **Storage:** versioning enabled; lifecycle rules per §18.3; cross-region replication for final renders only (cost).
- **Redis:** treated as ephemeral. Losing Redis loses in-flight queue state, not truth. Recovery is reconciliation (§10.4) rebuilding jobs from Postgres. **DECISION:** the system must survive a full Redis wipe with no data loss and no lost credits. Test this.
- **Degradation modes:**
  - LLM down -> manual editing works, generation of already-specified scenes works.
  - One video provider down -> router excludes it.
  - All video providers down -> jobs queue, users notified, nothing fails.
  - Storage down -> read-only; no generation accepted.
  - Payment provider down -> existing credits still spendable.
- **Kill switches** (config-flag, no deploy): global generation pause, per-provider disable, publishing pause, new-signup pause, autopilot disable. Surfaced as confirm-gated admin toggles (§28.4); the config flag remains the source of truth.

---

## 25. Environments and deployment

| Env | Purpose |
|---|---|
| `local` | Docker Compose; providers stubbed by default |
| `staging` | Production-shaped; real providers on a capped budget; separate storage bucket and DB |
| `production` | — |

**DECISION:**
- All services containerized. FFmpeg version pinned in the worker image.
- Migrations run as a separate, gated step before deploy. Forward-only. Expand/contract for breaking changes: add column -> backfill -> dual-write -> switch reads -> drop, across releases.
- Zero-downtime deploys for `api`/`sse`. Workers drain: stop accepting, finish or release in-flight leases, exit.
- Config from environment; validated against a schema at boot. **A missing or malformed required config fails startup loudly.** No silent defaults for anything security- or money-related.
- No provider key, no secret, no bucket credential is ever present in frontend bundles. CI fails on detection.

### 25.1 Deployment shape

Start:

```
Host A: nginx + api + sse            (small)
Host B: workers (director/media/inspect/publish) + scheduler
Host C: render workers               (high CPU)
Managed Postgres, managed Redis, R2
```

Scale triggers — act when the metric crosses, not on a schedule:

| Trigger | Action |
|---|---|
| Render queue age p95 > 5 min | Add render hosts |
| API p95 > 300 ms | Add API instances |
| DB CPU > 70% sustained | Read replica for analytics/list queries |
| Redis memory > 70% | Scale Redis; audit retained job data |
| Storage growth > forecast | Tighten retention (§18.3) before buying capacity |

---

## 26. Testing

`AGENTS.md` §10 governs style. This defines what must be covered.

**DECISION — these have dedicated test suites and are not shippable without them:**

| Area | Must prove |
|---|---|
| Credit ledger | Positive-balance admission; actual charges reconcile across success/fail/cancel/timeout/crash; ledger sums to materialized balance |
| Idempotency | Duplicate key replays; different hash rejects; concurrent same-key is safe |
| Authorization | Cross-user access is impossible on every route; worker `*Unsafe` paths are only reachable with pre-resolved ownership |
| Admin surface | Role guard on every admin route; credit adjustments are idempotent ledger entries with audit; impersonation is time-boxed and notified; admin cannot read OAuth secrets |
| Subscription lifecycle | Duplicate LS events grant once; refund never drives a balance negative; cycle rollover expires unspent allowance; entitlements clamp on downgrade |
| Input validation | Every limit in §8.4 enforced; unknown fields rejected; no partial side effects on rejection |
| Locks | No Director path can mutate a locked field, including Autopilot |
| Content hashing | Compiler purity: same inputs -> identical hash across processes and restarts |
| Dirty-state propagation | Each edit type dirties exactly the right nodes and no others |
| Job state machine | Illegal transitions rejected; out-of-order webhooks handled; lease expiry requeues; cancellation propagates |
| Prompt compiler | Golden-file tests per provider; snapshot diffs reviewed, never blindly updated |
| Moderation gates | Hard-category inputs blocked at every one of the three gates |
| FFmpeg assembly | Deterministic output hash for a fixed timeline; duration/codec/loudness assertions |
| Reconciliation | Redis wipe -> full recovery, no lost credits, no orphaned reservations |

**Provider calls are mocked** in all automated tests. A nightly, budget-capped smoke suite exercises one real generation per provider and reports cost and latency into the metrics that drive routing.

Per `AGENTS.md` §11: any test that starts a server stops it in teardown, verified. No background process survives a test run.

---

## 27. Code organization

```
reevera/
  apps/
    web-marketing/          static HTML/CSS/JS
    web-app/                React + TS SPA
    api/                    Fastify HTTP service
    sse/                    Fastify SSE service
    workers/
      director/ media/ inspect/ render/ publish/ scheduler/
  packages/
    domain/                 entities, invariants, pure business rules — no I/O
    schemas/                TypeBox schemas, shared client/server types
    db/                     migrations, repositories, transaction helpers
    queue/                  BullMQ setup, job contracts, lease helpers
    providers/              adapters + normalized errors (video/image/audio/llm/vision/social)
    compiler/               prompt compiler (pure)
    consistency/            character/style/world/continuity engines
    inspection/             metrics + gates
    media/                  ffmpeg command building, timeline -> filtergraph
    storage/                object store port + local-disk and S3 backends (§18)
    billing/                ledger, reservations, pricing
    moderation/             gates and policy
    observability/          otel, logging, metrics
  infra/
```

### 27.1 Layering

```
Route (HTTP shape, schema)
  -> Controller (auth, idempotency, request/response mapping)
    -> Service (business logic, transactions, orchestration)
      -> Repository | Provider | Queue | Storage
```

**DECISION:**
- Business logic never lives in a route handler.
- `packages/domain` and `packages/compiler` have **no I/O and no side effects**. They are unit-testable without a database.
- Providers are imported only by `packages/providers` consumers in the service layer — never by routes, never by the domain.
- A file never exceeds 1000 lines (`AGENTS.md` §2). If a service approaches it, the service is doing too much.

---

## 28. Admin and operations

Admin is a first-class surface, not an afterthought. The economics of this product (§23.3: cost per finished minute, gross margin) are only visible somewhere, and that somewhere is admin.

### 28.1 What admin is

- A **role** on the existing `User` account (§7.4) — no separate admin user table, no separate auth service. Same tokens, shorter refresh lifetime.
- All admin functionality is API-first (`/api/v1/admin/*`, §8.2) with the same contract discipline as user routes: TypeBox schemas, cursor pagination, the §8.5 error shape, rate limits. An internal UI, when built, is a consumer of these routes — never a parallel path with its own queries.
- Admin routes are excluded from OpenAPI exposure in the public docs.

### 28.2 User and project views

- **User detail:** profile, plan and subscription state, one credit balance and ledger, lifetime spend, moderation history, connected social accounts (masked), active jobs.
- **Project cost view (cost per video):** itemized from existing rows — every `ModelRun` with provider, model, estimated vs actual cost; render compute; storage bytes attributable to the project. No new bookkeeping; this is a read model over §13.5 and §19.
- **Cost per finished minute:** provider + render cost divided by finished output duration from completed renders. The §23.3 number, per project and per plan.
- **Gross margin per project / per plan:** credits consumed (at plan price) minus provider cost. Aggregate by plan to see which tier actually makes money.

### 28.3 Finance and platform health

- MRR, churn, and payment failures — sourced from Lemon Squeezy via its API, reconciled against the ledger daily (§19.7).
- Provider spend by provider/capability/day against the global spend breaker budget (§19.4).
- Cache hit rate, repair rate by failure class, moderation block rate — the product/economic metrics of §23.3, charted.

### 28.4 Operational actions

| Action | Guardrails |
|---|---|
| Credit adjustment (`bonus`/`adjustment` ledger entries) | Reason mandatory (min 20 chars), amount cap per action, always audited; shows in the user's ledger with an `admin` reference |
| Refund | Routes through Lemon Squeezy; ledger `refund` entry per §19.7 |
| Suspension / ban | Blocks login and pauses jobs; running jobs drain; user notified |
| Moderation appeal resolution | Reads the full internal `ModerationDecision`; uphold or overturn, with written rationale |
| Kill switches | The §24 config flags surfaced as confirm-gated toggles; state change is audited and takes effect without deploy |
| Impersonation | Time-boxed (60 min max), requires target-account reason entry, banner shown to the admin, user notified by email, fully audited. Cannot impersonate another admin/owner |

**Admin can never:** read OAuth tokens (masked hints only), read raw prompt content outside a moderation investigation, or bypass the ledger — credit changes are ledger entries, full stop.

---

## 29. Build order

Each phase ends in something that works end to end. No phase is "infrastructure only."

**Phase 1 — Spine.** Auth, projects, Postgres schema + versioning, credit ledger + reservation, job system with leases and reconciliation, one image provider, one video provider, SSE, storage, moderation input gate. Deliverable: idea -> one scene -> one keyframe -> one clip, correctly billed, fully observable.

**Phase 2 — Director and consistency.** Director with tools, SceneSpec, prompt compiler, content hashing, character bible + reference sheets, keyframe-to-video pipeline, locks. Deliverable: a coherent 30-second single-character scene with a consistent character.

**Phase 3 — Production.** Voice with duration-driven shot timing, multi-scene continuity, inspection + repair, timeline, FFmpeg render, captions. Deliverable: a finished 60–90 second video.

**Phase 4 — Distribution.** Music/SFX, platform variants, publishing adapters, provenance/disclosure, billing UI and checkout, and the minimum admin surface (§28): user lookup, credit adjustment, kill switches, finance summary. Deliverable: published video.

**Phase 5 — Scale.** Multi-provider routing with live cost/latency feedback, autopilot channels, team accounts, 4K, templates.

**DECISION:** Audio uses a hybrid route. Visible, lip-synced character dialogue is stored on the shot and generated natively with the video model. Narration, off-screen voice, music, ambience, and SFX are independent external stems aligned to scene, shot, or transition anchors. External voice is generated before final assembly so its measured duration can validate or adjust the cue and timeline; native dialogue is never duplicated as an external stem.

---

## 30. Open questions

Do not resolve these in code without asking.

1. **Inspection threshold calibration** (§15.1). Requires a labeled internal dataset. Until it exists, thresholds stay permissive.
2. **Lip-sync approach.** Provider-native vs a dedicated lip-sync pass over generated video. Affects the shot pipeline order.
3. **Long-form continuity ceiling — RESOLVED (2026-09-02).** Sold caps: Starter 1 min, Creator 5 min, Studio 12 min. The §2.3 experimental-continuity acknowledgement still gates projects above 10 minutes.
4. **What an image costs — RESOLVED (2026-08-30).** With one currency and a price derived from provider cost (§19.1), an image costs what the image model charged us plus the margin, exactly like a video second or a thousand characters of speech.

---

## 31. Changing this document

- An amendment is a PR that edits this file, states what changed and why, and lists the code affected.
- DECISION entries may be reversed. They may not be quietly ignored.
- If implementation diverges from this document, either the code is wrong or the document is stale. Both are bugs. Fix one of them in the same PR.
- OPEN items are resolved by adding a DECISION with the reasoning that settled it, not by silently deleting the question.
