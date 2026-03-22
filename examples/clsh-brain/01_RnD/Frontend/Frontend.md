---
title: Frontend Architecture
tags: #clsh #rnd #frontend
created: 2026-03-12
updated: 2026-03-13
---

# Frontend Architecture — clsh.dev

#rnd

React + Vite + xterm.js frontend. Phone-first: Grid View → Terminal View with MacBook keyboard. Desktop secondary: MacBook Pro frame with three-pane layout.

See [[UI-Spec]] for all exact colors, measurements, and interaction specs derived from the mockups.

---

## Tech Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| Framework | React 18 + TypeScript strict | Hooks-first, no class components |
| Build | Vite 6 + HMR | WebSocket proxy to backend at localhost:4030 |
| Terminal | xterm.js v5.5+ | WebGL renderer, FitAddon, WebLinksAddon |
| Styling | Tailwind CSS v4 + CSS custom properties | Design tokens via CSS vars |
| Font | JetBrains Mono | Must await load before terminal.open() |
| State | React context + custom hooks | No external state manager — complexity doesn't warrant it |
| PWA | Vite PWA plugin | Service worker, offline shell, iOS meta tags |

---

## Mobile UI Architecture (Phase 5 Redesign)

The existing `MobileLayout.tsx` with tab-switching is replaced entirely. The new architecture has two distinct views with a shared navigation model.

### View Model

```
AppShell
 ├── [view === 'grid']     → GridView
 └── [view === 'terminal'] → TerminalView
       ├── TitleBar
       ├── TabBar
       ├── TerminalPane (xterm.js)
       ├── ContextStrip  (touchbar row)
       └── [skin === 'ios-terminal'] → IOSKeyboard
           [else]                    → MacBookKeyboard
             └── [skin] → iOSTerminal (default) | MacBookSilver | GamerRGB | CustomPainted | AmberRetro | IceWhite
```

Navigation is a simple controlled state variable: `'grid' | 'terminal'`. No router needed — this is a single-session app. Transition: tap session card → terminal view. Tap the "⊞ grid" button in title bar → back to grid.

### Layout Constraints

The phone layout must fill `100dvh` (dynamic viewport height — accounts for iOS Safari chrome). The keyboard fills a fixed region at the bottom; the terminal fills the remaining space. A CSS grid with `grid-template-rows` handles this without JS measurement:

```
100dvh
┌────────────────────┐  ← TitleBar      (44px fixed)
│  Title Bar         │
├────────────────────┤  ← TabBar        (36px fixed)
│  Tab Bar           │
├────────────────────┤
│                    │  ← Terminal      (1fr — fills remaining)
│  xterm.js          │
│                    │
├────────────────────┤  ← ContextStrip  (48px fixed)
│  Context Strip     │
├────────────────────┤  ← Keyboard      (calc based on key rows)
│  MacBook Keyboard  │    ~256px (5 key rows × 35.5px + gaps + padding)
└────────────────────┘
```

---

## Component Tree — Full

### App Level

```
App.tsx
 ├── AppProvider (context: sessions, activeSession, view, skin)
 ├── AuthScreen.tsx          (shown before auth completes)
 └── AppShell.tsx
      ├── [isMobile] → MobileApp.tsx
      └── [isDesktop] → DesktopApp.tsx
```

### Mobile App

```
MobileApp.tsx
 ├── GridView.tsx            (view === 'grid')
 │    ├── GridHeader.tsx
 │    │    ├── Logo ("CLSH" + sessions badge)
 │    │    └── GridActions (grid-icon | plus-icon)
 │    ├── SessionGrid.tsx
 │    │    ├── SessionCard.tsx × N
 │    │    │    ├── TrafficLights.tsx
 │    │    │    ├── SessionBadge.tsx (RUN | IDLE)
 │    │    │    ├── MiniTerminalPreview.tsx
 │    │    │    └── ExpandArrow.tsx
 │    │    └── NewSessionCard.tsx (dashed + icon)
 │    └── TmuxStatusBar.tsx
 │         ├── SessionTab.tsx × N  (active = green)
 │         └── RemoteLocation.tsx
 │
 └── TerminalView.tsx         (view === 'terminal')
      ├── TitleBar.tsx
      │    ├── TrafficLights.tsx
      │    ├── SessionTitle.tsx ("name — cwd — 80×32")
      │    └── GridButton.tsx ("⊞ grid" — navigates back)
      ├── TabBar.tsx
      │    ├── SessionTab.tsx × N  (numbered: 0, 1, 2…)
      │    └── RemoteIndicator.tsx
      ├── TerminalPane.tsx    (xterm.js, flex-1)
      ├── ContextStrip.tsx    (touchbar replacement)
      │    ├── ContextKey.tsx × N
      │    └── Separator.tsx
      └── MacBookKeyboard.tsx
           ├── KeyboardRow.tsx × 6
           │    └── Key.tsx × N
           └── SkinProvider (applies skin CSS vars)
```

### Desktop App

```
DesktopApp.tsx
 └── MacBookFrame.tsx
      ├── MenuBar.tsx
      ├── MacBookScreen.tsx
      │    ├── TerminalPane.tsx (zsh)
      │    ├── TerminalPane.tsx (tmux)
      │    └── ClaudeCodePane.tsx
      ├── NotchIndicator.tsx
      └── TmuxStatusBar.tsx
```

---

## State Management

All state lives in `AppContext`. No Redux or Zustand — the app state is simple enough for React context.

```typescript
interface AppState {
  // Session state
  sessions: Session[];
  activeSessionId: string | null;

  // View state
  view: 'grid' | 'terminal';

  // Keyboard skin
  activeSkin: SkinId;
  customPaintColors: Record<KeyId, string>;  // per-key overrides

  // Connection state
  connectionStatus: 'connecting' | 'connected' | 'disconnected';
  remoteLocation: string | null;  // e.g. "tokyo-1.ngrok.io"
}

type SkinId = 'macbook-silver' | 'ios-terminal' | 'gamer-rgb' | 'custom-painted' | 'amber-retro' | 'ice-white';

interface Session {
  id: string;
  name: string;               // e.g. "api-refactor"
  cwd: string;                // e.g. "~/projects/clsh"
  status: 'run' | 'idle';
  cols: number;               // terminal width
  rows: number;               // terminal height
  previewLines: string[];     // last 3-4 lines for mini preview (stripped ANSI)
}
```

### Custom Hooks

| Hook | Responsibility |
|------|---------------|
| `useTerminal(sessionId)` | xterm.js lifecycle, attach/detach, resize observer |
| `useWebSocket()` | Single WS connection, message routing to sessions |
| `useSessions()` | Session list, create/kill, active session management |
| `useKeyboard(sessionId)` | Key → escape sequence mapping, send to WS |
| `useSkin()` | Active skin, custom paint state, import/export |
| `useAuth()` | Token storage, magic link, SSE listener |
| `useMode()` | 2s WS probe → demo or live mode |
| `useMediaQuery()` | Responsive breakpoints (isMobile / isDesktop) |

---

## New Components — Detailed Specs

### GridView

The initial screen. Shows all sessions as cards in a 2-column grid.

**Responsibilities:**
- Render session cards and "new session" card
- Handle tap → navigate to terminal view with that session active
- Handle "+" button → create new session via WS `create` message
- Display tmux-style status bar at bottom

**Key behavior:** Active session card has a `#00ff87` border glow (`box-shadow: 0 0 0 1.5px #00ff87`).

### SessionCard

Represents one PTY session in the grid.

```
Props:
  session: Session
  isActive: boolean
  onTap: () => void

Layout (10px radius, #111111 bg, 1px #222 border):
┌──────────────────────────────┐
│ ●●● [name]        [RUN|IDLE] │  ← traffic lights + badge
│                               │
│ > git push origin main        │  ← mini terminal preview
│ Counting objects: 12          │    (monospace, 8px, dim green)
│ Writing objects: 100%  ✓      │
│                               │
│                            ↗  │  ← expand arrow (bottom-right)
└──────────────────────────────┘
```

### TitleBar (Terminal View)

Fixed 44px header for the terminal view.

```
Props:
  session: Session
  onGridNavigate: () => void

Layout:
┌─────────────────────────────────────────┐
│ ● ● ●  api-refactor — ~/clsh — 80×32  ⊞ grid │
└─────────────────────────────────────────┘
  ^traffic    ^name — cwd — size          ^back button
  lights
```

### TabBar

Horizontal scrollable tab list below TitleBar.

```
Props:
  sessions: Session[]
  activeId: string
  onSelect: (id: string) => void

Each tab: "0 api-refactor" | "1 ui-comp" | "2 zsh"
Active: #00ff87 text + bottom border
Inactive: #666 text
```

### ContextStrip

The "touchbar" row between terminal and keyboard. 48px tall. Provides quick terminal shortcuts.

```
Layout (left → right):
[ esc ] | [ F1 ] [ F2 ] [ F3 ] [ F5 ] | [ commit ] [ diff ] [ plan ] | [ ==== ]

Separators are visual dividers (1px #333).
Key height: 32px, same styling as keyboard keys but taller container row.
```

**Context keys and their escape sequences:**

| Label | Sends | Notes |
|-------|-------|-------|
| esc | `\x1b` | Escape |
| F1 | `\x1bOP` | |
| F2 | `\x1bOQ` | |
| F3 | `\x1bOR` | |
| F5 | `\x1b[15~` | Refresh in vim, etc. |
| commit | `git commit -m ""` + position cursor | Smart macro |
| diff | `git diff` + Enter | |
| plan | Opens Claude plan mode (custom macro) | Sends configured prefix |
| ==== | `====\n` | Separator in commit messages / notes |

### MacBookKeyboard

The full 6-row keyboard filling the bottom of the phone screen. This is the defining feature of clsh — it must feel like a real MacBook keyboard.

**Key dimensions:**
- Standard key: 32px height, min-width 28px
- Gap between keys: 3.5px
- Border radius: 4px
- Padding between rows: 3.5px
- Left/right padding of keyboard: 6px

**Row layout:**

```
Row 0 (Context Strip — handled by ContextStrip component, not keyboard):
[ esc ] | [ F1 ] [ F2 ] [ F3 ] [ F5 ] | [ commit ] [ diff ] [ plan ] | [ ==== ]

Row 1 (number row):
[ ` ] [ 1 ] [ 2 ] [ 3 ] [ 4 ] [ 5 ] [ 6 ] [ 7 ] [ 8 ] [ 9 ] [ 0 ] [ - ] [ = ] [ ⌫ ]

Row 2 (QWERTY):
[ tab ] [ Q ] [ W ] [ E ] [ R ] [ T ] [ Y ] [ U ] [ I ] [ O ] [ P ] [ [ ] [ ] ] [ \ ]

Row 3 (home row):
[ caps ] [ A ] [ S ] [ D ] [ F ] [ G ] [ H ] [ J ] [ K ] [ L ] [ ; ] [ ' ] [ return ]

Row 4 (shift row):
[ ⇧ ] [ Z ] [ X ] [ C ] [ V ] [ B ] [ N ] [ M ] [ , ] [ . ] [ / ] [ ⇧ ]

Row 5 (bottom row):
[ fn ] [ ctrl ] [ opt ] [ ⌘ ] [         space         ] [ ⌘ ] [ opt ] [ ← ] [ → ] [ ↑ ] [ ↓ ]
```

**Wide key widths (approximate, relative to standard key):**
- Backspace: 2.2× standard
- Tab: 1.7×
- Caps Lock: 1.85×
- Return: 2.3×
- Left Shift: 2.6×
- Right Shift: 2.6×
- Space: ~7×
- fn/ctrl/opt/cmd: ~1.2×

**Key visual spec:**
```
Normal state:
  background: var(--key-face)          // #1c1c1e (MacBook Silver)
  border: 1px solid var(--key-border)  // #303032
  box-shadow: 0 2px 0 var(--key-shadow) // #0e0e0f
  border-radius: 4px

Pressed state:
  transform: translateY(1px)
  box-shadow: 0 1px 0 var(--key-shadow)

Label:
  font-family: JetBrains Mono (fallback: SF Mono, monospace)
  font-size: 9px (primary label)
  font-size: 7px (shift label — top-left corner)
  color: var(--key-label)              // #8a8a8e (MacBook Silver)
```

**Modifier key state:** The keyboard tracks which modifier keys are currently held. `shift`, `ctrl`, `alt`, `meta` state is tracked via React state. Visual: held modifier gets active background.

---

## Keyboard System — Escape Sequence Mapping

Every key press generates the correct terminal escape sequence and sends it via WebSocket as a `stdin` message.

### Mapping Logic

```
onKeyDown(key, modifiers):
  1. If modifier-only key (shift/ctrl/alt/cmd) → update modifier state, no output
  2. Look up escape sequence: escapeMap[key][modifiers]
  3. Fall through to character if no mapping found
  4. Send via ws.send({ type: 'stdin', sessionId, data: sequence })
```

### Key Escape Sequence Table (partial — critical entries)

| Key | Normal | Shift | Ctrl | Alt |
|-----|--------|-------|------|-----|
| Return | `\r` | `\r` | `\n` | `\x1b\r` |
| Backspace | `\x7f` | `\x7f` | `\x08` | `\x1b\x7f` |
| Tab | `\t` | `\x1b[Z` | — | — |
| Escape | `\x1b` | — | — | — |
| Up | `\x1b[A` | — | — | — |
| Down | `\x1b[B` | — | — | — |
| Right | `\x1b[C` | — | — | — |
| Left | `\x1b[D` | — | — | — |
| Home | `\x1b[H` | — | — | — |
| End | `\x1b[F` | — | — | — |
| Delete | `\x1b[3~` | — | — | — |
| PgUp | `\x1b[5~` | — | — | — |
| PgDn | `\x1b[6~` | — | — | — |
| Ctrl+C | `\x03` | — | — | — |
| Ctrl+D | `\x04` | — | — | — |
| Ctrl+Z | `\x1a` | — | — | — |
| Ctrl+A | `\x01` | — | — | — |
| Ctrl+E | `\x05` | — | — | — |
| Ctrl+L | `\x0c` | — | — | — |
| Ctrl+R | `\x12` | — | — | — |
| Ctrl+U | `\x15` | — | — | — |
| Ctrl+W | `\x17` | — | — | — |
| Ctrl+[A-Z] | `\x01`–`\x1a` | — | — | — |

Printable characters with Ctrl: code - 64 (e.g., Ctrl+A = char 65 - 64 = 1 = `\x01`).
Alt sequences: prepend `\x1b` to the normal sequence.
Cmd key: treated as Meta on macOS — maps to Alt sequences in terminal.

---

## Skin System

Six predefined skins plus a custom painter. The default is **iOS Terminal** — an iOS-inspired layout with bigger letter keys (10/9/7 per row) optimized for phone screens. The classic MacBook layout is available as "MacBook Silver". Skins are applied as CSS custom properties on the keyboard root element.

### Skin CSS Variables

```css
.keyboard[data-skin="macbook-silver"] {
  --kb-bg:        #141416;
  --key-face:     #1c1c1e;
  --key-border:   #2e2e30;
  --key-shadow:   #0e0e0f;
  --key-label:    #8a8a8e;
  --key-glow:     none;
}

.keyboard[data-skin="gamer-rgb"] {
  --kb-bg:        #0a0010;
  --key-face:     #0d001a;
  --key-border:   #1a0030;
  --key-shadow:   #050008;
  --key-label:    #ffffff;
  --key-glow:     /* per-key rainbow, applied via JS */;
  /* hue-rotate animation: 4s linear infinite on each key, staggered offset */
}

.keyboard[data-skin="amber-retro"] {
  --kb-bg:        #0a0600;
  --key-face:     #1a1000;
  --key-border:   #3d2800;
  --key-shadow:   #050300;
  --key-label:    #c87700;
  --key-glow:     0 0 6px #c87700;
}

.keyboard[data-skin="ice-white"] {
  --kb-bg:        #e8eaed;
  --key-face:     #f5f6f8;
  --key-border:   #d0d2d5;
  --key-shadow:   #b8babe;
  --key-label:    #2a2a2a;
  --key-glow:     none;
}

/* custom-painted: skin reads from customPaintColors[keyId] → inline style */
```

### Gamer RGB Animation

The Gamer RGB skin animates each key's background color through the hue wheel. Each key gets a `hue-rotate` offset proportional to its position in the keyboard grid (column index × 15deg). This creates a wave/ripple rainbow effect across the keyboard.

```css
@keyframes hue-cycle {
  from { filter: hue-rotate(0deg); }
  to   { filter: hue-rotate(360deg); }
}
/* Applied per-key with animation-delay: calc(var(--key-col) * 0.1s) */
```

### Custom Painted Skin

In Custom Painted mode, each key has an individually assignable color. The color picker shows 12 swatches. The painter workflow:

1. User taps a key → key enters "selected" state (bright outline)
2. User taps a swatch → `customPaintColors[keyId] = swatchColor`
3. Key re-renders with new background
4. "Apply to All" → broadcasts swatch color to all keys

### Skin Studio

A separate view (not a modal) navigated to from the keyboard via a skin button.

```
SkinStudio.tsx
 ├── SkinStudioHeader.tsx ("← terminal" | "Skin Studio" | "5 themes")
 ├── KeyboardPreview.tsx (live keyboard preview, current skin)
 ├── ThemeGrid.tsx (2-column grid of SkinCard)
 │    └── SkinCard.tsx × 5 (mini keyboard preview + name + description)
 ├── PainterPanel.tsx (shown when custom-painted is selected)
 │    ├── ColorSwatches.tsx (12 swatches)
 │    └── PainterInstructions.tsx
 └── SkinActions.tsx
      ├── ImportButton ("import .kbd")
      └── ExportButton ("export .kbd")
```

**Import/export format (.kbd):** JSON file with `{ skin: SkinId, customColors: Record<KeyId, string> }`.

---

## Terminal Pane Integration

The `TerminalPane` component wraps xterm.js. In terminal view, it must fill the available space between TabBar and ContextStrip.

**Key implementation notes:**

1. `FitAddon.fit()` must be called after every resize. Use `ResizeObserver` on the pane container.
2. After fit, send a `resize` message to backend: `{ type: 'resize', sessionId, cols, rows }`.
3. Backend calls `pty.resize(cols, rows)`.
4. The terminal must NOT receive keyboard input from `xterm.js` directly — all input comes from `MacBookKeyboard`. Set `terminal.options.disableStdin = true`.
5. xterm.js `onData` should still work for copy/paste scenarios — attach `terminal.onData(data => ws.send(...))` as a fallback.

### WebGL vs Canvas Renderer

Use WebGL renderer (`@xterm/addon-webgl`) when available. Fall back to canvas renderer (`@xterm/addon-canvas`) if WebGL context creation fails (some iOS WebViews). Detect via try/catch on `WebGLRenderingContext`.

---

## Session Metadata Protocol Extension

The current backend sends only raw PTY output. Phase 5 requires the backend to also send session metadata. New protocol messages:

```typescript
// Server → Client
{ type: 'session-list', sessions: SessionMeta[] }
{ type: 'session-update', session: SessionMeta }

interface SessionMeta {
  id: string;
  name: string;          // "api-refactor", "ui-comp", "zsh"
  cwd: string;           // current working directory
  status: 'run' | 'idle'; // based on PTY foreground process
  cols: number;
  rows: number;
  previewLines: string[]; // last 3 lines, ANSI stripped
}

// Client → Server (new message type)
{ type: 'create', name?: string }
{ type: 'kill', sessionId: string }
```

**Status detection:** `run` when PTY has a foreground process other than the shell. `idle` when the shell is at prompt. Can be inferred by watching PTY output for shell prompt patterns (configurable prompt regex).

---

## File Structure (packages/web/src)

```
src/
 ├── App.tsx
 ├── main.tsx
 ├── context/
 │    └── AppContext.tsx
 ├── hooks/
 │    ├── useTerminal.ts
 │    ├── useWebSocket.ts
 │    ├── useSessions.ts
 │    ├── useKeyboard.ts
 │    ├── useSkin.ts
 │    ├── useAuth.ts
 │    ├── useMode.ts
 │    └── useMediaQuery.ts
 ├── components/
 │    ├── mobile/
 │    │    ├── MobileApp.tsx
 │    │    ├── grid/
 │    │    │    ├── GridView.tsx
 │    │    │    ├── GridHeader.tsx
 │    │    │    ├── SessionCard.tsx
 │    │    │    ├── NewSessionCard.tsx
 │    │    │    └── SessionGrid.tsx
 │    │    ├── terminal/
 │    │    │    ├── TerminalView.tsx
 │    │    │    ├── TitleBar.tsx
 │    │    │    └── TabBar.tsx
 │    │    ├── keyboard/
 │    │    │    ├── MacBookKeyboard.tsx
 │    │    │    ├── KeyboardRow.tsx
 │    │    │    ├── Key.tsx
 │    │    │    ├── ContextStrip.tsx
 │    │    │    └── keyMaps.ts
 │    │    └── skin/
 │    │         ├── SkinStudio.tsx
 │    │         ├── SkinCard.tsx
 │    │         ├── KeyboardPreview.tsx
 │    │         └── PainterPanel.tsx
 │    ├── desktop/
 │    │    ├── DesktopApp.tsx
 │    │    ├── MacBookFrame.tsx
 │    │    ├── MenuBar.tsx
 │    │    └── ClaudeCodePane.tsx
 │    └── shared/
 │         ├── TerminalPane.tsx
 │         ├── TrafficLights.tsx
 │         ├── TmuxStatusBar.tsx
 │         ├── AuthScreen.tsx
 │         └── ModeIndicator.tsx
 ├── lib/
 │    ├── ws-client.ts
 │    ├── protocol.ts
 │    ├── theme.ts
 │    └── escapeSequences.ts
 └── styles/
      ├── keyboard-skins.css
      └── global.css
```

---

## Related

- [[UI-Spec]] — Exact colors, measurements, and interaction specs
- [[Backend]] — Session metadata protocol, PTY management
- [[Architecture-Decisions]] — WebGL renderer choice, skin system format
- [[Execution-Plan]] — Phase 5 implementation steps
