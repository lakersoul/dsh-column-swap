# dsh-column-swap

> Swap DSH's **native right column** with the **agent conversation column**: `[rail | conversation | right column]` → `[rail | right column | conversation]`, each keeping its own width. A toggle in the top-right corner switches back to the native order at any time.

**English** · [中文](./README.md)

## What it solves

DSH's `AppFrame` is a three-track grid:

```
[ DSH rail | agent conversation (1fr) | native right column (R px) ]
```

That right column *is* DSH's native sidebar (`@deepseek-ai/dsh-client-ui-sidebar-right` — panel, tabs, guide, docking and navigation service). DSH ships no "move the right column to the left" switch, and the public face of `ctx.layout` only exposes `openRightbar(track, fullscreen)` / `closeRightbar` — **there is no width setter**. So this is a pure client-side layout patch: semantic anchors + rewriting the frame's inline track sizes + a couple of CSS variables. **No upstream file is modified.**

It is independent of *what* occupies that column: with [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) (0.19+ registers every tab type into DSH's native right column) you swap its sidebar; with only DSH's built-in content (guide page / document preview) it works the same. It never requires, calls, or inspects any third-party plugin.

## Requirements

| | |
|---|---|
| DSH | `0.1.5-rc.1+` (the native right column arrived in `0.1.5-alpha.1`, its usable API surface stabilised in `rc.1`; verified on `0.1.5-rc.1`) |
| Node.js | `>= 20` |
| Build | **None**: `lib/index.js` (host half) and `lib/client.js` (browser half) are the hand-written plain-JS sources — no TypeScript, no bundler |

## Install

```bash
dsh plugin --profile web add github:lakersoul/dsh-column-swap
# then restart DSH
```

Or paste the repository URL into the plugin market. The package declares `dsh.bundle.patch`, so `dsh plugin add` appends it to `dsh.profile.bundles` and the profile mounts it at boot.

For a local checkout (development):

```bash
git clone https://github.com/lakersoul/dsh-column-swap
cd dsh-column-swap
node install.mjs --dry-run && node install.mjs   # link: dependency + bundles entry + node_modules link
# then restart DSH
```

`install.mjs` supports two mount channels and always clears the other one — the same package mounted from two Loader sources makes `dsh-client-modules` throw.

## Design notes (each point is a real trap this plugin had to solve)

1. **Anchors** — right column = `[data-rightbar-col]`; frame = its nearest `display:grid` ancestor; the three columns = each anchor walked up to the frame's direct child (through any number of slot wrappers). The conversation column has four fallbacks; a missing rail never blocks.
2. **Track rewrite** — read the frame's *inline* `grid-template-columns` (React's source of truth; the computed value would read our own output and self-oscillate) and override it with `railPx rightPx minmax(0,1fr)`.
3. **`grid-row: 1` is mandatory** — with only a definite column, the sparse auto-placement cursor bumps the row whenever the column index goes *backwards*. Document order is rail(col1) → conversation(col3) → right(col2), so the right column lands in implicit row 2 — and `grid-template-rows: 100%` only defines row 1, whose implicit height is auto ⇒ height 0, pushed below the viewport (the columns "swap correctly" yet nothing is visible).
4. **The divider** — the native line is the panel's *own* `border-left`; after the swap it overlaps the rail's border while the new boundary has none. Fix: drop the panel's `border-left` while swapped and draw an equal line on the right column's right edge.
5. **Drag direction** — the native handle is `setRightbar(base - dx)`, i.e. right-docked semantics; a left-docked column needs the opposite sign. With no width API available, the fix is at the event layer: intercept the handle's pointer events on the frame in the capture phase and re-dispatch them with `clientX` **mirrored about 0** — `DragHandle` only ever uses `clientX` deltas, so mirroring equals `dx → -dx`. When the toggle is off, events pass through untouched.
6. **Master toggle** — every layout rule hangs off `[data-dsh-swap-on]`; the toggle only adds/removes that one attribute. The button registers into `conversation.session.header.utilities` (a *list* slot, additive and right-aligned), which — because the conversation column is the rightmost one while swapped — is exactly the window's top-right corner, next to DSH's own right-sidebar expand button.

## Verification

1. The console logs `[dsh-column-swap] column swap active — rail/sidebar = <px> / <px>`.
2. The three columns sit at `row 1` with rects `rail[0..S]`, `right[S..S+R]`, `conversation[S+R..]`.
3. Dragging the divider tracks the pointer (right = wider), with the panel width following every frame.
4. Clicking the top-right button restores the native order — and the divider then drags with the native, correct direction.

## Known trade-offs

- **The bottom workbench follows the conversation column** (only visible with better-sidebar installed): its bottom panel is positioned from the conversation column's rect, so it moves with it.
- **`overflow: hidden` on the right column**: the default panel's own `border-left` used to be the divider; while swapped the column clips the panel so open/close animates as a clean wipe instead of sweeping across the rail. Cost: a tab dragged outside the column gets clipped (native menus/overlays are portaled to `document.body` and unaffected).
- **Narrow windows / floating mode** (right track = 0): the panel is pinned back to the viewport's right edge, preserving native overlay behaviour.
- The pointer mirror only applies while swapped.

## License

MIT © 2026 lakersoul
