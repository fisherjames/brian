---
title: Security Audit Report
tags: #clsh #rnd #security
created: 2026-03-14
updated: 2026-03-14
---

# Security Audit Report — clsh.dev

> Full security audit of the clsh codebase before open source launch.
> clsh gives remote terminal access to a machine — **any vulnerability = full machine compromise**.

## Audit Scope

- All source files in `packages/agent/src/` (11 files)
- All source files in `packages/web/src/` (35+ files)
- Configuration, dependencies, and deployment

## Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 4 | Must fix before repo goes public |
| HIGH | 9 | Must fix before launch day |
| LOW | 8 | Hardening — fix post-launch |

---

## Password + Biometric Auth (Session 37)

> Added 2026-03-16. Server-side password and biometric authentication for PWA re-authentication.

- **Server-side password auth**: `packages/agent/src/password.ts` implements scrypt hashing with `crypto.timingSafeEqual` for constant-time comparison. Prevents timing attacks on password verification.
- **WebAuthn/Face ID server-side storage**: Biometric credentials stored in `lock_biometric` table. Supports Face ID and other WebAuthn authenticators for passwordless re-auth.
- **3 new database tables**: `user_password` (scrypt hashes), `lock_biometric` (WebAuthn credentials), `lock_client_hash` (client-side lock state tracking).
- **7 new API endpoints**: Password set/verify, biometric register/verify, lock state management. All behind existing auth middleware.
- **Rate limiting**: New auth endpoints covered by existing `express-rate-limit` middleware (10 req / 15 min).
- **Lock screen state sync**: PWA lock state persisted server-side to survive app restarts and page refreshes.
- **Frontend**: `LockScreen.tsx`, `LockSetup.tsx`, `useLockScreen.ts`, `lock-screen.ts` provide lock-screen-style UI when password is configured.
- **AuthScreen rewrite**: Now detects if password is configured and shows lock screen instead of bootstrap token flow for returning users.
- **Documentation**: README.md updated with comprehensive security section. SECURITY.md fully rewritten with complete security architecture covering all auth flows.
- **PR #23 merged**, CI green on Node 20 + 22. Published @clsh/web@0.0.4, @clsh/agent@0.0.7, clsh-dev@0.1.8.

---

## CRITICAL Findings

### C1: Magic Link Endpoints Issue JWTs Without Verification

**File**: `packages/agent/src/server.ts` (lines 119-175)
**Risk**: **Full unauthenticated shell access**

Both `/api/auth/magic-link` (POST) and `/api/auth/verify` (GET) immediately generate and emit valid JWTs without any actual email verification. They are placeholder implementations that were never gated.

**Attack**: Anyone who discovers the server URL (ngrok/SSH tunnel) can:
1. POST to `/api/auth/magic-link` with any email + pendingId
2. Listen on `/api/sse/events/<pendingId>` to receive the JWT
3. Connect to WebSocket with that JWT → full terminal access

**Consequence**: Complete machine compromise. No authentication required.

**Fix**: Disable both endpoints immediately (return 501). Only re-enable when Resend email integration is complete with proper token verification:
```typescript
app.post('/api/auth/magic-link', (_req, res) => {
  res.status(501).json({ error: 'Magic link auth not yet implemented' });
});
app.get('/api/auth/verify', (_req, res) => {
  res.status(501).json({ error: 'Not yet implemented' });
});
```

---

### C2: Bootstrap Token Never Invalidated (Permanent Backdoor)

**File**: `packages/agent/src/auth.ts` (lines 22-33)
**Risk**: **Persistent unauthorized access**

The bootstrap token is verified but never consumed from the database. The code comment explicitly says "remains valid for the lifetime of the server process." This was an intentional design choice (so QR code works for browser + PWA) but creates a massive attack surface.

**Attack**: If the QR code or URL is ever intercepted (shoulder surfing, screenshot, shared screen, proxy logs), the attacker has permanent access until the server is restarted.

**Consequence**: Bootstrap token = permanent credential. Anyone who sees it once has shell access forever.

**Fix**:
1. Make bootstrap token single-use: delete hash from DB after first successful JWT exchange
2. Add 15-minute expiration timestamp to bootstrap tokens
3. Provide a server-side mechanism to regenerate the token (e.g., press Enter in terminal to get a new QR)
4. For multi-device scenario: after first auth, use JWT to authorize additional devices via a "pair device" flow

---

### C3: Real ngrok Authtoken in `.env` File

**File**: `.env` (line 4)
**Risk**: **Credential leak on first git push**

The `.env` file contains a live ngrok authtoken: `3AuFciqatO7I4kMGYBdxZBFjz6s_...`. While `.gitignore` includes `.env`, git hasn't been initialized yet. Any mistake during the first `git init` + push could expose this.

**Consequence**: Attacker can create ngrok tunnels using your account, potentially phishing or impersonating clsh infrastructure.

**Fix**:
1. Rotate the ngrok authtoken at https://dashboard.ngrok.com immediately
2. Move secrets to `.env.local` (also gitignored, but adds a layer)
3. Add a pre-commit hook that rejects `.env` / `.env.local` files
4. Triple-verify `.gitignore` before first `git init`

---

### C4: No Origin Check on WebSocket Upgrade

**File**: `packages/agent/src/server.ts` (line 81), `packages/agent/src/ws-handler.ts` (line 53)
**Risk**: **Cross-Site WebSocket Hijacking (CSWSH)**

The `WebSocketServer` is created without a `verifyClient` callback. No origin header is checked on upgrade requests. If a JWT is leaked (via URL, logs, or XSS), a malicious website can establish a cross-origin WebSocket connection.

**Attack**: Attacker crafts a malicious webpage. If victim visits it while having a clsh JWT in their browser, the page can open a WebSocket to the clsh server.

**Consequence**: Cross-origin terminal hijacking.

**Fix**: Add origin validation to WebSocket server:
```typescript
const wss = new WebSocketServer({
  server: httpServer,
  verifyClient: (info) => {
    const origin = info.origin || info.req.headers.origin;
    if (!origin) return true; // Non-browser clients (CLI)
    return ALLOWED_ORIGINS.has(origin);
  },
});
```

---

## HIGH Findings

### H1: CORS Allows All Origins (Wildcard `*`)

**File**: `packages/agent/src/server.ts` (lines 33-43)
**Risk**: Any website can make API calls to the clsh agent

The server sets `Access-Control-Allow-Origin: *`. Combined with C1 (magic-link bypass), any website can obtain a JWT. Even after C1 is fixed, wildcard CORS is overly permissive for a remote shell tool.

**Fix**: Restrict to known origins (localhost, ngrok domains, tunnel domains). Maintain a dynamic allowlist that includes the current tunnel URL.

---

### H2: No Rate Limiting on Auth Endpoints

**File**: `packages/agent/src/server.ts` (lines 92-117)
**Risk**: Brute-force and DoS on auth system

No rate limiting on `/api/auth/bootstrap`, `/api/auth/magic-link`, or SSE endpoints. While the 256-bit token can't be brute-forced computationally, this enables:
- Resource exhaustion from mass JWT generation
- DoS via rapid auth requests

**Fix**: Add `express-rate-limit` middleware. 10 auth attempts per 15 minutes.

---

### H3: No WebSocket Message Size Limit

**File**: `packages/agent/src/server.ts` (line 81)
**Risk**: Memory exhaustion / server crash

The `ws` library defaults to 100MB max payload. An authenticated attacker can send enormous messages to OOM the server.

**Fix**: Set `maxPayload: 64 * 1024` (64KB) on WebSocketServer.

---

### H4: No Session Creation Limit (Fork Bomb Risk)

**File**: `packages/agent/src/ws-handler.ts` (lines 143-216)
**Risk**: Process table / memory exhaustion

An authenticated client can create unlimited PTY sessions. Each spawns a real process (zsh, claude, tmux). No limit is enforced.

**Fix**: Add `MAX_SESSIONS = 8` check in `PTYManager.create()`.

---

### H5: JWT Passed in WebSocket URL Query String

**File**: `packages/web/src/lib/ws-client.ts` (lines 59-69)
**Risk**: JWT leaks via logs, browser history, referrer headers

The JWT is set as a URL query parameter (`?token=xxx`). Query strings are logged by proxies, visible in browser history, and sent in Referer headers. For a remote shell tool, JWT leakage = machine compromise.

**Fix**: Authenticate via first WebSocket message instead of query string:
```typescript
// Client: send auth as first message
ws.onopen = () => ws.send(JSON.stringify({ type: 'auth', token }));
// Server: validate first message, reject if invalid
```

---

### H6: Bootstrap Token in URL (Logged/Cached)

**File**: `packages/agent/src/tunnel.ts` (line 143)
**Risk**: Token persists in browser history, proxy logs, ngrok dashboard

The bootstrap token is embedded as `?token=xxx` in the QR code URL and printed to the terminal console. Even after client-side URL cleanup, the token exists in logs.

**Fix**: Use URL hash fragment (`#token=xxx`) instead — fragments are not sent to servers or logged by proxies. Combined with C2 fix (single-use tokens), this limits the exposure window.

---

### H7: No Validation on Resize Dimensions

**File**: `packages/agent/src/ws-handler.ts` (lines 323-336), `packages/agent/src/pty-manager.ts` (lines 382-388)
**Risk**: Memory exhaustion or crash via malicious resize

No bounds checking on `cols` and `rows`. Sending `cols: 999999` could exhaust memory in terminal buffer allocation. Zero or negative values may crash node-pty.

**Fix**: Clamp values: `cols = Math.max(1, Math.min(500, Math.floor(cols)))`, same for rows (max 200).

---

### H8: JWT Stored in localStorage (XSS-Accessible)

**File**: `packages/web/src/hooks/useAuth.ts` (lines 19-20, 94-98)
**Risk**: Any XSS vulnerability = stolen JWT = shell access

localStorage is accessible to all JavaScript on the same origin. The JWT has an 8-hour expiry, giving an attacker an 8-hour shell access window from a single XSS.

**Fix**:
- Reduce JWT expiry to 1-2 hours
- Consider sessionStorage (clears on tab close) — note: breaks PWA persistence
- Implement server-side session revocation
- Add Content-Security-Policy header to mitigate XSS

---

### H9: SSE Endpoint Has No Authentication

**File**: `packages/agent/src/sse-handler.ts` (lines 48-87)
**Risk**: JWT interception during auth flow

The SSE endpoint `/api/sse/events/:pendingId` delivers JWTs to anyone who knows the `pendingId`. Since `pendingId` is client-provided, an attacker can listen for JWTs being issued.

**Fix**: Generate `pendingId` server-side (return from magic-link endpoint). Use cryptographically random UUIDs. Already has 5-minute expiry (good).

---

## LOW Findings

### L1: `dangerouslySetInnerHTML` Usage

**File**: `packages/web/src/components/SessionCard.tsx` (lines 115-119)
**Risk**: XSS if terminal sanitization is ever bypassed. Currently safe — `escHtml()` covers `&`, `<`, `>`.
**Fix**: Add DOMPurify as defense-in-depth. Document the security invariant.

### L2: SSH Tunnel Disables Host Key Checking

**File**: `packages/agent/src/tunnel.ts` (lines 41-47)
**Risk**: MITM on SSH tunnel to localhost.run. Mitigated by HTTPS on the public URL.
**Fix**: Pin the localhost.run host key.

### L3: Local Mode Uses Plain HTTP

**File**: `packages/agent/src/tunnel.ts` (lines 118-119)
**Risk**: Wi-Fi sniffing of terminal traffic (including passwords, SSH keys).
**Fix**: Warn users prominently. Consider self-signed TLS for local mode.

### L4: Sensitive Env Var Blocklist Incomplete

**File**: `packages/agent/src/pty-manager.ts` (lines 19-24)
**Risk**: `AWS_*`, `GH_TOKEN`, `GITHUB_TOKEN`, `NPM_TOKEN`, `CLOUDFLARE_*` not stripped from PTY env.
**Fix**: Use regex patterns: `/^NGROK_/`, `/^AWS_/`, `/^GH_/`, `/^GITHUB_/`, `/^NPM_/`, `/^CLOUDFLARE_/`.

### L5: No `express.json()` Body Size Limit

**File**: `packages/agent/src/server.ts` (line 44)
**Risk**: Express defaults to 100KB which is fine, but explicit is better.
**Fix**: `app.use(express.json({ limit: '16kb' }))`.

### L6: No Security Headers

**File**: `packages/agent/src/server.ts`
**Risk**: No CSP, X-Frame-Options, X-Content-Type-Options. Clickjacking and MIME sniffing possible.
**Fix**: Add security headers middleware (or use `helmet` package).

### L7: WS Message Parsing Lacks Schema Validation

**File**: `packages/agent/src/ws-handler.ts` (lines 29-39)
**Risk**: `as ClientMessage` cast doesn't validate required fields per type.
**Fix**: Add per-type field validation (or use Zod).

### L8: No Audit Logging

**File**: All server files
**Risk**: No logging of auth attempts, session creation, or WS connections. Can't detect unauthorized access.
**Fix**: Add structured logging for all security-relevant events.

---

## Open Source Readiness Issues (Non-Security)

| Issue | Status | Impact |
|-------|--------|--------|
| README images missing | 5 PNGs referenced in `docs/images/` but folder is empty | Broken README on GitHub |
| CHANGELOG.md missing | No version history | Expected for v0.0.1 launch |
| package.json metadata | Missing `repository`, `homepage`, `keywords`, `author` | npm discoverability |
| security@clsh.dev email | Referenced in SECURITY.md but may not exist | Broken disclosure process |

---

## Existing Security Doc Discrepancies

The existing [[Security]] doc (06_Legal) claims these protections exist:
- "Bootstrap token — one-time use" → **FALSE** — token is reusable (see C2)
- "Rate limiting — 5 attempts / 15 min" → **FALSE** — not implemented (see H2)
- "Single connection — One active session at a time" → **FALSE** — no limit (see H4)
- "Idle timeout — 30 min auto-disconnect" → **FALSE** — no idle timeout exists
- "httpOnly secure SameSite=Strict cookies" → **FALSE** — JWT is in localStorage, not cookies (see H8)

These claims must be either implemented or removed from documentation.

---

## Priority Fix Order

### Before Making Repo Public (BLOCKING)
1. **C1** — Disable magic-link + verify endpoints (5 min)
2. **C2** — Make bootstrap token single-use + add expiry (30 min)
3. **C3** — Rotate ngrok authtoken, verify .gitignore (10 min)
4. **H1** — Restrict CORS origins (15 min)
5. **C4** — Add WebSocket origin checking (15 min)

### Before Launch Day
6. **H4** — Add session creation limit (10 min)
7. **H3** — Set WebSocket maxPayload (5 min)
8. **H7** — Validate resize dimensions (10 min)
9. **H2** — Add rate limiting (20 min)
10. **H5** — Move JWT from URL query to first WS message (45 min)
11. **H9** — Authenticate SSE endpoint (15 min)
12. **H6** — Use hash fragment for bootstrap token URL (10 min)
13. **L6** — Add security headers (10 min)

### Post-Launch Hardening
14. **H8** — Reduce JWT expiry + add revocation
15. **L4** — Expand env var blocklist to regex patterns
16. **L1** — Add DOMPurify for terminal snapshots
17. **L7** — Add Zod schema validation for WS messages
18. **L8** — Add audit logging

### Non-Security Launch Blockers
19. Add missing README images to `docs/images/`
20. Create CHANGELOG.md
21. Add package.json metadata
22. Fix Security.md documentation discrepancies
