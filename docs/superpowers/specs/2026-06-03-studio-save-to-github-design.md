# Studio → Save to GitHub (private repo, LWW)

**Date:** 2026-06-03
**Status:** Approved design — ready for implementation plan
**Repo:** `vLannaAI/thai-form-fill` (private), branch `main`

## Problem

The Studio layout editor currently saves `layout.json` via the File System
Access API (or a download fallback) — this only works for someone who has the
repository cloned locally and is running on `localhost`. We want a trusted
author to edit layouts **from the deployed site, with no local clone**, and have
the change land in the GitHub repo so it propagates to everyone. Coordination is
**Last-Write-Wins (LWW)** — no CRDT, no locking.

## Decisions (resolved during brainstorming)

1. **Who saves:** trusted author(s) only, authenticating with their **own**
   fine-grained Personal Access Token (PAT). Stays 100% static — no backend.
2. **Repo is private**, so anonymous browsers cannot read `layout.json` from a
   public `raw.githubusercontent.com` URL. Reads are split:
   - **Token-holder** → live read via the authenticated Contents API.
   - **Everyone else** → the `layout.json` bundled in the deployed site.
3. **"Save locally" is removed** — no `localStorage` layout copy, no disk-write
   fallback. **Save commits to GitHub only.** GitHub is the single source of
   truth; nothing can diverge or be silently overwritten.
4. **Bootstrap on deployed site:** the URL hash **`#studio`** reveals the Studio
   button + token field even without a token. Once a valid token is stored,
   Studio appears automatically on every load for that browser.
5. **Commit message:** `studio: update {formId} layout`.

## Architecture

All logic stays in the existing vanilla-JS engine files; no framework coupling.
The Nuxt landing shell is unaffected.

### Credential

- A **fine-grained PAT**, scoped to **only** `vLannaAI/thai-form-fill`, with
  **Contents: Read and Write**.
- Stored in `localStorage["tff:ghtoken"]` — it is the author's login credential,
  not form data, so it must persist between sessions. A one-click **Forget
  token** clears it.
- The token is **never** committed, **never** placed in a URL, **never** logged.
- Security caveat (documented for the author): any JS on the origin can read
  `localStorage`. Use a repo-scoped, short-expiry, minimal-permission PAT, and
  only paste it on the trusted deployed origin.

### Repo configuration

Passed into the engine at init (no coordinates hardcoded in engine JS):

```js
FormEngine.init({
  formId: '50bis', lang: 'th', strings: 'strings.json', layout: 'layout.json',
  repo: { owner: 'vLannaAI', name: 'thai-form-fill', branch: 'main' }
})
```

File path is derived: `public/forms/{formId}/layout.json`.

### Write path — Studio "Save"

```
Save clicked (studio active)
  ├─ no token  → reveal token field; info: "paste a fine-grained PAT to save"; abort
  └─ has token →
       json = JSON.stringify(FE._state.layout, null, 2) + "\n"
       path = "public/forms/" + formId + "/layout.json"
       GET  api.github.com/repos/{owner}/{name}/contents/{path}?ref={branch}
            (Authorization: Bearer <token>)  → current .sha   (404 ⇒ file is new, sha=undefined)
       PUT  api.github.com/repos/{owner}/{name}/contents/{path}
            body: { message: "studio: update {formId} layout",
                    content: base64utf8(json), sha, branch }
       ├─ 200/201 → info "saved to GitHub ✓ (commit <short-sha>)"
       ├─ 409     → re-GET .sha, PUT once more         (LWW: our content wins)
       ├─ 401/403 → info "token invalid or lacks Contents:write"; reveal token field
       └─ 422/other → surface response message
```

- `base64utf8()` encodes UTF-8 safely (e.g. `btoa(String.fromCharCode(...new
  TextEncoder().encode(json)))`). `layout.json` is ASCII today, but encode
  defensively.
- LWW retry on 409 is bounded to **one** retry, then surfaces an error — avoids
  an infinite loop if two authors race continuously.

### Read path — form load (`loadLayout`)

```
loadLayout():
  token present?
    yes → GET contents API  (Accept: application/vnd.github.raw,
                             Authorization, cache: no-store)  → parse JSON
          on ANY failure ↓
    no / failure → fetch "./layout.json?t={timestamp}"   (deployed copy)
```

- Token-holders always see the absolute-latest (their own just-saved commit).
- Everyone else gets the copy bundled in the deployed site, which refreshes when
  the host redeploys after a save-commit (LWW-eventual).
- The deployed-copy fetch always succeeds offline/first-load, so the form never
  breaks.

### Studio visibility & bootstrap

- Reveal Studio when: **`localhost`** OR **token present** OR **URL hash
  `#studio`**.
- First-time setup on the deployed site: open `…/forms/50bis/index.html#studio`
  → Studio button + token field appear → paste PAT → it is stored → thereafter
  Studio shows automatically (token present).
- Normal users (no token, no `#studio`) never see Studio. Editing/saving is inert
  without a valid token.

### Token UI

A small field in the Studio toolbar (revealed on demand): a password-type input
to paste the PAT, a **Save token** action (stores to `localStorage`), and a
**Forget token** action (clears it). Token value is never echoed to logs or the
DOM beyond the masked input.

## Files to change

- `public/lib/studio.js` — replace File System Access save with the GitHub
  commit flow (GET sha → PUT, LWW 409 retry); add token field UI + storage
  helpers; update gating (`localhost` OR token OR `#studio`); update toolbar
  button/label states.
- `public/lib/form-engine.js` — `loadLayout` becomes API-first when a token is
  present, with deployed-copy fallback; expose token get/set/clear helpers and
  the `repo` config from init opts; build Contents API URLs.
- `public/forms/50bis/index.html` — pass `repo: {…}` into `FormEngine.init`.
- `public/lib/engine.css` (or form toolbar CSS) — styles for the token field.
- `README.md` — document the new save model, how to mint the fine-grained PAT,
  the `#studio` bootstrap, and the private-repo / hosting prerequisite.

## Testing

- **Unit (node --test, no network):** UTF-8 base64 round-trip; Contents API URL
  builder; the 409-needs-retry decision; token storage get/set/clear (with a
  `localStorage` stub). Keep network code thin so the testable logic is pure.
- **Manual / Playwright (author's step):** with a real PAT, exercise save →
  verify a commit appears on `main`; reload as token-holder → live read shows the
  change; reload without token → deployed copy path. Cannot run in CI without a
  repo secret.

## Risks / prerequisites

- **Private-repo hosting:** GitHub Pages from a private repo requires a paid plan
  (Pro/Team/Enterprise); otherwise the non-token "deployed copy" read path needs
  some deployed origin. The feature works regardless, but this read path assumes
  a deployed site exists.
- **Token in `localStorage`** is inherently readable by origin JS — mitigated by
  fine-grained scope + short expiry + Forget token; acceptable for a trusted
  author on a trusted origin.
- **No git remote is configured yet** — the repo must be pushed to
  `vLannaAI/thai-form-fill` for any of this to function.

## Out of scope

- Multi-author conflict resolution beyond LWW (no CRDT, no locking, no merge).
- OAuth / device-flow login (would need a CORS proxy or backend).
- Editing layouts for users without write access.
