---
title: Security
tags: #clsh #legal #security
created: 2026-03-12
updated: 2026-03-16
---

# Security — clsh.dev

Security policy and threat model for exposing terminals via public URLs.

## Threat Model

Exposing a terminal via public ngrok URL = **full machine access**. Security must be defense-in-depth.

## Security Layers — Current State

> Last updated: 2026-03-16 (post Steps 4.1a + 4.1b hardening).
> See [[Security-Audit]] for full findings and fix details.

| # | Layer | Status | Notes |
|---|-------|--------|-------|
| 1 | **ngrok HTTPS** — Encrypted transport, random URL | FIXED | Working |
| 2 | **Bootstrap token** — 256-bit entropy, SHA-256 hashed, single-use, 5-min TTL | FIXED | Single-use + expiry (C2 resolved) |
| 3 | **JWT sessions** — 8h expiry, sent as first WS message (not URL) | FIXED | JWT in localStorage (H8 deferred to post-launch; httpOnly cookies planned) |
| 4 | **Rate limiting** — 5 attempts / 15 min on auth endpoints | FIXED | express-rate-limit (H2 resolved) |
| 5 | **Session limit** | DEFERRED | Low priority for single-user product (H4) |
| 6 | **Env sanitization** — Strip secrets from PTY env | FIXED | Blocklist covers NGROK, common secrets |
| 7 | **Idle timeout** — 30 min auto-disconnect | NOT IMPLEMENTED | Low priority |
| 8 | **CORS restriction** — Dynamic allowlist (localhost, tunnel domains, local IP) | FIXED | H1 resolved |
| 9 | **WebSocket origin check** — verifyClient callback validates origin | FIXED | C4 resolved |
| 10 | **Magic link verification** | REMOVED | Endpoints disabled (return 501). Bootstrap token is the sole auth method (C1 resolved) |
| 11 | **WS message size limit** — 64KB maxPayload | FIXED | H3 resolved |
| 12 | **Resize validation** — Cols/rows clamped to safe ranges | FIXED | H7 resolved |
| 13 | **Security headers** — CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy | FIXED | L6 resolved |
| 14 | **Body size limit** — express.json 16KB | FIXED | L5 resolved |
| 15 | **Bootstrap token in hash fragment** — Not sent to servers/proxies | FIXED | H6 resolved |
| 16 | **SSE endpoint** | REMOVED | Was unauthenticated, now fully removed (H9 resolved) |

## Known Limitations (Post-Launch Hardening)

| Item | Risk | Mitigation | Plan |
|------|------|------------|------|
| JWT in localStorage (H8) | XSS = stolen JWT = shell access | CSP headers mitigate XSS; 8h expiry limits window | Migrate to httpOnly cookies post-launch |
| No session limit (H4) | Authenticated user could spawn unlimited PTYs | Single-user product; low risk | Add MAX_SESSIONS limit if needed |
| No idle timeout | Sessions stay open indefinitely | User controls their own machine | Implement if resource issues arise |
| No audit logging (L8) | Can't detect unauthorized access after the fact | Bootstrap token is single-use, limiting attack window | Add structured logging post-launch |
| Env blocklist incomplete (L4) | Some env vars (AWS_*, GH_TOKEN) not stripped | Only affects PTY sessions user already controls | Expand to regex patterns |

## Resolved Vulnerabilities

All critical (C1-C4) and high (H1-H3, H5-H7, H9) findings from the [[Security-Audit]] have been fixed.

| ID | Finding | Resolution |
|----|---------|------------|
| C1 | Magic link issues JWTs without verification | Endpoints removed (return 501) |
| C2 | Bootstrap token never invalidated | Single-use + 5-min TTL |
| C3 | ngrok authtoken in .env | .gitignore verified, pre-commit hook rejects .env |
| C4 | No WebSocket origin check | verifyClient with dynamic allowlist |
| H1 | CORS wildcard | Dynamic origin allowlist |
| H2 | No rate limiting | express-rate-limit on auth endpoints |
| H3 | No WS message size limit | 64KB maxPayload |
| H5 | JWT in URL query string | JWT sent as first WS message |
| H6 | Bootstrap token in URL path | Moved to hash fragment |
| H7 | No resize validation | Cols/rows clamped |
| H9 | SSE endpoint unauthenticated | Endpoint removed entirely |
| L5 | No body size limit | 16KB limit |
| L6 | No security headers | Full security header middleware |

## Responsible Disclosure Policy

- Contact: security@clsh.dev
- Response SLA: 48h acknowledge, 7d triage
- Scope: auth bypass, token leaks, XSS, env variable exposure, command injection
- See `SECURITY.md` in the repo for full policy details

## TODO

- [x] Write SECURITY.md for the repo
- [x] Complete all C1-C4 critical fixes (Step 4.1a)
- [x] Complete all H1-H9 hardening fixes (Step 4.1b, except H4/H8 deferred)
- [x] Run `npm audit` — 0 vulnerabilities (2026-03-16)
- [ ] Set up security@clsh.dev email routing (or update SECURITY.md to use personal email)
- [ ] Enable GitHub security advisories
