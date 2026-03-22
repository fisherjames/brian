---
title: DevOps
tags: #clsh #rnd #devops
created: 2026-03-12
---

# DevOps — clsh.dev

CI/CD, GitHub Actions, deployment pipelines, and development environment.

## Git Workflow (PR-Based)

**All changes go through Pull Requests.** No direct pushes to main, even from maintainers.

```
main (protected — PRs only, CI required)
  └── fix/lid-close-docs     → PR #5  → squash merge → main
  └── docs/setup-flow-gif    → PR #6  → squash merge → main
  └── feat/npx-clsh          → PR #7  → squash merge → main  (npx clsh-dev quickstart)
  └── chore/npm-pipeline     → PR #8  → squash merge → main  (video assets)
  └── chore/npm-pipeline-2   → PR #9  → squash merge → main  (npm pipeline)
  └── fix/bin-name           → PR #10 → squash merge → main  (clsh-dev bin name)
  └── fix/stale-npx-ref      → PR #11 → squash merge → main  (stale refs + video)
```

**Branch protection rules (main):**
- PRs required (0 approvals needed for solo maintainer)
- Enforced for admins (owner can't bypass)
- CI must pass: `Lint, Typecheck, Build (Node 20)` + `(Node 22)`
- Linear history required (no merge commits)
- No force pushes, no branch deletion

**Merge settings:**
- Squash merge only (one clean commit per PR)
- PR title becomes commit message, PR body becomes commit body
- Branches auto-deleted after merge

**How to push code:**
```bash
git checkout -b fix/something       # create feature branch
# ... make changes ...
git add <files> && git commit       # commit locally
git push -u origin fix/something    # push branch
gh pr create --title "Fix something" # create PR
# CI runs → review → squash merge → branch auto-deleted
# Then locally:
git checkout main && git pull && git branch -d fix/something
```

## Versioning

- **Semantic versioning**: `v0.1.0`, `v0.2.0`, etc. (pre-1.0, breaking changes allowed)
- **GitHub Releases**: Each milestone gets a tagged release with changelog
- **First release**: `v0.1.0` (2026-03-15) — all shipped features

## CI Pipeline

- **GitHub Actions**: lint + typecheck + build on every PR
- **Matrix**: Node.js 20 and 22
- **Check names**: `Lint, Typecheck, Build (Node 20)` and `Lint, Typecheck, Build (Node 22)`

## Deployment

- **Landing page**: Cloudflare Pages (static HTML from `apps/landing`)
- **npm package**: semantic-release for versioned publishes (future)
- **Domain**: clsh.dev via Cloudflare (NS delegation from Squarespace)

## Workflows

| Workflow | Trigger | Action |
|----------|---------|--------|
| `ci.yml` | PR to main | lint, typecheck, build |

## Current State

**OSS workflow active.** PR-based development with squash merge. `v0.1.0` released. `clsh.dev` is live on Cloudflare Pages via direct upload (wrangler). NS delegated from Squarespace to Cloudflare (bonnie + carter.ns.cloudflare.com). SSL working. **npm packages published**: `@clsh` org, 3 packages (clsh-dev@0.1.2, @clsh/web@0.0.2, @clsh/agent@0.0.1). 11 PRs merged through CI workflow.

## Cloudflare Setup

- **Pages project**: `clsh-dev` (account: your-email@example.com)
- **Deploy method**: `npx wrangler pages deploy apps/landing --project-name clsh-dev` (direct upload, no GitHub yet)
- **Custom domain**: clsh.dev added via Cloudflare API
- **Staging URL**: https://clsh-dev.pages.dev

## npm Publishing

- **npm org**: `@clsh` on npmjs.com (account: clsh.dev)
- **Packages**:
  - `clsh-dev@0.1.2` — CLI entry point (`npx clsh-dev` to start, `npx clsh-dev setup` for ngrok wizard)
  - `@clsh/web@0.0.2` — Web frontend (React + xterm.js + Tailwind)
  - `@clsh/agent@0.0.1` — Backend agent (Express + ws + node-pty)
- **Token**: Granular access token with "Allow automation" (bypass 2FA), stored in `~/.npmrc`
- **Publishing flow**: `npm publish` from each package directory (no semantic-release yet)
- **Gotcha**: npm rejected `clsh` package name ("too similar to clsx, cli, slash") — used `clsh-dev` instead
- **Gotcha**: bin field must match package name for `npx` to work (bin: `"clsh-dev"`, not `"clsh"`)

## TODO

- [x] Set up GitHub repository with branch protection
- [x] Create CI workflow (lint, typecheck, build, test)
- [x] Configure Cloudflare Pages for landing page
- [ ] Wire GitHub → Cloudflare Pages auto-deploy on push
- [x] Set up www.clsh.dev → clsh.dev redirect
- [ ] Enable Cloudflare Web Analytics
- [x] Publish npm packages (@clsh org + clsh-dev CLI)
- [ ] Set up semantic-release for automated npm publishing

## Session 19 (2026-03-14) — Git Push + OSS Prep

- **Git initialized**: Local user `my-claude-utils <your-org-email@example.com>`, pushed to `my-claude-utils/clsh`
- **Branch protection**: PRs required (enforce admins), CI required (`Lint, Typecheck, Build` Node 20+22), linear history, no force push, no branch delete
- **Repo settings**: Wiki disabled, squash merge only (PR title as commit), auto-delete merged branches, 10 topics
- **First release**: `v0.1.0` (2026-03-15)
- **CI fixed**: Lockfile regenerated for @clsh/cli rename, lint errors fixed (control-regex, non-null assertions, missing react plugin rules)
- **Dependabot**: 4 auto-PRs opened and closed (will reopen after CI fix)
- **Landing page removed from repo**: `apps/landing/` gitignored, deployed separately to Cloudflare
- **.gitignore hardened**: Added *.mp4, *.mov, apps/demo-video/, apps/landing/
