---
title: Handoff — 2026-03-16
tags: #handoff #clsh
date: 2026-03-16
session_number: 34
---

# Handoff — 2026-03-16 (Session 34)

## What Was Done

- **All critical + high security fixes landed** (Steps 4.1a + 4.1b COMPLETE)
  - C2: Single-use bootstrap token (5-min TTL, consumed after JWT exchange)
  - C4: WebSocket origin checking with dynamic `allowedOrigins` (localhost + local network IP + tunnel URL)
  - H1: CORS restricted to dynamic allowlist (no more wildcard `*`)
  - H2: Rate limiting on `/api/auth/bootstrap` (10 req / 15 min, express-rate-limit)
  - H3: WS maxPayload 64KB
  - H5: JWT sent as first WS message (not in URL query string)
  - H6: Bootstrap token in URL hash fragment (not sent to servers)
  - H7: Resize validation (cols/rows clamped to safe ranges)
  - H9: SSE endpoint removed entirely
  - L5: Body size limit 16KB
  - L6: Security headers (X-Frame-Options, CSP, etc.)
- **Animated CLSH splash screen** (`SplashScreen.tsx`): ASCII logo reveal with staggered line animation, shimmer loop, 300ms fade-out. Gates app rendering in `App.tsx`.
- **Mobile auth simplified to QR-only**: Removed token paste input, keyboard, and Connect button on mobile. Desktop auth screen unchanged.
- **Token hidden from terminal output**: Removed raw token line from `tunnel.ts` printout. Token only embedded in QR code.
- **QR Scanner iOS fix**: Changed `getUserMedia` to use `ideal: 'environment'` constraint with fallback to `video: true`.
- **WebSocket origin fix for local network**: Added `getLocalIP()` in `server.ts` to detect local IP, allowing phones on same Wi-Fi to connect.
- **iOS Safari replaceState fix**: `window.history.replaceState` throws in PWA standalone mode on iOS. Wrapped both calls in try/catch in `useAuth.ts`.
- **Connection status banner**: GridView shows orange "Reconnecting to server..." or red "Disconnected" banner with pulse-dot animation.
- **Bug fixes**: Black screen after splash animation, stuck loader on auth, Express trust proxy error, PWA install banner showing during auth, Enter key triggering QR regen, white flash between splash and content, pencil icon sizing, dual-instance port conflicts.
- **PRs #17-#22 merged**: Consolidated stacked PRs #17-#20 into single PR #21 for clean merge. PR #22 for version bumps.
- **npm published**: clsh-dev@0.1.7, @clsh/agent@0.0.6, @clsh/web@0.0.3

## Steps Completed
- Step 4.1a: Critical Security Fixes — **COMPLETE** (all 5 tasks checked)
- Step 4.1b: Security Hardening — **COMPLETE** (all 9 tasks checked)

## Execution Plan Progress
- **Overall**: 88% (21/24 steps complete)
- **Current Phase**: Phase 4 — Security Hardening + Launch

## Now Unblocked
- Step 4.2 (Launch Day) is **partially unblocked** — still blocked by Step 4.1c (3 remaining tasks)

## What's Next
1. **Finish Step 4.1c** (3 remaining tasks):
   - Fix `06_Legal/Security/Security.md` — update claims to match reality (one-time tokens now true, rate limiting now true, but still uses localStorage not httpOnly cookies)
   - Verify `security@clsh.dev` email works OR update SECURITY.md contact to personal email
   - Run `npm audit` and fix any vulnerable dependencies
2. **Step 4.2: Launch Day** — Post on HN, Product Hunt, Reddit, X, Instagram, Dev.to. Monitor Discord + GitHub.

## Open Questions
- `security@clsh.dev` email: Cloudflare email routing needs to be set up, or update SECURITY.md to use a personal email address
- Should we re-publish npm after Step 4.1c completes? (Only if code changes are involved, like npm audit fixes)

## Files Updated (Code)
- `packages/web/src/components/SplashScreen.tsx` — **NEW** (splash screen)
- `packages/web/src/components/QRScanner.tsx` — iOS getUserMedia fix
- `packages/web/src/components/AuthScreen.tsx` — Mobile QR-only layout
- `packages/web/src/components/GridView.tsx` — Connection status banner
- `packages/web/src/App.tsx` — Splash screen gate, wsStatus passthrough
- `packages/web/src/hooks/useAuth.ts` — replaceState try/catch
- `packages/web/src/lib/types.ts` — wsStatus prop on GridViewProps
- `packages/web/src/lib/ws-client.ts` — WS close/error logging
- `packages/web/src/index.css` — pulse-dot keyframe
- `packages/web/vite.config.ts` — changeOrigin on proxy
- `packages/agent/src/server.ts` — getLocalIP(), WS origin logging, dynamic origins
- `packages/agent/src/index.ts` — webPort passthrough
- `packages/agent/src/tunnel.ts` — Token line removed
- `packages/cli/package.json` — Version bumps

## Files Updated (Vault)
- `Execution-Plan.md` — Steps 4.1a, 4.1b marked COMPLETE; Progress Summary updated to 88%
- `VAULT-INDEX.md` — Department status, progress, npm versions, latest handoff
- `01_RnD/RnD.md` — Session 34 summary
- `Handoffs/handoff-2026-03-16-session34.md` — This file
