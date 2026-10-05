---
name: Sprint Customer Web
description: Mobile-first print-shop requests in a bright neutral construction-grid service-slip system.
colors:
  paper: "#f4f5f1"
  field-paper: "#fbfcfa"
  paper-glass: "rgba(244, 245, 241, 0.78)"
  ink: "#15202b"
  brand-navy: "#0c1c32"
  muted: "#52616e"
  rule: "#aab5b9"
  heavy-rule: "#172636"
  field-border: "#87959d"
  gridline: "rgba(20, 52, 91, 0.06)"
  cobalt: "#0e4fc9"
  cobalt-deep: "#0a3e9f"
  cobalt-ink: "#0d3e99"
  focus-blue: "#1769ff"
  blue-pale: "#c9dcff"
  blue-wash: "#e7eef9"
  ready-green: "#176040"
  live-green: "#117a48"
  error-red: "#a52619"
  action-text: "#ffffff"
typography:
  display:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(42px, 12vw, 74px)"
    fontWeight: 900
    lineHeight: 0.83
    letterSpacing: "-0.04em"
  headline:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(34px, 8vw, 52px)"
    lineHeight: 0.96
    letterSpacing: "-0.04em"
  title:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "20px"
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    lineHeight: 1.55
  label:
    fontFamily: "Aptos, Segoe UI Variable, Segoe UI, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 700
rounded:
  square: "0"
  signal-dot: "50%"
spacing:
  compact: "8px"
  control: "12px"
  standard: "16px"
  gutter-mobile: "16px"
  gutter: "20px"
  section: "26px"
  spacious: "48px"
components:
  button-primary:
    backgroundColor: "{colors.cobalt}"
    textColor: "{colors.action-text}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "12px 16px"
    height: "50px"
  button-primary-hover:
    backgroundColor: "{colors.cobalt-deep}"
    textColor: "{colors.action-text}"
    rounded: "{rounded.square}"
  button-secondary:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.square}"
    padding: "12px 16px"
    height: "50px"
  input-field:
    backgroundColor: "{colors.field-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.square}"
    padding: "8px 10px"
    height: "44px"
  segmented-selected:
    backgroundColor: "#dbe8ff"
    textColor: "#09397f"
    rounded: "{rounded.square}"
    height: "44px"
---

# Design System: Sprint Customer Web

## Overview

**Creative North Star: "The Crouwel Counter Service Slip"**

Sprint’s customer surface applies Crouwel-inspired operational grid logic to a calm, accurately prepared service slip. It makes a neighborhood print counter feel organized and immediate: strong black-blue type, visible dividing rules, plain-language choices, and a single cobalt action make the next step obvious without turning a practical request into a flashy checkout.

The system is mobile-first, dense enough to feel operational and generous enough to read quickly while standing at a counter. Its visual language is intentionally material-light: border lines, spacing, and paper-tone shifts establish order; almost every surface stays flat. The only translucent treatment is the restrained sticky topbar, which keeps shop context visible while preserving the paper field beneath it.

**Key Characteristics:**

- Bright neutral paper field with a faint, precise construction grid.
- Cobalt used as an operational signal for the primary route, icon accents, and key identifiers.
- Square, rule-led controls that echo a printed service slip rather than a consumer card stack.
- Compact system sans typography with tightly tracked, emphatic display type.
- Direct status, privacy, and availability cues that feel trustworthy rather than decorative.

## Colors

The palette is paper-and-ink first, with cobalt and green reserved for action and operational state; the frontmatter is the normative value source.

### Primary

- **Operational Cobalt** (`cobalt`): Carries the primary action, service and file icons, key request identifiers, and the central wordmark grid.
- **Pressed Cobalt** (`cobalt-deep`): Appears only on an available primary action’s hover state.
- **Blueprint Ink** (`cobalt-ink`): Gives the oversized `SPRINT` letter grid its printed-plan authority.
- **Focus Blue** (`focus-blue`): Provides the shared visible keyboard focus outline.
- **Soft Blue Register** (`blue-pale`, `blue-wash`): Marks service icons, selected segmented choices, selection, and hover fields without competing with cobalt.

### Neutral

- **Counter Paper** (`paper`, `field-paper`): Keeps the app shell and inputs bright but slightly differentiated.
- **Topbar Paper Glass** (`paper-glass`): Maintains a calm sticky context layer above the grid.
- **Service Ink** (`ink`, `brand-navy`): Sets the high-contrast reading and brand voice.
- **Quiet Operational Text** (`muted`): Supports detail, helper copy, and secondary metadata.
- **Printed Rules** (`rule`, `heavy-rule`, `field-border`): Define list rows, price slips, and field geometry in lieu of cards.
- **Construction Grid** (`gridline`): The low-contrast technical field behind the interface.

### Tertiary

- **Live Signal** (`live-green`, `ready-green`): Indicates availability, live connection, and completed request stages.
- **Exception Red** (`error-red`): Is reserved for validation and request failures.

### Named Rules

**The Cobalt Is an Instruction Rule.** Cobalt points to the action or operational fact that matters now; it is not a general decorative fill.

**The Grid Is Structure, Not a Gradient Rule.** Keep the faint construction-grid line pattern. Do not add decorative color gradients, glow fields, or tonal washes.

## Typography

**Display Font:** Aptos, with Segoe UI Variable, Segoe UI, ui-sans-serif, system-ui, and sans-serif fallbacks.

**Body Font:** The same system sans stack.

**Character:** A compact, familiar desktop-and-phone system sans keeps document-service language legible and unpretentious. The largest type is heavy, tightly tracked, and compact vertically; supporting copy breathes with a more generous reading line-height.

### Hierarchy

- **Display** (900, `clamp(42px, 12vw, 74px)`, 0.83): The six-cell `SPRINT` construction-grid wordmark. Use only for this signature home-screen moment.
- **Headline** (browser bold, `clamp(34px, 8vw, 52px)`, 0.96): Short customer prompts and flow titles; keep them to a narrow measure (12–14ch).
- **Title** (inherited bold, 20px): Service and form-section headings.
- **Body** (inherited regular, 16px, 1.55): Explanations and page copy; cap supporting text at the established 52ch measure.
- **Label** (700, 13px): Field labels, helper metadata, availability, and request details. Use it for compact operational facts, not display emphasis.

### Named Rules

**The Narrow Question Rule.** Large prompts are questions for a customer in motion: short, left aligned, and never allowed to become a wide marketing headline.

## Layout

The app uses one centered working column: `min(100% - 40px, 680px)` on larger screens and `min(100% - 32px, 680px)` at 520px and below. The sticky topbar aligns to a wider 1000px maximum, so shop identity remains easy to locate while request content stays concentrated. The home starts with 72px of breathing room above its signature grid (48px on compact screens); flows use a 28px top entry.

Lists and form areas are line-based rather than card-based. Two-column print controls use a 15px gap and collapse to one column at the single 520px breakpoint. Vertical rhythm is practical rather than airy: 8–16px for control internals, 26px between related sections, and 48px before major follow-up content.

**The One Working Column Rule.** Keep request-making, payment, and status tasks inside the narrow reading column even when the surrounding canvas is wide.

## Elevation & Depth

Sprint is flat by default. Borders, two paper tones, and the background grid create hierarchy; lists never become floating cards. The primary action alone casts the established cobalt shadow (`0 8px 20px rgba(14, 79, 201, 0.22)`) and moves up 1px on hover. The only surface blur is the sticky topbar’s 18px backdrop blur over paper-glass; do not extend blur or shadow treatments to other containers.

### Shadow Vocabulary

- **Primary-action lift** (`0 8px 20px rgba(14, 79, 201, 0.22)`): Reserved for available cobalt primary actions.

### Named Rules

**The Flat Service Counter Rule.** If a boundary is needed, use a rule; do not solve it with cards, ambient shadows, or layered panels.

## Shapes

The form language is square and printed: buttons, fields, segmented choices, service icons, slips, and notices all have 0 radius. Rules are typically 1px; price and receipt tops use a 2px heavy rule to behave like a tear-off receipt edge. The lone rounded form is the 8px circular live or availability dot.

## Components

### Brand Mark

The `sprint` wordmark pairs tight, heavy lowercase lettering with a tilted 3×3 cobalt/navy grid. It is a compact service identifier, not a hero logo; the `by abh1` qualifier shrinks to 11px and drops on compact screens.

### Navigation

- **Topbar:** A 70px sticky paper-glass bar with a bottom rule; reduce it to 62px below 520px.
- **Shop context:** Place shop name or live state at the right. Truncate shop names rather than wrapping the bar.
- **Live state:** Use the compact bordered chip and green dot only for active connection state.

### Buttons

- **Shape:** Square edges (0 radius), at least 50px high, and a 12px × 16px internal action pad.
- **Primary:** Operational Cobalt with action-text and a strong 780 weight; use for the single forward step in a view.
- **Hover / Focus:** Darken to Pressed Cobalt and rise 1px on hover; use the shared 3px Focus Blue outline with a 3px offset for keyboard focus.
- **Secondary:** Counter Paper with a 1px neutral border; use for a safe return or a non-primary next task.

### Service Rows

- **Structure:** Full-width, 76px-minimum, three-column rows: 34px icon lane, flexible content, 24px chevron lane.
- **Border:** A top rule begins the list and each row ends with a rule.
- **Interaction:** Keep the default row nearly paper-flat; its hover state uses Soft Blue Register rather than elevation.

### Inputs / Fields

- **Style:** Field Paper with a 1px Field Border, square corners, and 44px minimum height.
- **Focus:** The shared Focus Blue outline is applied by the native focus-visible rule; file selection also receives Soft Blue Register.
- **Segmented choice:** Adjacent square cells share one border seam. A selected option gets Soft Blue Register, blue-ink text, and 800 weight.

### File Slot

- **Style:** A 132px-minimum centered upload target enclosed only by a top and bottom rule.
- **Uploaded state:** Replace the drop prompt with a compact 84px file row, cobalt file icon, metadata, and a transparent icon-only remove control.

### Price Slip / Receipt

- **Style:** Two-column price information on Counter Paper, framed by a 2px top rule and a 1px lower rule; receipts use 2px rules at both edges.
- **Type:** The amount is a tightly tracked, oversized ink figure. Keep server-calculation and request metadata in the muted label style beneath it.

### Request Status Rail

- **Style:** A line-led ordered list with 50px-minimum stages and no progress bar.
- **State:** Completed stages use Ready Green and a check icon; upcoming stages remain muted with a clock icon.

## Do's and Don'ts

### Do:

- **Do** retain the bright Counter Paper canvas and faint 24px construction grid on customer screens.
- **Do** use Cobalt for the one main action, key request number, and functional icon emphasis.
- **Do** make boundaries with the established 1px and 2px rules before considering another surface.
- **Do** preserve 44px-minimum fields, 50px-minimum actions, visible 3px keyboard focus, and the reduced-motion override.
- **Do** keep the topbar as the only sticky, blurred layer.

### Don't:

- **Don't** introduce rounded cards, pill buttons, glass panels, or general-purpose drop shadows.
- **Don't** add decorative gradients, glow effects, or a second loud accent color.
- **Don't** turn the narrow customer task column into a dashboard or a wide marketing layout.
- **Don't** use green or red for ordinary decoration; they are state signals.
