---
version: alpha
name: Luma
description: >
  shadcn base-ui Luma style with neutral palette, Geist typography, Hugeicons
  icon library, default radius, subtle menu accent, and translucent menu
  surfaces. Generated via shadcn preset code `b1VlJDbW` and the init command
  `bunx --bun shadcn@latest init --preset b1VlJDbW --base base --template start`.
colors:
  background: "#FFFFFF"
  foreground: "#262626"
  card: "#FFFFFF"
  card-foreground: "#262626"
  popover: "#FFFFFF"
  popover-foreground: "#262626"
  primary: "#262626"
  primary-foreground: "#FAFAFA"
  secondary: "#F5F5F5"
  secondary-foreground: "#262626"
  muted: "#F5F5F5"
  muted-foreground: "#737373"
  accent: "#F5F5F5"
  accent-foreground: "#262626"
  destructive: "#DC2626"
  border: "#E5E5E5"
  input: "#E5E5E5"
  ring: "#A3A3A3"
typography:
  sans:
    fontFamily: "'Geist Variable', sans-serif"
    fontWeight: 400
    fontFeature: "'cv11', 'ss01'"
  heading:
    fontFamily: "{typography.sans.fontFamily}"
    fontWeight: 600
    letterSpacing: -0.02em
  display-lg:
    fontFamily: "{typography.sans.fontFamily}"
    fontSize: 60px
    fontWeight: 500
    lineHeight: 1.05
    letterSpacing: -0.025em
  display-md:
    fontFamily: "{typography.sans.fontFamily}"
    fontSize: 36px
    fontWeight: 500
    lineHeight: 1.1
    letterSpacing: -0.02em
  body-lg:
    fontFamily: "{typography.sans.fontFamily}"
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.6
  body-md:
    fontFamily: "{typography.sans.fontFamily}"
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.5
  body-sm:
    fontFamily: "{typography.sans.fontFamily}"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 1.5
  label-sm:
    fontFamily: "{typography.sans.fontFamily}"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 1.4
  label-xs:
    fontFamily: "{typography.sans.fontFamily}"
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
rounded:
  none: 0px
  base: 10px
  sm: 6px
  md: 8px
  lg: 10px
  xl: 14px
  2xl: 18px
  3xl: 22px
  4xl: 26px
  full: 9999px
spacing:
  unit: 4px
  field-gap: 8px
  section-gap: 24px
  page-px: 24px
  page-py-sm: 64px
  page-py-lg: 96px
  page-max-width: 1024px
  form-max-width: 384px
  header-offset: 16px
components:
  # Luma signatures — recipes that distinguish this preset from other shadcn
  # styles. Pure shadcn defaults (alert, kbd, label, separator, etc.) are not
  # re-encoded here; install them via shadcn CLI and they'll inherit the
  # correct styling from style-luma.css. See the Components prose section for
  # the full primitive index.

  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.primary-foreground}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.4xl}"
    height: 36px
    padding: "0 12px"
  button-primary-hover:
    backgroundColor: "{colors.primary}"
  button-outline:
    backgroundColor: "{colors.background}"
    textColor: "{colors.foreground}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.4xl}"
    height: 36px
    padding: "0 12px"
  button-ghost:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    typography: "{typography.label-sm}"
    rounded: "{rounded.4xl}"
    height: 36px
    padding: "0 12px"
  input-field:
    backgroundColor: "{colors.input}"
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.3xl}"
    height: 36px
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.card-foreground}"
    rounded: "{rounded.4xl}"
    padding: 24px
  popover-translucent:
    backgroundColor: "{colors.popover}"
    textColor: "{colors.popover-foreground}"
    rounded: "{rounded.3xl}"
    padding: 6px
  menu-item:
    backgroundColor: transparent
    textColor: "{colors.foreground}"
    typography: "{typography.body-sm}"
    rounded: "{rounded.2xl}"
    padding: "8px 12px"
  menu-item-focus:
    backgroundColor: "{colors.foreground}"
  avatar-circle:
    backgroundColor: "{colors.muted}"
    rounded: "{rounded.full}"
    size: 36px

  # Custom additions — chrome and layout decisions specific to this codebase,
  # not part of base-luma.

  page-main:
    backgroundColor: "{colors.background}"
    padding: "64px 24px"
  header-bar:
    backgroundColor: transparent
    padding: "0 24px"
---

## Overview

Calm, monochrome, generously rounded. The Luma style trades color saturation for restrained craft: a neutral grayscale palette under a Geist body face, deeply rounded surfaces, and a single accent color that lands on focus rings and active states only. Translucent menus and popovers float above the content with a frosted glass effect. The brand reads as a tool, not a product brochure: a quiet workspace that gets out of your way.

The system is generated from the shadcn preset `b1VlJDbW` (Luma + Base UI + neutral + neutral + Hugeicons + Geist + inherit heading + default radius + subtle accent + translucent menu). Local CSS lives in `src/styles.css`, primitives in `src/components/ui/*`. Tokens here are the public contract for agents; the CSS is the implementation.

## Colors

The palette is OKLCH grayscale (`oklch(L 0 0)`), no hue. Light mode runs from white surfaces through pale chrome to dark ink; dark mode inverts. The single non-grayscale token is `destructive`, used only for irreversible actions and validation errors.

- **Background / Foreground**: `#FFFFFF` on `#262626` (light), `#171717` on `#FAFAFA` (dark). Pure white, deep ink. No off-white drift.
- **Card / Popover**: same as background in light, slightly lifted in dark (`#262626`) so surfaces read above the page.
- **Primary**: equal to `foreground`. Buttons are dark in light mode, light in dark mode. There is no brand color.
- **Muted / Accent**: `#F5F5F5` light, `#404040` dark. Used for secondary buttons, hovered menu items, and field backgrounds at 50% opacity.
- **Border / Input**: `#E5E5E5` light, `rgba(255,255,255,0.10)` dark. Border is barely there; inputs use a tinted background instead of a visible border at rest.
- **Ring**: `#A3A3A3`. Focus ring + 30% opacity halo. The same ring color reads in both modes.
- **Destructive**: `#DC2626` light, `#F87171` dark. Reserved.

The dark-mode mapping is a deterministic inversion: backgrounds and inks swap, `card` and `popover` lift one step (≈ `#262626`) so they read above the page, `secondary`/`muted`/`accent` raise to `#404040`, `muted-foreground` lightens to `#A3A3A3`, and `border` / `input` switch to `white at 10% / 15% alpha` so chrome reads against the lifted surfaces. The `ring` halo color stays mid-gray (`#737373` in dark) and works in both modes. Menu surfaces apply a `foreground` tint at 6% alpha for the focus state instead of switching to `accent`.

Ground truth lives in `src/styles.css` as OKLCH values; hex tokens here are linter-compatible approximations. When precision matters (designing in Figma, importing to a sibling tool), copy the OKLCH values from `:root` and `.dark`.

## Typography

One face: **Geist Variable** (`@fontsource-variable/geist`). `--font-heading` references `--font-sans`, so headings use the same family at heavier weights. No serif, no display face, no fallback typeface drift.

- **Body** is `400` weight, `1.5` line height. Reading sizes are `text-sm` (14px) for chrome and `text-base` (16px) for content.
- **Headings** use `font-medium` (500) or `font-semibold` (600) with `tracking-tight` (`-0.02em`) at display sizes. There is no `font-bold` (700) usage in the codebase by design; weight five carries headlines.
- **Display sizes** (`text-4xl` to `text-6xl`) appear only in hero contexts on `routes/index.tsx`. Inner pages cap at `text-2xl`.
- **Labels and metadata** use `text-xs` (12px) at `font-medium` for chips, badges, and secondary captions.

Geist's variable axes are not currently exercised; if needed, add `fontVariation` to the `sans` token here and apply via `font-variation-settings` in CSS.

## Layout & Spacing

The page chrome is fixed: header at `top-4` aligns with content; main column is `max-w-5xl` (1024px) with `px-6` (24px) horizontal padding and `py-16 sm:py-24` vertical padding. Forms center inside the main column at `max-w-sm` (384px). Section gaps within a page are `gap-6` (24px). Field gaps within a section are `gap-2` to `gap-3`.

- **Base unit**: `4px`. The scale is `0, 4, 8, 12, 16, 20, 24, 32, 48, 64, 96, 128`.
- **Page padding**: 24px horizontal, 64px (mobile) → 96px (desktop) vertical. The vertical needs to clear the fixed header at `top-4`.
- **Header**: fixed positioning, `inset-x-0 top-4`, inner flex constrained to the same `max-w-5xl px-6` column so left and right icons align with content edges.
- **Forms** sit in a `mx-auto w-full max-w-sm flex-col gap-6` block inside the wide page main, so the page chrome aligns with other routes while the form keeps its narrow comfortable width.

Negative space is generous on purpose. The page is mostly background; UI elements are punctuation, not paragraphs.

## Elevation & Depth

Depth is signaled by surface tint and a single soft ring, not by drop shadows. The system has three elevation levels:

- **Level 0 (page)**: flat. `bg-background`. No shadow, no border. The default.
- **Level 1 (card / inline surface)**: `bg-card` (often equal to background), an optional `border` at `--color-border`. No shadow.
- **Level 2 (popover / menu / dropdown)**: `bg-popover/70` with a `backdrop-blur-2xl backdrop-saturate-150` pseudo-element underneath. A `shadow-lg` (Tailwind default) for separation, plus `ring-1 ring-foreground/5` (light) or `ring-foreground/10` (dark) for definition. This is the **translucent** menu surface defined by the preset.

The frosted-glass pseudo-element is mandatory for translucent menus. Without it, the 70% popover opacity reveals page content directly and reads as a bug. The blur and saturation values are calibrated; do not lower them.

## Shapes

Heavy rounding is the system's loudest visual choice. The radius ladder, generated from `--radius: 0.625rem`:

- `rounded-sm` 6px → checkbox, kbd
- `rounded-md` 8px → small chips
- `rounded-lg` 10px → field labels, info badges
- `rounded-xl` 14px → toast, hover-card on small surfaces
- `rounded-2xl` 18px → menu items, secondary buttons inside groups
- `rounded-3xl` 22px → inputs, popovers, cards, dropdown surfaces, hover cards
- `rounded-4xl` 26px → buttons, input groups, large pills
- `rounded-full` → avatars, icon buttons, badges, switches

Buttons are pill-shaped (`rounded-4xl`) regardless of size. The home and theme toggle icons in the header are `rounded-full` icon-button variants. Inputs and their groups use `rounded-3xl`. Menus and popovers use `rounded-3xl` with `rounded-2xl` items inside.

## Components

The base-luma preset ships 53 primitives plus block templates. shadcn handles the actual styling via `style-luma.css` and the registry; this section is a map of what's installed, what's available to add, and where we customize on top.

### Installed

Currently in `src/components/ui/`. Use these directly, don't reinstall.

| Primitive     | File                | Notes                                                                                                                                                                                                                                                                                                                                                                                             |
| ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Alert         | `alert.tsx`         | Inline non-blocking notice. Default + destructive variants. For blocking confirmations use Dialog (not installed yet).                                                                                                                                                                                                                                                                            |
| Avatar        | `avatar.tsx`        | Always `rounded-full`. Sizes used: `size-8` (header chip), `size-9` (icon button), `size-14` (signup picker), `size-24` (profile hero). Fallback is user initial in `bg-muted`.                                                                                                                                                                                                                   |
| Button        | `button.tsx`        | Five variants: `default`, `outline`, `secondary`, `ghost`, `destructive`, `link`. All use `rounded-4xl`. Sizes `xs/sm/default/lg/icon` map to `h-6 / h-8 / h-9 / h-10 / size-9`. Primary hovers at 80% opacity; outline and ghost hover to `bg-muted`.                                                                                                                                            |
| Card          | `card.tsx`          | The system's one elevated surface. `bg-card rounded-4xl shadow-md ring-1 ring-foreground/5 dark:ring-foreground/10`. `data-size=sm` shrinks padding. Compose with `CardHeader`/`CardContent`/`CardFooter`/`CardTitle`/`CardDescription`.                                                                                                                                                          |
| Dropdown menu | `dropdown-menu.tsx` | Translucent surface: `bg-popover/70` + `before:backdrop-blur-2xl before:backdrop-saturate-150` pseudo-element. Items `rounded-2xl`, focus uses `bg-foreground/10` (subtle accent). Destructive items: `text-destructive` + `bg-destructive/10` on focus. The translucent recipe is inlined per the preset's `menuColor: default-translucent` — reinstall from the shadcn registry to get updates. |
| Empty         | `empty.tsx`         | "No rows" state. `Empty` outer with `border-dashed p-12 rounded-2xl`, composable `EmptyMedia` (`size-10 rounded-xl bg-muted` for icon variant), `EmptyHeader`/`EmptyDescription`/`EmptyContent`.                                                                                                                                                                                                  |
| Field         | `field.tsx`         | Form composition: `Field`, `FieldGroup`, `FieldSet`, `FieldLegend`, `FieldLabel`, `FieldDescription`, `FieldError`. The right wrapper for any form section. Errors render in `text-destructive` below the input.                                                                                                                                                                                  |
| Input         | `input.tsx`         | `bg-input/50 rounded-3xl h-9 border-transparent`. On focus: `border-ring` + `ring-3 ring-ring/30`. Aria-invalid swaps to `ring-destructive/20`.                                                                                                                                                                                                                                                   |
| Input group   | `input-group.tsx`   | Wraps `Input` plus inline `InputGroupAddon` (icon, kbd, button) into a single `rounded-4xl h-9` shell. Addons align via `data-align` (`inline-start`/`-end`/`block-start`/`-end`). Block-aligned promotes to `flex-col` and shifts to `rounded-3xl`.                                                                                                                                              |
| Kbd           | `kbd.tsx`           | Keyboard hint chip. `bg-muted text-muted-foreground rounded-lg`. Inverts to `bg-input` inside `InputGroup`, `bg-background/20 text-background` in tooltips. `KbdGroup` chains keys.                                                                                                                                                                                                               |
| Label         | `label.tsx`         | `text-sm leading-none font-medium`. Use raw `Label` only outside a `Field`; otherwise `FieldLabel` is preferred.                                                                                                                                                                                                                                                                                  |
| Separator     | `separator.tsx`     | `shrink-0 bg-border data-horizontal:h-px data-vertical:w-px`. No baked-in margin — parent layout owns spacing.                                                                                                                                                                                                                                                                                    |
| Sonner        | `sonner.tsx`        | Toaster mounted once in `__root.tsx`. `cn-toast` applies `rounded-2xl` over Sonner defaults. Status icons are HugeIcons at `size-4`: `CheckmarkCircle02Icon` (success), `InformationCircleIcon` (info), `Alert02Icon` (warning), `MultiplicationSignCircleIcon` (error), `Loading03Icon` (loading). Call `toast.success` / `.error` / etc. from `sonner` directly.                                |
| Textarea      | `textarea.tsx`      | `bg-input/50 rounded-2xl min-h-16 field-sizing-content`. Auto-grows. Same focus / invalid / disabled treatment as Input.                                                                                                                                                                                                                                                                          |

### Available (not installed)

The full base-luma surface area, ready to install via `bunx --bun shadcn@latest add <name>`. They inherit the Luma styling automatically — don't reproduce token recipes when adding them, and don't add them to DESIGN.md unless we override the default.

**Layout & navigation**

| Primitive         | What it is                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `accordion`       | Expandable vertical sections; one or many open at a time. FAQs, filter groups, collapsible lists.                              |
| `breadcrumb`      | Hierarchical navigation trail with separator icons.                                                                            |
| `collapsible`     | Single show/hide panel. Simpler than Accordion — just one toggle.                                                              |
| `navigation-menu` | Mega-menu with grouped links. For site headers with dropdown sections.                                                         |
| `pagination`      | Prev/next + page number controls with RTL-aware arrows.                                                                        |
| `resizable`       | Drag-to-resize split panels. IDEs, dashboards.                                                                                 |
| `scroll-area`     | Custom-styled scrollbars for overflow containers.                                                                              |
| `sheet`           | Side-drawer dialog that slides in from an edge.                                                                                |
| `sidebar`         | Full sidebar layout shell with collapsed/expanded states. Use with one of the `sidebar-*` blocks below for a complete pattern. |
| `tabs`            | Horizontal tab navigation with content panels.                                                                                 |

**Overlays**

| Primitive      | What it is                                                                                                                  |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `alert-dialog` | Blocking confirmation modal. Cannot be dismissed by clicking outside. For destructive confirmations.                        |
| `dialog`       | Modal dialog for forms, details, dismissible content.                                                                       |
| `drawer`       | Bottom-sheet drawer (mobile-style). Can also slide from the side.                                                           |
| `hover-card`   | Rich tooltip on hover with images, links, formatted content. Non-interactive peek.                                          |
| `popover`      | Floating panel anchored to a trigger. Non-modal, for pickers, inline forms, secondary actions. Uses the translucent recipe. |
| `tooltip`      | Text tooltip on hover/focus. Short inline hints.                                                                            |

**Form controls**

| Primitive       | What it is                                                                                   |
| --------------- | -------------------------------------------------------------------------------------------- |
| `checkbox`      | Checkbox input with indeterminate state.                                                     |
| `combobox`      | Typeahead searchable select. Built on `command` + `popover`.                                 |
| `command`       | Command palette (Cmd+K style searchable menu). Fuzzy-match list with keyboard nav.           |
| `input-otp`     | Multi-digit OTP input with auto-tabbing between boxes. Use for email/SMS verification codes. |
| `native-select` | Native `<select>` with Luma styling. Use when you need browser-native behavior.              |
| `radio-group`   | Single-select radio button group.                                                            |
| `select`        | Custom select dropdown with keyboard navigation. Translucent menu surface.                   |
| `slider`        | Range input slider with single or dual handles.                                              |
| `switch`        | Toggle switch (on/off). Luma uses a pill-shaped thumb.                                       |
| `toggle`        | Single toggle button (pressed / unpressed).                                                  |
| `toggle-group`  | Group of toggles, single-select or multi-select.                                             |

**Feedback & data**

| Primitive  | What it is                                                                                                 |
| ---------- | ---------------------------------------------------------------------------------------------------------- |
| `badge`    | Small label chip for status, counts, tags. Pill-shaped.                                                    |
| `calendar` | Date picker calendar with range support.                                                                   |
| `chart`    | Recharts wrapper with Luma-styled tooltips, legends, axes.                                                 |
| `progress` | Progress bar with determinate / indeterminate states.                                                      |
| `skeleton` | Loading placeholder blocks. Prefer over inline `bg-muted animate-pulse`.                                   |
| `spinner`  | Loading spinner primitive. Prefer over the inline `HugeiconsIcon Loading03Icon` pattern if we standardize. |
| `table`    | Data table primitives (`Table`, `TableHeader`, `TableBody`, `TableRow`, `TableCell`, `TableCaption`).      |

**Composition & utility**

| Primitive      | What it is                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------- |
| `aspect-ratio` | Maintain a fixed ratio (e.g. 16:9) for responsive containers.                                                   |
| `button-group` | Connected row of buttons sharing borders.                                                                       |
| `context-menu` | Right-click context menu. Same translucent recipe as dropdown-menu.                                             |
| `item`         | Generic list item primitive: icon + title + description + trailing action. Use for settings rows, option lists. |
| `menubar`      | Horizontal menu bar (File / Edit / View style). Translucent menu items.                                         |
| `carousel`     | Horizontal scrolling carousel with prev/next controls.                                                          |

**Block templates** (full UI compositions, not atoms)

| Block                       | What it is                                                                                                                                                    |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dashboard-01`              | Complete dashboard shell: sidebar + top bar + content area with metric cards.                                                                                 |
| `login-01` … `login-05`     | Sign-in page layouts (centered, split-screen, with feature highlights, etc).                                                                                  |
| `signup-01` … `signup-05`   | Sign-up page layouts matching the login variants.                                                                                                             |
| `sidebar-01` … `sidebar-16` | Sidebar variants: collapsed, icon-only, rail, nested, command palette, inset, floating. Reach for one of these before assembling from `sidebar` + primitives. |

When scaffolding a new screen, check the blocks first — they're pre-wired compositions that save time over assembling from scratch. Install via the shadcn CLI, same as primitives.

### Reference examples (live previews in the Luma preset)

Before building a UI from scratch, look at the canonical examples. The shadcn `/create` page renders every primitive in the exact Luma preset we use, and each example ships 3–5 realistic compositions (not just "hello world"). Three ways to access them:

1. **Full gallery in the Luma style**
   [ui.shadcn.com/create?preset=b1VlJDbW](https://ui.shadcn.com/create?preset=b1VlJDbW)

   Every primitive and block rendered in the exact style we use. Scroll the canvas, click **Shuffle** to see alternate combos, hit **Open Preset** to drop into the editor. Good for design browsing — seeing what's _possible_ in Luma.

2. **Single-primitive preview**
   `https://ui.shadcn.com/preview/base/<name>-example?preset=b1VlJDbW`

   Example: [dialog-example](https://ui.shadcn.com/preview/base/dialog-example?preset=b1VlJDbW) shows Dialog "With Form", "Scrollable Content", "With Sticky Footer", "No Close Button", and "Chat Settings" variants side-by-side. Swap `<name>` for any primitive name from the Available table above.

3. **Source in the repo**
   `apps/v4/registry/bases/base/examples/<name>-example.tsx` in [shadcn-ui/ui](https://github.com/shadcn-ui/ui).

   59 `*-example.tsx` files, each showing 3–5 realistic uses of a primitive with proper imports, field composition, and accessibility attributes. Use `--base base` examples (not `radix/`) since our preset is `base`. `dialog-example.tsx` alone is 5 complete dialog patterns totalling ~300 lines. Copy what you need, swap `@/registry/bases/base/ui/...` imports for `@/components/ui/...`, drop the `Example` / `ExampleWrapper` harness.

Each example is also a shadcn registry item. To install one directly:

```bash
bunx --bun shadcn@latest add @shadcn/dialog-example
```

This installs the example file plus all its registry dependencies (e.g. `dialog-example` pulls `dialog`, `button`, `field`, `input`, `input-group`, `kbd`, `select`, `switch`, `tabs`, `textarea`, `tooltip`, and `native-select`). Useful when you want a realistic starting point rather than a single primitive.

**When to reach for examples**: before designing a dialog, a card-based dashboard section, a form layout, a settings panel, or anything that's a "standard UI pattern." The Luma rendering is authoritative — matching the preset exactly — and the compositions encode real interaction patterns (sticky footers, scrollable content, validation layouts) that are easy to get wrong from scratch.

### Custom on top

Components that aren't shadcn primitives — these encode our specific decisions and live outside `src/components/ui/`.

- **`UserMenu`** (`src/components/user-menu.tsx`) — Avatar dropdown anchored top-right. Uses `Avatar` + `DropdownMenu`. Shows account label, handle/email, links to profile, sign-out.
- **`ThemeToggle`** (`src/components/theme-toggle.tsx`) — Outlined icon button cycling light/dark/system. Pair with `UserMenu` in the header cluster.
- **Header bar** (`src/routes/__root.tsx`) — Fixed at `top-4`, full width with inner flex constrained to `mx-auto max-w-5xl px-6`. Home `Link` icon button on the left, `UserMenu` + `ThemeToggle` cluster on the right. Both clusters use the outline icon button variant so they read as a matching pair.
- **Page main** (`src/routes/*`) — Every route uses `mx-auto w-full max-w-5xl px-6 py-16 sm:py-24` as the outer container so chrome aligns with the header. Form pages wrap their narrow form in an inner `mx-auto w-full max-w-sm flex-col gap-6` div.
- **Spinner** — Inline pattern: `HugeiconsIcon` with `Loading03Icon` at `size-6`, `animate-spin`. Used as a load state when the route is committed but content isn't ready. There's also a base-luma `spinner` primitive available to install if a more comprehensive spinner is needed.
- **`ProfileSkeleton`** (`src/routes/_authed/profile.tsx`) — Inline placeholder shown during profile data load. Uses `bg-muted` blocks at the same dimensions as the real profile content. Could be replaced with the base-luma `skeleton` primitive if we want a system-wide convention.

## Do's and Don'ts

**Do** use the existing primitives in `src/components/ui/` before reaching for raw Tailwind. They encode the system; ad-hoc class compositions drift from it.

**Do** use `useConvexAuth` plus an explicit conditional for auth-gated content rather than `<Authenticated>` / `<Unauthenticated>` boundaries, until the upstream `isLoading` latch ships. Tagged `UPSTREAM(convex-better-auth#isloading-latch)` in the source.

**Do** match icon size to context: `size-3.5` for inline chrome chips, `size-4` for menu items and inline buttons, `size-5` for medium controls, `size-6` for header / loading states.

**Do** lean on the radius ladder. If something needs corners, it's almost always one of `rounded-2xl`, `rounded-3xl`, `rounded-4xl`, or `rounded-full`.

**Don't** introduce a second typeface. Geist carries every hierarchy level. If a heading needs more weight, increase `font-weight` and `letter-spacing`, don't reach for a serif.

**Don't** use color to communicate brand. The only colored token is `destructive`, and it means "irreversible". Brand expression is through type, spacing, and rounding, not hue.

**Don't** add a drop shadow to a page-level surface. Cards lay flat. Only popovers / menus / dialogs are elevated, and they use the translucent recipe.

**Don't** narrow forms by changing the page main's max width. Wrap the form in `mx-auto w-full max-w-sm` inside the wide main so chrome alignment is preserved across pages.

**Don't** redefine spacing in components. Page padding, section gap, and form width are tokens above; reach for `--spacing-*` values or the named utilities, not new magic numbers.

**Don't** re-encode shadcn primitive recipes in DESIGN.md when adding a new component. `bunx --bun shadcn@latest add <name>` lands the Luma styling automatically; only add a recipe here if you're overriding the default.
