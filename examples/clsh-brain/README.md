# clsh-brain

> The Obsidian vault that powered building [clsh.dev](https://clsh.dev) from zero to viral in 6 days.

## the problem

Every time you start a new Codex session, it forgets everything. Your architecture decisions, your product roadmap, which bugs you fixed yesterday, what's left on the sprint. You spend the first 10 minutes of every session re-explaining context that existed 30 minutes ago.

I got tired of it.

## the solution

I turned an Obsidian vault into a persistent brain for Codex. Not a prompt template. Not a system message. A full company structure with departments, execution plans, agent personas, and workflow commands, all wired into Codex via `AGENTS.md`, repo notes, and `brain-tree-os`.

The result: 34 sessions across 6 days. Zero context loss between any of them. Codex picked up exactly where it left off every single time.

This is that vault.

## vault structure

```
clsh-brain/
├── Agents/               # 7 AI agent personas (rnd-lead, backend-engineer, etc.)
├── Commands/             # Example workflow command prompts and notes
├── 00_Company/           # Identity, vision, mission
├── 01_RnD/               # Architecture decisions, frontend, backend, infra, devops
├── 02_Product/           # MVP definition, roadmap, features, UI spec
├── 03_Marketing/         # Social media, content, GTM, branding, SEO
├── 04_Community/         # Discord setup, GitHub community, growth
├── 05_Business/          # Competitors, market intel
├── 06_Legal/             # Licensing, privacy, security
├── Handoffs/             # Session handoff notes (context transfer between sessions)
├── Templates/            # Reusable note templates
├── AGENTS.md             # Main agent instructions (Codex reads this automatically)
├── Execution-Plan.md     # Step-by-step build plan with dependencies + parallel groups
└── VAULT-INDEX.md        # Navigation hub for the entire vault
```

## the workflow commands

The Codex-friendly workflow is:

| Command | What it does |
|---------|-------------|
| `brain-tree-os resume` | Reads execution plan + latest handoff, then tells Codex what files to load first |
| `brain-tree-os wrap-up` | Creates the next handoff template and keeps session continuity explicit |
| `brain-tree-os plan [step]` | Creates a linked planning note for a specific execution-plan step |
| `brain-tree-os sprint` | Creates a sprint note from ready and in-progress work |
| `brain-tree-os status` | Shows the current brain or all registered brains |
| `brain-tree-os sync` | Audits graph health, broken links, and disconnected notes |
| `brain-tree-os feature [name]` | Creates a linked feature spec note |
| Codex `/plan` | Turns one of the created notes into an in-chat implementation plan |

## agent personas

Seven agent personas in `Agents/`, each specialized for their domain:

| Agent | Role |
|-------|------|
| `rnd-lead` | Technical architecture, coordinates all engineers |
| `backend-engineer` | Node.js, WebSocket, PTY management, auth |
| `frontend-engineer` | React, xterm.js, mobile UI, keyboard system |
| `devops-engineer` | CI/CD, GitHub Actions, Cloudflare, npm publishing |
| `product-manager` | MVP scope, roadmap, feature specs, sprint planning |
| `marketing-lead` | Content, social media, GTM, SEO, branding |
| `community-lead` | Discord, GitHub community, contributor onboarding |

Each persona knows its vault section, responsibilities, and technical context. When you spawn agents for parallel work, they stay in their lane.

## parallel execution

The execution plan supports spawning multiple agents to work simultaneously:

```
                    ┌─────────────────────────────────────┐
                    │          /resume identifies          │
                    │        unblocked parallel steps      │
                    └──────────────┬──────────────────────┘
                                   │
                    ┌──────────────┴──────────────────────┐
                    │          TeamCreate + TaskCreate      │
                    │       (one task per parallel step)    │
                    └──────────────┬──────────────────────┘
                                   │
              ┌────────────────────┼────────────────────┐
              │                    │                     │
     ┌────────┴────────┐ ┌────────┴────────┐ ┌─────────┴───────┐
     │  backend-engineer│ │frontend-engineer│ │  devops-engineer │
     │  (worktree: be)  │ │ (worktree: fe)  │ │  (worktree: ops) │
     │                  │ │                 │ │                  │
     │  Step 1.2:       │ │  Step 2.1:      │ │  Step 3.1:       │
     │  Backend Core    │ │  UI Components  │ │  CI Pipeline     │
     └────────┬─────────┘ └────────┬────────┘ └─────────┬───────┘
              │                    │                     │
              └────────────────────┼─────────────────────┘
                                   │
                    ┌──────────────┴──────────────────────┐
                    │     Leader merges worktrees          │
                    │     Updates Execution-Plan.md        │
                    └─────────────────────────────────────┘
```

Each agent works in an isolated git worktree so they don't conflict. The leader merges everything back when they're done.

## the results

- **34 sessions** across 6 days (March 12-17, 2026)
- **92% complete** (23/25 execution plan steps)
- Full monorepo with 4 packages (agent, web, cli, landing)
- Published to npm (`npx clsh-dev`)
- Launched on all social platforms
- Reddit post went viral on r/Codex
- Phone-first terminal with custom keyboard, 6 skins, tmux persistence
- All security audit findings (4 critical, 9 high) resolved

## how to use this for YOUR project

1. **Clone this repo** into your project workspace
2. **Edit `AGENTS.md`** with your project's description, tech stack, and context
3. **Edit `VAULT-INDEX.md`** with your project's departments and status
4. **Edit `Execution-Plan.md`** with your build steps, dependencies, and parallel groups
5. **Customize the agents** in `Agents/` for your team structure
6. **Start a Codex session** in the vault directory
7. **Run `brain-tree-os resume`** to see what to read next
8. **End every session with `brain-tree-os wrap-up`** to preserve context

The key insight: `AGENTS.md`, the execution plan, and the folder indexes give Codex a repeatable context path. The entire vault becomes Codex's persistent memory.

## what's next

We're building something bigger. A platform that generates these brains automatically, lets you visualize them as interactive graphs, and integrates directly with Codex via MCP.

It's called [neurotree.ai](https://neurotree.ai). Sign up for early access.

## links

- [clsh.dev](https://clsh.dev) - the tool built with this brain
- [clsh on GitHub](https://github.com/my-codex-utils/clsh) - the source code
- [Blog: I gave Codex a brain](https://dev.to/nadav_avisrur/i-gave-codex-code-a-brain-heres-what-happened-3304) - the full story
- [neurotree.ai](https://neurotree.ai) - the platform (coming soon)
