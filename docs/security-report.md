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
| Content import (`/admin/content/import`) | Gated by `get_admin_user` (`is_admin`), not an ownership check but the correct control for a non-per-user resource | `app/content/router.py` |

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
