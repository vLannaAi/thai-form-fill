# Studio Save-to-GitHub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a trusted author edit a form's layout in Studio from the deployed (private-repo) site with no local clone, committing `layout.json` straight to GitHub via the Contents API, with Last-Write-Wins.

**Architecture:** Pure-static. The author's fine-grained PAT lives only in their browser `localStorage`. Studio "Save" does GET-sha → PUT (one 409 retry = LWW) against `api.github.com`. On load, a token-holder reads the layout live from the authenticated Contents API; everyone else reads the deployed bundled `layout.json`. All logic stays in the existing vanilla-JS engine files (`public/lib/form-engine.js`, `public/lib/studio.js`); the Nuxt landing shell is untouched.

**Tech Stack:** Vanilla ES5-style UMD JS (matches existing lib files), GitHub REST Contents API, `node --test` for unit tests.

**Spec:** `docs/superpowers/specs/2026-06-03-studio-save-to-github-design.md`

---

## File Structure

- `public/lib/form-engine.js` — **modify.** Add: `repo` config from init opts; token storage helpers (`getToken`/`setToken`/`clearToken`); pure GitHub helpers (`b64utf8`, `contentsUrl`, `needsRetry`); API-first `loadLayout` with deployed-copy fallback. Export the new helpers for tests, following the existing `_name` export convention.
- `public/lib/studio.js` — **modify.** Replace the File System Access `save()` with the GitHub commit flow (GET sha → PUT, one LWW retry); add the token field UI (paste / save / forget); change visibility gating to `localhost OR token OR #studio`.
- `public/forms/50bis/index.html` — **modify.** Pass `repo: {...}` into `FormEngine.init`.
- `public/lib/engine.css` — **modify.** Styles for the token field.
- `test/github.test.js` — **create.** Unit tests for the pure helpers + `loadLayout` selection (fetch/localStorage stubbed).
- `README.md` — **modify.** Document the save model, PAT minting, `#studio` bootstrap, hosting prerequisite.

A note on the working tree: the repo currently holds the uncommitted Nuxt-4 conversion. Every commit below uses `git add <explicit paths>` so feature commits never sweep in unrelated changes. Prefer running this plan in an isolated branch/worktree.

---

## Task 1: GitHub pure helpers + token storage (form-engine.js)

**Files:**
- Modify: `public/lib/form-engine.js` (add functions before the `root.FormEngine = {...}` export block at lines 280-286; extend the export block)
- Test: `test/github.test.js` (create)

- [ ] **Step 1: Write the failing tests**

Create `test/github.test.js`:

```js
const test = require('node:test');
const assert = require('node:assert');
const { FormEngine } = require('../public/lib/form-engine.js');

function lsStub() {
  return {
    _d: {},
    getItem(k) { return Object.prototype.hasOwnProperty.call(this._d, k) ? this._d[k] : null; },
    setItem(k, v) { this._d[k] = String(v); },
    removeItem(k) { delete this._d[k]; }
  };
}

test('_b64utf8: round-trips ASCII and Thai through base64', () => {
  const a = '{"field.name1":{"x":1,"y":2}}\n';
  assert.strictEqual(Buffer.from(FormEngine._b64utf8(a), 'base64').toString('utf8'), a);
  const t = 'ชื่อ ณ ที่จ่าย';
  assert.strictEqual(Buffer.from(FormEngine._b64utf8(t), 'base64').toString('utf8'), t);
});

test('_contentsUrl: builds the Contents API path from repo + formId', () => {
  const url = FormEngine._contentsUrl({ owner: 'vLannaAI', name: 'thai-form-fill', branch: 'main' }, '50bis');
  assert.strictEqual(url,
    'https://api.github.com/repos/vLannaAI/thai-form-fill/contents/public/forms/50bis/layout.json');
});

test('_needsRetry: only a 409 (stale sha) triggers the LWW retry', () => {
  assert.strictEqual(FormEngine._needsRetry(409), true);
  assert.strictEqual(FormEngine._needsRetry(200), false);
  assert.strictEqual(FormEngine._needsRetry(422), false);
});

test('token storage: set / get / clear via localStorage', () => {
  global.localStorage = lsStub();
  assert.strictEqual(FormEngine._getToken(), '');
  FormEngine._setToken('ghp_abc');
  assert.strictEqual(FormEngine._getToken(), 'ghp_abc');
  FormEngine._clearToken();
  assert.strictEqual(FormEngine._getToken(), '');
  delete global.localStorage;
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/github.test.js`
Expected: FAIL — `FormEngine._b64utf8 is not a function` (and the others undefined).

- [ ] **Step 3: Add the helpers to form-engine.js**

In `public/lib/form-engine.js`, immediately before the `root.FormEngine = {` line (currently line 280), insert:

```js
  // ---- GitHub save/read helpers ----
  var TOKEN_KEY = 'tff:ghtoken';
  function getToken() { return (typeof localStorage !== 'undefined' && localStorage.getItem(TOKEN_KEY)) || ''; }
  function setToken(t) { if (typeof localStorage !== 'undefined') localStorage.setItem(TOKEN_KEY, t); }
  function clearToken() { if (typeof localStorage !== 'undefined') localStorage.removeItem(TOKEN_KEY); }

  // UTF-8-safe base64 (GitHub Contents API wants base64 file content).
  function b64utf8(str) {
    var bytes = new TextEncoder().encode(str), bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin);
  }
  function contentsUrl(repo, formId) {
    return 'https://api.github.com/repos/' + repo.owner + '/' + repo.name +
           '/contents/public/forms/' + formId + '/layout.json';
  }
  function needsRetry(status) { return status === 409; } // stale sha -> re-GET + PUT once (LWW)
```

- [ ] **Step 4: Export the helpers**

In the `root.FormEngine = {` object (lines 280-286), add to the last line before the closing `}`:

```js
    _applyLayoutOne: applyLayoutOne,
    _getToken: getToken, _setToken: setToken, _clearToken: clearToken,
    _b64utf8: b64utf8, _contentsUrl: contentsUrl, _needsRetry: needsRetry
```

(Replace the existing `_applyLayoutOne: applyLayoutOne` line — which currently has no trailing comma — with the three-line block above.)

- [ ] **Step 5: Run the tests to verify they pass**

Run: `node --test test/github.test.js`
Expected: PASS — 4 tests.

- [ ] **Step 6: Run the full suite (no regressions)**

Run: `node --test test/`
Expected: PASS — 32 tests (28 existing + 4 new).

- [ ] **Step 7: Commit**

```bash
git add public/lib/form-engine.js test/github.test.js
git commit -m "feat: GitHub token storage + base64/url/retry helpers in form-engine"
```

---

## Task 2: API-first loadLayout with deployed fallback (form-engine.js)

**Files:**
- Modify: `public/lib/form-engine.js:114-118` (the `loadLayout` function) and the export block
- Modify: `public/lib/form-engine.js` init (set `state.repo` from opts)
- Test: `test/github.test.js` (append)

- [ ] **Step 1: Write the failing tests**

Append to `test/github.test.js`:

```js
function lsWith(token) {
  const s = lsStub();
  if (token) s.setItem('tff:ghtoken', token);
  return s;
}

test('_loadLayout: token present -> reads live from the Contents API', async () => {
  global.localStorage = lsWith('ghp_x');
  FormEngine._state.repo = { owner: 'o', name: 'r', branch: 'main' };
  FormEngine._state.formId = '50bis';
  let seen;
  global.fetch = (url, opts) => {
    seen = { url, opts };
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ 'field.x': { x: 1, y: 2 } }) });
  };
  await FormEngine._loadLayout('layout.json');
  assert.match(seen.url, /^https:\/\/api\.github\.com\/repos\/o\/r\/contents\/public\/forms\/50bis\/layout\.json\?ref=main$/);
  assert.strictEqual(seen.opts.headers.Authorization, 'Bearer ghp_x');
  assert.deepStrictEqual(FormEngine._state.layout, { 'field.x': { x: 1, y: 2 } });
  delete global.fetch; delete global.localStorage;
});

test('_loadLayout: no token -> fetches the deployed copy with a cache-bust', async () => {
  global.localStorage = lsWith(null);
  FormEngine._state.formId = '50bis';
  let seen;
  global.fetch = (url) => {
    seen = url;
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ a: 1 }) });
  };
  await FormEngine._loadLayout('layout.json');
  assert.match(seen, /^layout\.json\?t=\d+$/);
  assert.deepStrictEqual(FormEngine._state.layout, { a: 1 });
  delete global.fetch; delete global.localStorage;
});

test('_loadLayout: API failure falls back to the deployed copy', async () => {
  global.localStorage = lsWith('ghp_x');
  FormEngine._state.repo = { owner: 'o', name: 'r', branch: 'main' };
  FormEngine._state.formId = '50bis';
  const urls = [];
  global.fetch = (url) => {
    urls.push(url);
    if (url.indexOf('api.github.com') >= 0) return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}) });
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({ b: 2 }) });
  };
  await FormEngine._loadLayout('layout.json');
  assert.ok(urls.some(u => u.indexOf('api.github.com') >= 0), 'tried the API first');
  assert.ok(urls.some(u => /^layout\.json\?t=\d+$/.test(u)), 'fell back to deployed copy');
  assert.deepStrictEqual(FormEngine._state.layout, { b: 2 });
  delete global.fetch; delete global.localStorage;
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/github.test.js`
Expected: FAIL — `FormEngine._loadLayout is not a function`.

- [ ] **Step 3: Replace loadLayout with the API-first version**

In `public/lib/form-engine.js`, replace the current `loadLayout` (lines 114-118):

```js
  function loadLayout(url) {
    return fetch(url).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { state.layout = j || {}; })
      .catch(function () { state.layout = {}; });
  }
```

with:

```js
  function loadDeployed(url) {
    var u = url + (url.indexOf('?') < 0 ? '?t=' : '&t=') + Date.now(); // cache-bust the deployed copy
    return fetch(u).then(function (r) { return r.ok ? r.json() : {}; })
      .then(function (j) { state.layout = j || {}; })
      .catch(function () { state.layout = {}; });
  }
  function loadLayout(url) {
    var token = getToken();
    if (token && state.repo) {
      var api = contentsUrl(state.repo, state.formId) + '?ref=' + state.repo.branch;
      return fetch(api, {
        headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github.raw' },
        cache: 'no-store'
      }).then(function (r) {
        if (!r.ok) throw new Error('api ' + r.status);
        return r.json();
      }).then(function (j) { state.layout = j || {}; })
        .catch(function () { return loadDeployed(url); }); // offline / 404 / rate-limit -> deployed copy
    }
    return loadDeployed(url);
  }
```

Note: `getToken`, `contentsUrl` are defined later in the file (function declarations hoist within the IIFE), so referencing them here is fine.

- [ ] **Step 4: Set state.repo in init**

In `public/lib/form-engine.js`, in `init(opts)` (line 216), right after `state.formId = opts.formId;` add:

```js
    state.repo = opts.repo;
```

- [ ] **Step 5: Export _loadLayout for tests**

In the `root.FormEngine = {` block, append `_loadLayout: loadLayout` to the GitHub-helpers export line added in Task 1:

```js
    _b64utf8: b64utf8, _contentsUrl: contentsUrl, _needsRetry: needsRetry, _loadLayout: loadLayout
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `node --test test/github.test.js`
Expected: PASS — 7 tests.

- [ ] **Step 7: Run the full suite**

Run: `node --test test/`
Expected: PASS — 35 tests.

- [ ] **Step 8: Commit**

```bash
git add public/lib/form-engine.js test/github.test.js
git commit -m "feat: API-first loadLayout (token live-read, deployed fallback)"
```

---

## Task 3: Pass repo config into init (index.html)

**Files:**
- Modify: `public/forms/50bis/index.html:39`

- [ ] **Step 1: Add the repo config to FormEngine.init**

In `public/forms/50bis/index.html`, replace line 39:

```html
<script>FormEngine.init({ formId: '50bis', lang: 'th', strings: 'strings.json', layout: 'layout.json' });</script>
```

with:

```html
<script>FormEngine.init({ formId: '50bis', lang: 'th', strings: 'strings.json', layout: 'layout.json', repo: { owner: 'vLannaAI', name: 'thai-form-fill', branch: 'main' } });</script>
```

- [ ] **Step 2: Verify the form still loads (manual)**

Run: `npm run dev` then open `http://localhost:3000/forms/50bis/index.html`.
Expected: form renders as before; DevTools console has no errors. (On localhost with no token, `loadLayout` takes the deployed-copy path — identical to today's behaviour.)

- [ ] **Step 3: Commit**

```bash
git add public/forms/50bis/index.html
git commit -m "feat: pass repo coordinates into FormEngine.init for 50bis"
```

---

## Task 4: Studio token field UI (studio.js)

**Files:**
- Modify: `public/lib/studio.js` (inside `_initDOM`, after the `var active = ...` line ~24)
- Modify: `public/lib/engine.css` (append token-field styles)

- [ ] **Step 1: Add token-field styles**

Append to `public/lib/engine.css`:

```css
.studio-token { display: none; gap: 6px; align-items: center; }
.studio-token.show { display: inline-flex; }
.studio-token input { font: inherit; padding: 2px 6px; width: 220px; }
.studio-token button { font: inherit; cursor: pointer; }
```

- [ ] **Step 2: Build the token field in studio.js**

In `public/lib/studio.js`, inside `_initDOM()`, immediately after `var active = false, sel = null, key = null, cur = null;` (~line 24) insert:

```js
    // ---- token field (paste / save / forget the GitHub PAT) ----
    var tokenWrap = document.createElement('span');
    tokenWrap.className = 'studio-token';
    tokenWrap.innerHTML =
      '<input type="password" id="studioToken" placeholder="fine-grained GitHub PAT" autocomplete="off">' +
      '<button id="studioTokenSave" type="button">Save token</button>' +
      '<button id="studioTokenForget" type="button">Forget</button>';
    btn.parentNode.insertBefore(tokenWrap, btn);
    var tokenInput = tokenWrap.querySelector('#studioToken');
    function revealToken() { tokenWrap.classList.add('show'); tokenInput.focus(); }
    function hideToken() { tokenWrap.classList.remove('show'); tokenInput.value = ''; }
    tokenWrap.querySelector('#studioTokenSave').addEventListener('click', function () {
      var v = tokenInput.value.trim();
      if (!v) return;
      FE._setToken(v); hideToken();
      info.style.display = ''; info.textContent = 'token saved — Studio enabled';
    });
    tokenWrap.querySelector('#studioTokenForget').addEventListener('click', function () {
      FE._clearToken(); hideToken();
      info.style.display = ''; info.textContent = 'token forgotten';
    });
```

- [ ] **Step 3: Verify the field appears (manual)**

Run: `npm run dev`, open `http://localhost:3000/forms/50bis/index.html#studio`.
In DevTools console run: `document.querySelector('.studio-token').classList.add('show')`.
Expected: a password input + "Save token" + "Forget" appear in the toolbar. Typing a value and clicking "Save token" then running `localStorage.getItem('tff:ghtoken')` returns that value; "Forget" clears it.

- [ ] **Step 4: Commit**

```bash
git add public/lib/studio.js public/lib/engine.css
git commit -m "feat: Studio token field (paste/save/forget GitHub PAT)"
```

---

## Task 5: Studio Save → GitHub commit with LWW (studio.js)

**Files:**
- Modify: `public/lib/studio.js:167-202` (replace the `save()` function and its File System Access helpers)

- [ ] **Step 1: Replace the save() implementation**

In `public/lib/studio.js`, replace the entire block from the `// ---- save: write layout.json directly...` comment through the end of the `save()` function (currently lines 167-202, ending with the line `.catch(function (e) { info.textContent = (e && e.name === 'AbortError') ? 'save cancelled' : 'save failed: ' + (e && e.message); });` and its closing `}`) with:

```js
    // ---- save: commit layout.json to GitHub via the Contents API (LWW) ----
    function ghHeaders(token) {
      return { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' };
    }
    function getSha(url, branch, token) {
      return fetch(url + '?ref=' + branch, { headers: ghHeaders(token), cache: 'no-store' })
        .then(function (r) {
          if (r.status === 404) return undefined;              // file does not exist yet
          if (!r.ok) throw new Error('GET ' + r.status);
          return r.json().then(function (j) { return j.sha; });
        });
    }
    function putFile(url, message, contentB64, sha, branch, token) {
      var body = { message: message, content: contentB64, branch: branch };
      if (sha) body.sha = sha;
      return fetch(url, { method: 'PUT', headers: ghHeaders(token), body: JSON.stringify(body) })
        .then(function (r) { return r.json().then(function (j) { return { status: r.status, body: j }; }); });
    }
    function save() {
      var token = FE._getToken();
      if (!token) { revealToken(); info.textContent = 'paste a fine-grained PAT to save'; return; }
      var repo = FE._state.repo;
      if (!repo) { info.textContent = 'no repo configured for this form'; return; }
      var url = FE._contentsUrl(repo, FE._state.formId);
      var json = JSON.stringify(FE._state.layout, null, 2) + '\n';
      var b64 = FE._b64utf8(json);
      var msg = 'studio: update ' + FE._state.formId + ' layout';
      info.textContent = 'saving…';
      getSha(url, repo.branch, token)
        .then(function (sha) { return putFile(url, msg, b64, sha, repo.branch, token); })
        .then(function (res) {
          if (FE._needsRetry(res.status)) {                    // 409: someone committed since our GET
            return getSha(url, repo.branch, token)             // re-read sha, write once more (LWW)
              .then(function (sha) { return putFile(url, msg, b64, sha, repo.branch, token); });
          }
          return res;
        })
        .then(function (res) {
          if (res.status === 200 || res.status === 201) {
            var sha = res.body && res.body.commit && res.body.commit.sha;
            info.textContent = 'saved to GitHub ✓' + (sha ? ' (' + sha.slice(0, 7) + ')' : '');
          } else if (res.status === 401 || res.status === 403) {
            revealToken(); info.textContent = 'token invalid or lacks Contents:write';
          } else {
            info.textContent = 'save failed: ' + ((res.body && res.body.message) || res.status);
          }
        })
        .catch(function (e) { info.textContent = 'save failed: ' + (e && e.message); });
    }
```

Note: the existing `var dirHandle = null;` and `writeFile(...)` helper (lines ~170-175) are part of the replaced block and are removed — they are no longer referenced. The `btn`/`exitBtn` click wiring below this block (`btn.addEventListener('click', function () { if (!active) start(); else save(); });`) is unchanged and now calls the new `save()`.

- [ ] **Step 2: Verify no dangling references (manual)**

Run: `grep -n "showDirectoryPicker\|dirHandle\|writeFile\|createWritable" public/lib/studio.js`
Expected: no matches (all File System Access code removed).

- [ ] **Step 3: Verify the engine loads without errors (manual)**

Run: `npm run dev`, open `http://localhost:3000/forms/50bis/index.html`, click **Studio**, then click **Save changes** with no token.
Expected: the token field reveals and the toolbar shows `paste a fine-grained PAT to save`. No console errors.

- [ ] **Step 4: Commit**

```bash
git add public/lib/studio.js
git commit -m "feat: Studio saves layout.json to GitHub via Contents API (LWW)"
```

---

## Task 6: Studio visibility gating — localhost OR token OR #studio (studio.js)

**Files:**
- Modify: `public/lib/studio.js:19-23` (the localhost gate inside `_initDOM`)

- [ ] **Step 1: Replace the visibility gate**

In `public/lib/studio.js`, replace the current gate (lines 19-23):

```js
    var host = location.hostname;
    var local = host === 'localhost' || host === '127.0.0.1' || host === '' || host === '[::1]' || host === '::1';
    if (!local) return;            // off-localhost: leave the button hidden, do nothing
    btn.style.display = '';        // reveal Studio button on localhost
```

with:

```js
    var host = location.hostname;
    var local = host === 'localhost' || host === '127.0.0.1' || host === '' || host === '[::1]' || host === '::1';
    var hashStudio = location.hash === '#studio';
    var hasToken = !!FE._getToken();
    // Normal visitors (no token, no #studio, off localhost) never see Studio.
    if (!local && !hashStudio && !hasToken) return;
    btn.style.display = '';        // reveal Studio button for authors
```

- [ ] **Step 2: Verify the gate (manual)**

Run: `npm run dev`. Check three cases:
1. `http://localhost:3000/forms/50bis/index.html` → Studio button visible (localhost).
2. Simulate "deployed, no token": in DevTools console on the page run `localStorage.removeItem('tff:ghtoken')`, then load with a non-localhost host is not possible locally — instead verify the logic by confirming `#studio` reveals it: open `…/index.html#studio` → button visible.
3. After saving a token (Task 4 flow), reload `…/index.html` (no hash) → button visible because `hasToken` is true. Run `localStorage.removeItem('tff:ghtoken')` and reload → on localhost still visible (local), which is expected.

Expected: button shows whenever localhost OR `#studio` OR a stored token is present.

- [ ] **Step 3: Commit**

```bash
git add public/lib/studio.js
git commit -m "feat: reveal Studio on localhost OR stored token OR #studio hash"
```

---

## Task 7: Documentation (README)

**Files:**
- Modify: `README.md` (the "## Studio (layout authoring)" section)

- [ ] **Step 1: Replace the Studio section's save paragraph**

In `README.md`, replace the paragraph that begins `Click **Save changes** to write` and ends `The Studio button only appears on \`localhost\`.` with:

```markdown
Click **Save changes** to commit `layout.json` straight to GitHub.

**Authoring from the deployed site (no local clone):**

1. Mint a **fine-grained Personal Access Token** (GitHub → Settings → Developer
   settings → Fine-grained tokens): repository access limited to
   **`vLannaAI/thai-form-fill`**, permission **Contents: Read and write**, a
   short expiry.
2. Open the form with the `#studio` hash, e.g.
   `…/forms/50bis/index.html#studio`. The **Studio** button and a token field
   appear. Paste the PAT and click **Save token** (stored only in your browser's
   `localStorage`, never committed). Studio now appears automatically on every
   load in that browser.
3. Edit the layout, then click **Save changes** — it commits to `main` as
   `studio: update <formId> layout`. Conflicts resolve Last-Write-Wins.
4. **Forget** clears the token from your browser.

**Reading:** a token-holder loads the live layout from the authenticated
Contents API; everyone else loads the `layout.json` bundled in the deployed
site (which refreshes when the site redeploys after a commit).

**Security:** the token is your login credential — use a repo-scoped,
short-expiry, Contents-only token, and only paste it on the trusted deployed
origin. `localStorage` is readable by any script on the origin.

**Prerequisite:** serving a *private* repo via GitHub Pages requires a paid plan
(Pro/Team/Enterprise); otherwise host the built site (`npm run generate` →
`.output/public`) wherever you like — the non-token read path just needs a
deployed origin.
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: Studio save-to-GitHub (PAT, #studio bootstrap, security)"
```

---

## Task 8: End-to-end verification with a real PAT (manual — author step)

This cannot run in CI (needs a real token + the repo on GitHub). The author runs it once.

**Preconditions:** the repo is pushed to `vLannaAI/thai-form-fill` (`git remote add origin …` + push), and a fine-grained PAT (Contents: R/W on that repo) is available.

- [ ] **Step 1: Save a change to GitHub**

Run `npm run dev`, open `…/forms/50bis/index.html#studio`, paste the PAT, **Save token**. Click **Studio**, select a label, nudge it with an arrow key, click **Save changes**.
Expected: toolbar shows `saved to GitHub ✓ (<7-char sha>)`. The new commit appears on `main` and `public/forms/50bis/layout.json` shows the moved coordinate.

- [ ] **Step 2: Token-holder live read**

Reload the page (token still stored).
Expected: the moved label is in its new position, read live from the Contents API (verify in DevTools Network: a request to `api.github.com/...contents/...layout.json` with `200`).

- [ ] **Step 3: Non-token read path**

Run `localStorage.removeItem('tff:ghtoken')`, reload `…/index.html` (no hash).
Expected: Studio button hidden (off-localhost it would be hidden; on localhost still shown). The layout loads from `layout.json?t=…` (the deployed copy) — verify in Network.

- [ ] **Step 4: LWW retry (optional)**

Edit `layout.json` directly on GitHub (commit a change) to make the local sha stale, then **Save changes** again in Studio.
Expected: the save still succeeds (one 409 → re-GET sha → PUT), toolbar shows `saved to GitHub ✓`; your Studio version wins.

---

## Self-Review

**Spec coverage:**
- Credential (fine-grained PAT in `localStorage`, Forget) → Task 1 (storage), Task 4 (UI). ✓
- Repo config via init opts → Task 2 (state.repo), Task 3 (index.html). ✓
- Write path GET sha → PUT, 404=new, 409 LWW retry, 401/403 handling → Task 5. ✓
- Read path API-first for token-holder, deployed-copy fallback with cache-bust → Task 2. ✓
- Studio gating localhost OR token OR `#studio` → Task 6. ✓
- "Save locally" removed (no FS write, no localStorage layout copy) → Task 5 (FS code deleted); no layout-persistence task exists by design. ✓
- Commit message `studio: update {formId} layout` → Task 5. ✓
- Token UI (password input, save, forget) → Task 4. ✓
- README (PAT minting, `#studio`, security, hosting prerequisite) → Task 7. ✓
- Tests (base64, URL builder, 409 decision, token storage stub, loadLayout selection) → Tasks 1-2. ✓
- Manual real-token verification → Task 8. ✓

**Placeholder scan:** no TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type/name consistency:** `getToken/setToken/clearToken` exported as `_getToken/_setToken/_clearToken` and used as `FE._getToken` in studio.js. `contentsUrl`→`_contentsUrl`, `b64utf8`→`_b64utf8`, `needsRetry`→`_needsRetry`, `loadLayout`→`_loadLayout` consistent across Tasks 1-2 and consumed in Task 5. `revealToken`/`hideToken` defined in Task 4, called in Task 5. `repo` shape `{ owner, name, branch }` identical in Task 2 test, Task 3 init, Task 5 `contentsUrl`. ✓
