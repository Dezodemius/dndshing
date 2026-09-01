# Security Report

Living document — one section per security-audit task in the BACKLOG chain
(DND-081 → DND-083 → DND-084). Each task appends its section; earlier
sections are not rewritten by later tasks.

## IDOR (DND-081)

**Scope:** ownership checks on every resource a user can reach by numeric ID
or share/invite code — character, campaign, merchant, inventory entry, and
the shop purchase/sale flow (CLAUDE.md rule 7).

### Methodology

For every router in `app/{characters,campaigns,merchants}` and the shop
endpoints in `app/merchants/router.py`:

1. Confirmed the acting user's identity is taken only from
   `Depends(get_verified_user)` / `Depends(get_admin_user)`
   (`app/auth/dependencies.py`), which resolves the user solely from the
   `sub` claim of a validated JWT — never from a path/query/body parameter.
2. Traced every router handler that accepts a resource ID (`character_id`,
   `entry_id`, `campaign_id`, `merchant_id`, `mi_id`, `share_code`) down to
   its `service.py` method and checked that the method scopes its query by
   the caller's `user_id` (or, for nested resources, first loads the parent
   through an ownership-checked call and then verifies the child's foreign
   key matches the parent).
3. Checked that "not found" is the response for both a nonexistent ID and an
   ID owned by someone else, so resource existence can't be probed
   (`CharacterNotFoundError`, `CampaignNotFoundError`, `MerchantNotFoundError`,
   `InventoryEntryNotFoundError`, `MerchantItemNotFoundError` are all 404).
4. Cross-checked findings against the existing test suite
   (`tests/test_character_api.py`, `tests/test_inventory_api.py`,
   `tests/test_spells_api.py`, `tests/test_level_up.py`,
   `tests/test_level_rollback.py`, `tests/test_campaign_api.py`,
   `tests/test_merchant_api.py`, `tests/test_shop_api.py`), which already
   carry a `test_*_other_users_*_is_404` / `test_*_belonging_to_another_*`
   case for essentially every mutating and read endpoint below.

### Resources audited

| Resource | Ownership check | Where |
|---|---|---|
| Character (CRUD, level-up, rollback, history, spells) | `CharacterService.get_owned` — 404 unless `Character.user_id == user_id` | `app/characters/service.py` |
| Inventory entry | `CharacterService._get_owned_inventory_entry` — owns the parent character *and* `entry.character_id == character_id` (blocks cross-character entry-ID guessing) | `app/characters/service.py` |
| Campaign (CRUD, invite regen) | `CampaignService.get_owned` — 404 unless `Campaign.dm_user_id == user_id` | `app/campaigns/service.py` |
| Campaign join | Requires the joining character to already pass `CharacterService.get_owned` for the caller before it can be linked | `CampaignService.join` |
| Campaign kick / leave | DM of the campaign, **or** the owner of the character being removed (checked via `CharacterService.get_owned`) — anyone else gets `campaign_not_found` | `CampaignService.remove_character` |
| DM read-only character view | Requires caller to be `dm_user_id` of the campaign (`campaign_dm_access_required` otherwise) *and* the character to have an active `CampaignCharacter` membership row (`campaign_character_not_found` otherwise) before delegating to the ownership-check-free `CharacterService.get_detail_by_id` | `CampaignService.get_character_for_dm` |
| Merchant (CRUD) + merchant item positions | `MerchantService.get_owned` / `_get_owned_item` — same owner-scoped-404 + parent/child FK match pattern as inventory | `app/merchants/service.py` |
| Shop purchase | Character ownership re-verified inside the purchase transaction (`characters.get_owned(..., for_update=True)`); a foreign `character_id` maps to the shop-specific `not_your_character` (404) rather than leaking the generic character error | `MerchantService.buy` → `CharacterService.apply_purchase` |
| Shop sale | Same pattern as purchase, plus the inventory entry is re-checked against the (now confirmed-owned) character inside `CharacterService.apply_sale` | `MerchantService.sell` → `CharacterService.apply_sale` |
| Shop browsing (`GET /shop/{code}`) | Intentionally unauthenticated by design (BR §4.5) — read-only, no user-scoped data | `MerchantService.get_shop` |
| Content read endpoints (`/content/*`) | No per-user ownership — global reference data, correctly gated only by `get_verified_user` (any logged-in user) | `app/content/router.py` |
| Content import | No API endpoint at all — content enters only from the pack file at startup or through the Basic-auth admin panel (`/internal/admin/content-import`, out of OpenAPI, same-origin-checked, rate-limited) | `app/content/pack_loader.py`, `app/content/admin_panel.py` |

### Findings

No IDOR vulnerabilities found. Every service method that takes a
caller-supplied resource ID scopes its lookup by the authenticated user
(directly, or transitively through an already-ownership-checked parent), and
every router derives that user exclusively from the JWT — none accept a
`user_id`/`character_id`-as-truth from the request body or query string.
Money-affecting flows (purchase, sale) additionally hold row locks
(`SELECT ... FOR UPDATE`) on both the owned character and the target
row before mutating, so the ownership check can't be raced.

The existing test suite already asserts the "owned by someone else → 404"
contract for essentially every endpoint listed above; no gaps were found
that needed new tests. No fixes were required in this PR and no
`security`-labeled follow-up issues were filed.

### Out of scope for this task

JWT lifetime/rotation, rate-limiting, security headers, and secret handling
are covered by the follow-up tasks in this chain (DND-083, DND-084) and are
not assessed here.

## JWT и rate-limit (DND-083)

**Scope:** access token lifetime, refresh token rotation, and rate-limiting
on `/auth/*` and `/buy`.

### JWT

- **Access token lifetime:** 15 minutes (`Settings.jwt_access_expire_minutes`,
  `app/core/config.py`), matching AR §9. No change needed.
- **Refresh token lifetime:** 30 days (`Settings.jwt_refresh_expire_days`),
  in an httpOnly, `samesite=lax` cookie scoped to `/api/v1/auth`
  (`secure` in every non-local `APP_ENV`). No change needed.
- **Refresh rotation — finding, fixed in this PR:** `AuthService.refresh_tokens`
  minted a new access+refresh pair on every call but never invalidated the
  token that was just exchanged, and `POST /auth/logout` didn't touch the
  token at all — it only told the *browser* to drop the cookie
  (`response.delete_cookie`). Since JWTs are self-contained and were tracked
  nowhere server-side, both the just-rotated token and a "logged out" token
  stayed fully valid, bearer-usable from anywhere, for up to their full
  30-day lifetime. An intercepted refresh token (XSS, a synced/shared device,
  a leaked backup) could not be revoked by rotating or logging out — the
  legitimate user rotating their session did nothing to cut the attacker off.
  This is the JWT-refresh equivalent of the IDOR principle from the DND-081
  section: a credential must be checked against something the server
  controls, not trusted purely on the strength of its own signature.

  **Fix:** added a `refresh_sessions` table (migration `0007`,
  `RefreshSession` in `app/auth/models.py`) — one row per currently-valid
  refresh token, keyed by its JWT `jti`. `AuthService.issue_tokens` now
  writes a new row for every token it mints (login, OAuth login, and
  rotation) and opportunistically sweeps expired rows for that user;
  `refresh_tokens` looks up the presented token's `jti` and rejects with
  `invalid_refresh_token` if no matching session exists — which is now true
  for a token that has already been rotated away or revoked — before
  deleting that row and minting the replacement (`tests/test_auth.py::
  test_reusing_a_rotated_refresh_token_is_rejected`). `POST /auth/logout`
  now reads the refresh cookie and calls the new
  `AuthService.revoke_refresh_token`, which deletes the matching session row
  server-side (best-effort — a malformed/already-expired token is ignored),
  so a replayed post-logout cookie is rejected the same way
  (`test_logout_revokes_refresh_token_even_if_cookie_is_replayed`). Both
  tests replay the *old* cookie value directly (bypassing the client's own
  cookie jar) specifically to prove the rejection is server-side, not just
  "the browser doesn't have the cookie anymore."

  **Design trade-off, noted rather than silently decided:** a session row is
  deleted the moment its token is rotated or the user logs out — there is one
  active refresh token per user at a time. Logging in on a second device
  invalidates the first device's refresh token (its access token keeps
  working for up to 15 more minutes, then refreshing fails and it has to
  re-login). ARCHITECTURE.md doesn't state a multi-device requirement either
  way; a `refresh_sessions` row per *device* (rather than per *user*) would
  support concurrent sessions cleanly if that turns out to be wanted, but
  wasn't built speculatively (CLAUDE.md rule 1). Flagging here rather than in
  a `security`-labeled issue because it's a product-scope question, not a
  vulnerability.

### Rate limiting

**Finding, fixed in this PR:** neither `/auth/*` nor `/shop/{code}/buy` had
any rate limiting — `/auth/login` was brute-forceable at network speed, and
`/buy` could be hammered (network-speed spend attempts, or just load) with no
backpressure beyond the DB transaction itself.

**Fix:** `app/core/rate_limit.py` — an in-process fixed-window limiter (no
Redis in the stack; AR §9 specifies a single uvicorn instance, so in-memory
state is consistent across requests. A multi-worker/multi-instance deploy
would need a shared store instead — noted as a follow-up if AR §9 changes).
Exposed as a FastAPI dependency factory, `rate_limit(scope, limit,
window_seconds)`, applied as:

- **`/auth/*` (router-wide):** 60 requests/min per client IP
  (`app/auth/router.py`).
- **`/auth/login` (additional, stricter):** 20 requests/min per client IP —
  layered on top of the router-wide limit because credential stuffing is the
  highest-value target on this router specifically.

  > **Stale as of the 2026-08-17 audit.** `/auth/login` no longer exists:
  > password auth was dropped in migration `0008_drop_password_hash` and login
  > is OAuth-only. The stricter 20/min layer went with it, so the OAuth
  > callbacks are covered by the router-wide 60/min bucket alone. Note also
  > that the per-IP keying described below does not hold in the deployed
  > topology — see the open follow-up on trusting proxy headers.
- **`/shop/{share_code}/buy`:** 20 requests/min per client IP
  (`app/merchants/router.py`) — matches the literal BACKLOG scope ("/buy");
  `/sell` carries the identical money-affecting/locking design and would
  benefit from the same limit, but wasn't added here to stay inside the
  stated scope — worth a fast-follow, not filed as a `security` issue since
  it's a hardening extension, not a gap being left open.

Exceeding a limit raises `RateLimitExceededError` (`rate_limited`, HTTP 429).
Covered by `tests/test_auth.py::test_login_rate_limit_returns_429_after_threshold`
and `tests/test_shop_api.py::test_buy_rate_limit_returns_429_after_threshold`.

**Caveat on client IP:** the limiter keys on `request.client.host`, which is
only the real client IP if the ASGI server is run with the reverse proxy's
`X-Forwarded-For`/`X-Real-IP` trusted and translated correctly (e.g. uvicorn
`--proxy-headers` with a trusted host list) — a deployment/CD concern
(DND-004), not addressed here. Blindly trusting an untranslated
`X-Forwarded-For` from the request would let a client set its own rate-limit
key and bypass the limit entirely, so the limiter deliberately does *not*
read that header itself.

### Out of scope for this task

Security headers (CSP, HSTS, etc.) and secret handling are covered by
DND-084 and are not assessed here.

## Заголовки и секреты (DND-084)

**Scope:** response security headers (CSP, HSTS, etc.) and secrets-outside-the-repo
(CLAUDE.md rule 12 — no fallback defaults to known credentials).

### Security headers

**Finding, fixed in this PR:** the API sent no security headers at all —
no CSP, no HSTS, no `X-Content-Type-Options`, no `X-Frame-Options`, no
`Referrer-Policy`. `docker-compose.yml`/`Dockerfile` don't run an nginx/caddy
layer in front of `uvicorn` yet (AR §9 names it as the target deploy stack,
but the code today is api + postgres only), so the API process itself is the
only layer that can set these — adding a reverse proxy is out of this task's
scope.

**Fix:** `app/core/security_headers.py` — an `add_security_headers(app)`
middleware (registered in `app/main.py`, same `register_x(app)` pattern as
`register_exception_handlers`) that sets on every response:

- `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'; base-uri 'none'`
  — the API only ever returns JSON to a separately-hosted SPA, so there's no
  first-party script/style/image to allow; locking to `'none'` also removes
  the bundled Swagger UI (`/docs`) as a script-injection surface. Accepted
  trade-off: `/docs` no longer renders (its CDN-loaded JS is blocked) — not
  fixed further since disabling/relocating the docs endpoint is outside the
  "headers" scope of this task.
- `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: geolocation=(), microphone=(), camera=()` — standard
  defense-in-depth baseline; none of these features are used by the API.
- `Strict-Transport-Security: max-age=63072000; includeSubDomains` — only
  when `app_env != "local"`, the same gate already used for the refresh
  cookie's `secure` flag in `app/auth/router.py` (DND-083), since HSTS is a
  promise about HTTPS that only holds once deployed. `preload` was
  deliberately left off: it requires submission to the browser preload list
  and is effectively irreversible for a long time — a deploy/DNS decision for
  a human, not something to bake in silently from an audit task.

Covered by `tests/test_security_headers.py`: every header's presence/value
on both a success and an error JSON response, and the HSTS on/off toggle
across `app_env`.

### Secrets outside the repo (rule 12)

**Methodology:** re-read every place a credential or credential-shaped value
could be defaulted — `app/core/config.py` (`Settings`), `docker-compose.yml`,
`.env.example`, `alembic.ini`, and the `JWT_SECRET_KEY`/`POSTGRES_*` values
set by `.github/workflows/ci.yml` and `cd.yml` — plus a repo-wide grep for
common secret shapes (API-key prefixes, private-key PEM headers, inline
`password=`/`secret=` literals).

**Findings:** none. Every field in `Settings` that a boot-time or
data-integrity failure would follow from being wrong (`database_url`,
`jwt_secret_key`, `smtp_host`, `frontend_base_url`) has no default and raises
a `pydantic` validation error at startup if unset, exactly per rule 12; the
fields that *are* optional (`smtp_user/password`, all three OAuth provider
triples) are all-or-nothing feature toggles, not guessable fallback
credentials, and are documented as such in `config.py` already.
`docker-compose.yml` uses `${VAR:?...}` (no `:-default`) for every
`POSTGRES_*`/`JWT_SECRET_KEY`/`SMTP_HOST`/`FRONTEND_BASE_URL` value, so
`docker compose up` refuses to start rather than booting with a guessable
credential. `alembic.ini`'s `sqlalchemy.url = driver://user:pass@localhost/dbname`
is the unmodified Alembic scaffold placeholder — `alembic/env.py` always
overwrites it from `Settings.database_url` (or `ALEMBIC_DATABASE_URL` for
tests) before running, so it's dead text, not a live fallback. CI's
`JWT_SECRET_KEY=ci-test-secret-not-a-real-credential` and
`POSTGRES_PASSWORD: ci` are job-scoped to the ephemeral CI Postgres
container and already commented as such — not a secret, not reused anywhere
a real deployment would read from.

No fixes were required and no `security`-labeled follow-up issue was filed.

### Out of scope for this task

None — this is the last task in the DND-081 → DND-083 → DND-084 chain; the
full security-review checklist (IDOR, JWT/rate-limit, headers/secrets) is
now covered across the three sections above.
