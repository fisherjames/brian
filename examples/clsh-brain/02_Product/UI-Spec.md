---
title: UI Specification — Mobile Redesign
tags: #clsh #product #rnd #ui-spec
created: 2026-03-13
updated: 2026-03-13
---

# UI Specification — Mobile Redesign

#product #rnd

Pixel-precise specification for the clsh mobile UI redesign. Derived from the three HTML mockups: `mockup-1-grid.html`, `mockup-2-terminal-keyboard.html`, `mockup-3-skin-studio.html`. This document is the implementation reference — all colors, sizes, spacings, and interactions are authoritative here.

See [[Frontend]] for component architecture and [[Execution-Plan]] for Phase 5 build steps.

---

## Design Tokens

### Color Palette

```css
/* Core surfaces */
--color-bg:           #0a0a0a;   /* Page/app background */
--color-surface-1:    #111111;   /* Session cards, panels */
--color-surface-2:    #161616;   /* Slightly elevated surfaces */
--color-border:       #222222;   /* Default borders */
--color-border-dim:   #1a1a1a;   /* Subtle borders */

/* Accent — green (primary brand) */
--color-green:        #00ff87;   /* Active states, badges, labels */
--color-green-dim:    #00cc6a;   /* Dimmed green, secondary green uses */
--color-green-glow:   rgba(0, 255, 135, 0.15);  /* Glow halos */

/* Accent — amber */
--color-amber:        #ffb347;   /* Amber-retro skin, warning states */

/* Accent — blue */
--color-blue:         #58a6ff;   /* Remote indicator, info states */

/* Typography */
--color-text-primary:   #e0e0e0;   /* Body text */
--color-text-secondary: #888888;   /* Dimmed labels, CWD */
--color-text-dim:       #444444;   /* Inactive tabs, ghost text */

/* Traffic lights */
--color-traffic-red:    #ff5f57;
--color-traffic-yellow: #ffbd2e;
--color-traffic-green:  #28c840;
```

### Typography

```
Font family: JetBrains Mono, "SF Mono", Menlo, Consolas, monospace
(JetBrains Mono loaded from Google Fonts or bundled WOFF2)

Scale:
  10px — Mini terminal preview text, tmux status bar
  11px — Tab labels, badge text, secondary info
  12px — Body text, key labels (standard)
  13px — Title bar session name
  9px  — Key primary label
  7px  — Key shift/secondary label
```

### Spacing & Radii

```
Border radius:
  4px   — Keys
  6px   — Badges (RUN/IDLE)
  8px   — Session cards gap
  10px  — Session card corners
  12px  — Panel corners

Gaps:
  3.5px — Between keys (horizontal and vertical)
  8px   — Between session cards in grid
  6px   — Keyboard left/right edge padding
```

---

## Global Layout

### Phone Viewport

```
width:   100vw
height:  100dvh   (dynamic viewport — accounts for iOS Safari chrome)
bg:      #0a0a0a
font:    JetBrains Mono
overflow: hidden  (no scroll at app level)
```

---

## View 1: Grid View

### Visual Structure

```
┌─────────────────────────────────┐  ← height: 44px
│  CLSH  [3 sessions]    [≡] [+]  │  Header
├─────────────────────────────────┤
│                                 │
│  ┌───────────┐ ┌───────────┐    │
│  │ ●●● [name]│ │ ●●● [name]│    │
│  │     [RUN] │ │     [IDLE]│    │
│  │ > git ... │ │ > npm ... │    │
│  │           │ │           │    │
│  │         ↗ │ │         ↗ │    │
│  └───────────┘ └───────────┘    │  ← 2-col grid, 8px gap
│                                 │
│  ┌───────────┐ ┌ - - - - -┐    │
│  │ ●●● [name]│ │     +     │    │  ← new session card (dashed)
│  │     [RUN] │ │           │    │
│  │ > claude  │ └ - - - - -┘    │
│  │         ↗ │                  │
│  └───────────┘                  │
│                                 │
│  (scrollable if > 4 sessions)   │
├─────────────────────────────────┤  ← height: 32px
│  [0 api] [1 ui-comp] [2 zsh]  remote: tokyo  │  tmux status bar
└─────────────────────────────────┘
```

### Grid Header

```
Height:     44px
Background: #111111
Border-bottom: 1px solid #222222
Padding:    0 16px

Left:
  "CLSH" — 14px, bold, #00ff87 (green brand text)
  Sessions badge — "3 sessions" — 10px, #00ff87, border: 1px solid #00ff87,
                   padding: 2px 6px, border-radius: 10px, margin-left: 8px

Right:
  Grid icon button (≡ or grid symbol) — 20×20px, tap → toggle grid density (future)
  Plus icon button (+) — 20×20px, tap → create new session
  Gap between buttons: 12px
```

### Session Card

```
Background:    #111111
Border:        1px solid #222222
Border-radius: 10px
Padding:       10px
Aspect ratio:  ~4:3 (fills half grid width minus gap)

Active card (selected/focused):
  Border: 1.5px solid #00ff87
  Box-shadow: 0 0 0 1px #00ff87, 0 0 12px rgba(0,255,135,0.15)

Layout (top → bottom):
  Row 1 (traffic lights + badge):
    - TrafficLights: ●(red #ff5f57) ●(yellow #ffbd2e) ●(green #28c840)
      diameter 8px, gap 5px
    - Session name: 10px, #888, margin-left: auto  (right-aligned center)
    - Status badge: right-aligned
      RUN: bg #003322, border #00ff87, text #00ff87
      IDLE: bg #1a1a1a, border #444, text #666
      height: 16px, padding: 0 5px, border-radius: 6px, font-size: 9px

  Row 2 (mini preview, flex-1):
    - Font: 8px JetBrains Mono
    - Color: #00cc6a (dim green — like terminal output)
    - Max 3-4 lines, overflow hidden
    - Background: transparent (card bg shows through)
    - Leading (line-height): 1.4

  Row 3 (expand arrow):
    - Bottom-right corner
    - "↗" or "⤢" symbol
    - 10px, #444

Tap behavior:
  - Triggers navigation to TerminalView with this session active
  - Brief scale animation: scale(0.97) on press, back on release
```

### New Session Card

```
Same dimensions as SessionCard
Background: transparent
Border: 1.5px dashed #333
Border-radius: 10px

Content: centered "+" icon
  Font-size: 24px
  Color: #444

Tap: creates new session via WS
Hover/press: border-color → #00ff87, icon → #00ff87
```

### Tmux Status Bar (Grid View)

```
Height:     32px
Background: #0d0d0d
Border-top: 1px solid #1a1a1a
Padding:    0 12px
Display:    flex, align-items: center, gap: 4px

Session tabs (left):
  Each tab: "0 api-refactor" format
  Inactive: #444, no border
  Active: #00ff87, green left border 2px or bottom border

Remote location (right, pushed with margin-left: auto):
  "remote: tokyo-1.ngrok.io" — 9px, #58a6ff (blue)
  or "local" — 9px, #555
```

### Grid Layout CSS

```css
.session-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  padding: 12px;
  overflow-y: auto;
  flex: 1;
}
```

---

## View 2: Terminal View

### Visual Structure

```
┌─────────────────────────────────────┐  ← 44px
│ ● ● ●  api-refactor — ~/clsh — 80×32  [⊞ grid] │  TitleBar
├─────────────────────────────────────┤  ← 36px
│ [0 api-refactor] [1 ui-comp] [2 zsh]  ⊙ tokyo │  TabBar
├─────────────────────────────────────┤
│                                     │
│         xterm.js terminal           │  ← flex 1 (fills remaining)
│         (full color, scrollable)    │
│                                     │
├─────────────────────────────────────┤  ← 48px
│ [esc] | [F1][F2][F3][F5] | [commit][diff][plan] | [====] │  ContextStrip
├─────────────────────────────────────┤
│                                     │
│         MacBook Keyboard            │  ← ~256px (6 rows)
│                                     │
└─────────────────────────────────────┘
```

### Title Bar

```
Height:     44px
Background: #111111
Border-bottom: 1px solid #222222
Padding:    0 12px
Display:    flex, align-items: center

Left:
  TrafficLights (red/yellow/green, 8px circles, 5px gap)
  Margin-right: 10px

Center (flex-1, text-align: center):
  "{name} — {cwd} — {cols}×{rows}"
  Font-size: 13px
  Color: #cccccc
  Overflow: ellipsis if too long

Right:
  "⊞ grid" button
  Font-size: 11px
  Color: #00ff87
  Border: 1px solid #00ff87
  Border-radius: 6px
  Padding: 3px 8px
  Tap: navigate back to GridView
```

### Tab Bar

```
Height:     36px
Background: #0d0d0d
Border-bottom: 1px solid #1a1a1a
Padding:    0 8px
Display:    flex, align-items: center, gap: 2px
Overflow-x: auto (scroll horizontally if many sessions)

Tab format: "{index} {name}"   (e.g., "0 api-refactor")
  Width: auto (content-based, min 60px)
  Height: 28px
  Padding: 0 10px
  Border-radius: 4px
  Font-size: 11px

  Inactive:
    Color: #555
    Background: transparent

  Active:
    Color: #00ff87
    Background: rgba(0, 255, 135, 0.08)
    Border-bottom: 2px solid #00ff87

Remote indicator (pushed to right with margin-left: auto):
  "⊙ tokyo-1" — 9px, #58a6ff
  Dot: 6px circle, #58a6ff, with pulse animation (scale 1→1.3 → 1, 2s loop)
```

### Terminal Pane

```
Background: #060606  (xterm.js theme background)
Flex: 1 (fills space between TabBar and ContextStrip)
Overflow: hidden

xterm.js theme:
  background:   #060606
  foreground:   #f0f0f0
  cursor:       #f97316  (orange cursor — brand element)
  cursorAccent: #000000
  selectionBackground: rgba(249, 115, 22, 0.3)
  black:        #1a1a1a
  red:          #ff5f57
  green:        #00ff87
  yellow:       #ffbd2e
  blue:         #58a6ff
  magenta:      #ff79c6
  cyan:         #8be9fd
  white:        #f8f8f2
  brightBlack:  #44475a
  (brightXxx mirrors xxx with +20% lightness)

Font: JetBrains Mono, 13px, lineHeight: 1.2
Scrollback: 1000 lines
```

---

## Context Strip (Touchbar Row)

```
Height:     48px (including vertical padding)
Background: #0d0d0d
Border-top: 1px solid #1a1a1a
Border-bottom: 1px solid #1a1a1a
Padding:    8px 8px
Display:    flex, align-items: center, gap: 4px

Key appearance: same as keyboard keys (see below)
Key height: 32px within the 48px container

Groups separated by vertical dividers:
  Divider: 1px solid #2a2a2a, height: 24px, margin: 0 4px

Group 1: [ esc ]
Group 2: [ F1 ] [ F2 ] [ F3 ] [ F5 ]
Group 3: [ commit ] [ diff ] [ plan ]
Group 4: [ ==== ]

Widths:
  esc: 36px
  F-keys: 28px each
  commit/diff/plan: content-based (~48px, ~36px, ~34px)
  ====: 40px
```

---

## MacBook Keyboard

### Container

```
Background: var(--kb-bg)     // #141416 (MacBook Silver)
Padding:    8px 6px
Display:    flex, flex-direction: column, gap: 3.5px
```

### Keys

```
Standard key:
  Height:        32px
  Min-width:     28px
  Padding:       0 (centered label via flex)
  Border-radius: 4px
  Background:    var(--key-face)    // #1c1c1e
  Border:        1px solid var(--key-border)  // #303032
  Box-shadow:    0 2px 0 var(--key-shadow)    // #0e0e0f

  Label layout:
    Primary label: bottom-center, 9px, var(--key-label) // #8a8a8e
    Shift label:   top-left, 7px, var(--key-label) with 0.7 opacity

  Pressed state (touchstart/mousedown):
    Transform:   translateY(1px)
    Box-shadow:  0 1px 0 var(--key-shadow)
    Transition:  none (instant)

  Release (touchend/mouseup):
    Transform:   translateY(0)
    Box-shadow:  0 2px 0 var(--key-shadow)
    Transition:  transform 80ms ease-out

  Modifier held:
    Background: #2a2a2a (slightly lighter than resting)
    Border-color: #00ff87 at 30% opacity
```

### Row Layout

Row sizes use `flex` with specific flex-grow weights to approximate real MacBook proportions:

```
Row 1 (number row, 14 keys):
  ` 1 2 3 4 5 6 7 8 9 0 - =  ⌫(2.2×)

Row 2 (QWERTY, 14 keys):
  tab(1.7×) Q W E R T Y U I O P [ ] \

Row 3 (home row, 13 keys):
  caps(1.85×) A S D F G H J K L ; '  return(2.3×)

Row 4 (shift row, 12 keys):
  ⇧(2.6×) Z X C V B N M , . / ⇧(2.6×)

Row 5 (bottom row, 11 keys):
  fn ctrl opt ⌘  [  space(7×)  ]  ⌘ opt ← → ↑ ↓

  Arrow keys form a T shape:
    ← → on one row (standard width)
    ↑ ↓ share a single key width vertically (half-height each, stacked)
    Implementation: ↑ is 16px, ↓ is 16px, stacked in a 32px container

Row gaps (between keys in a row): 3.5px
Column gaps (between rows): 3.5px
```

---

## Keyboard Skins

### Skin 1: MacBook Silver (default)

```
--kb-bg:       #141416
--key-face:    #1c1c1e
--key-border:  #2e2e30
--key-shadow:  #0e0e0f
--key-label:   #8a8a8e
--key-glow:    none
```

**Description:** Replicates the Space Gray MacBook keyboard. Subtle, professional.

### Skin 2: Gamer RGB

```
--kb-bg:       #0a0010
--key-face:    #0d001a   (base — overridden per-key by animation)
--key-border:  #1a0030
--key-shadow:  #050008
--key-label:   #ffffff
--key-glow:    per-key rainbow (CSS hue-rotate animation)

Animation:
  Each key: filter: hue-rotate(calc(var(--col) * 15deg))
  Animation: hue-cycle 4s linear infinite
  Delay: calc(var(--col) * 0.1s + var(--row) * 0.15s)
  Base hue: key face starts as blue-purple, cycles through spectrum
```

**Description:** Rainbow per-key backlight, animated wave pattern.

### Skin 3: Custom Painted

```
--kb-bg:       #0a0a0a
--key-face:    varies per key (from customPaintColors or #1a1a1a default)
--key-border:  #333 (default, can be overridden)
--key-shadow:  #050505
--key-label:   auto-contrast (black or white based on key bg luminance)

Painter palette (12 swatches):
  Row 1: #ff5f57  #ff9500  #ffcc00  #28c840  #007aff  #5856d6
  Row 2: #bf5af2  #ff2d55  #1c1c1e  #3a3a3c  #8e8e93  #ffffff
```

**Description:** Each key has its own color. Like painting a mechanical keyboard.

### Skin 4: Amber Retro

```
--kb-bg:       #0a0600
--key-face:    #1a1000
--key-border:  #3d2800
--key-shadow:  #050300
--key-label:   #c87700
--key-glow:    0 0 6px rgba(200, 119, 0, 0.4)
```

**Description:** Phosphor terminal vibes. Warm amber glow on a near-black wood-tone background.

### Skin 5: Ice White

```
--kb-bg:       #e8eaed
--key-face:    #f5f6f8
--key-border:  #d0d2d5
--key-shadow:  #b8babe
--key-label:   #2a2a2a
--key-glow:    none
```

**Description:** Clean minimal white keyboard. High contrast labels on light keys.

---

## View 3: Skin Studio

### Visual Structure

```
┌─────────────────────────────────┐  ← 44px
│  ← terminal  Skin Studio  5 themes │  Header
├─────────────────────────────────┤
│                                 │
│  ┌────────────────────────────┐ │  ← Live keyboard preview
│  │   [keyboard preview]       │ │    (current skin, interactive)
│  └────────────────────────────┘ │
│                                 │
│  ┌────────────┐ ┌────────────┐  │
│  │ [mini kb]  │ │ [mini kb]  │  │  ← Theme cards, 2-col grid
│  │ MacBook    │ │ Gamer RGB  │  │
│  │ Silver     │ │ Rainbow... │  │
│  └────────────┘ └────────────┘  │
│  ┌────────────┐ ┌────────────┐  │
│  │ [mini kb]  │ │ [mini kb]  │  │
│  │ Custom     │ │ Amber      │  │
│  │ Painted    │ │ Retro      │  │
│  └────────────┘ └────────────┘  │
│  ┌────────────┐                 │
│  │ [mini kb]  │                 │
│  │ Ice White  │                 │
│  └────────────┘                 │
│                                 │
│  [Per-key painter — if custom]  │
│  ○ ○ ○ ○ ○ ○ (color swatches)  │
│  "Tap a key, then a color"      │
│                                 │
│  [import .kbd]  [export .kbd]   │  ← Bottom actions
└─────────────────────────────────┘
```

### Skin Studio Header

```
Height:     44px
Background: #111111
Border-bottom: 1px solid #222

Left: "← terminal" — 12px, #00ff87, tap → back to terminal view
Center: "Skin Studio" — 13px, #e0e0e0, bold
Right: "5 themes" — 11px, #555
```

### Live Keyboard Preview

```
Scale:     ~0.65× the full keyboard width (shrunk to fit)
Margin:    12px
Background: var(--kb-bg) for current skin
Border-radius: 8px
Box-shadow: 0 4px 16px rgba(0,0,0,0.4)
Fully interactive: tapping a key in preview also selects it for painting
```

### Theme Card

```
Background:    #111111
Border:        1px solid #222
Border-radius: 10px
Padding:       10px

Active (selected skin):
  Border-color: #00ff87
  Box-shadow: 0 0 8px rgba(0,255,135,0.2)

Content (top → bottom):
  Mini keyboard render (SVG or scaled CSS keyboard, ~80px wide)
  Name: 12px, #e0e0e0, bold, margin-top: 8px
  Description: 10px, #666, 2 lines max
```

### Painter Panel (custom-painted skin only)

```
Shown below theme grid when custom-painted is selected

Color swatches row (12 swatches):
  Each swatch: 24×24px, border-radius: 4px
  Selected swatch: border: 2px solid #fff
  Gap: 6px

Active key indicator:
  Text: "Tap a key, then a color to paint"
  Font: 10px, #666
  When a key is selected: "{keyLabel} selected" — #00ff87

"Apply to All" button:
  Applies selected swatch to all keys
  Full-width, height: 36px
  Background: #1a1a1a, border: 1px solid #333, text: #ccc
```

### Import/Export Actions

```
Two equal-width buttons at bottom:
  "import .kbd"  |  "export .kbd"
  Height: 40px
  Background: #111, border: 1px solid #333
  Text: 11px, #888
  Gap: 8px
  Margin: 12px

.kbd file format:
  JSON: { "skin": "custom-painted", "customColors": { "KeyQ": "#ff5f57", ... } }
```

---

## Interactions & Animations

### Navigation

```
Grid → Terminal: slide-up transition (300ms, ease-out)
Terminal → Grid: slide-down transition (300ms, ease-in)
Terminal → Skin Studio: slide-left (300ms)
Skin Studio → Terminal: slide-right (300ms)

Implementation: CSS transition on transform/translate via React state classes
```

### Session Card Tap

```
Feedback: scale(0.97), 100ms, then back
Then: navigate to terminal view
```

### Key Press

```
Down: translateY(1px), shadow reduces — instant
Up:   translateY(0), shadow restores — 80ms ease-out
No debounce — immediate response
```

### Remote Indicator Pulse

```
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50%       { opacity: 0.5; transform: scale(1.3); }
}
animation: pulse 2s ease-in-out infinite
```

### RGB Skin Animation

```
@keyframes hue-cycle {
  from { filter: hue-rotate(0deg) saturate(150%); }
  to   { filter: hue-rotate(360deg) saturate(150%); }
}
Duration: 4s, linear, infinite
Delay per key: col-index × 0.1s + row-index × 0.15s
```

---

## Accessibility & Mobile Constraints

### iOS Safari

- Use `100dvh` — not `100vh` (avoids browser chrome overlap)
- Set `<meta name="apple-mobile-web-app-capable" content="yes">`
- Set `<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">`
- Suppress iOS keyboard: `inputmode="none"` on any input receiving terminal focus
- Prevent scroll bounce: `overscroll-behavior: none` on body
- Prevent text selection on keyboard: `user-select: none` on `.keyboard`
- Prevent long-press context menus: `webkit-touch-callout: none` on keys

### Touch Targets

Minimum tap target: 28×28px (all keys meet or exceed this).
For very narrow keys: expand touch target with padding without increasing visual size.

### Prevent Default

- `touchstart` / `mousedown` on keys: `event.preventDefault()` to prevent scroll and text selection
- `touchmove` inside keyboard: `preventDefault()` to prevent scroll during key press

---

## Responsive Breakpoints

```
< 768px  → MobileApp (Grid + Terminal + Keyboard layout)
≥ 768px  → DesktopApp (MacBook Pro frame, 3-pane)
```

The keyboard layout is ONLY rendered on mobile. On desktop, user types with their physical keyboard.

---

## Related

- [[Frontend]] — Component architecture, hooks, file structure
- [[Vision]] — Why this design (phone-first philosophy)
- [[Execution-Plan]] — Phase 5 build steps
