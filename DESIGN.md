---
name: QIR Optimizer Review 3
description: An interactive research companion set like conference proceedings, with live figures computed by the real engine.
colors:
  ground: "#fbfbfa"
  plate: "#ffffff"
  ink: "#151515"
  ink-2: "#4b4b48"
  ink-3: "#6e6e69"
  rule: "#dcdcd7"
  rule-2: "#ebebe7"
  rewrite-ultramarine: "#2f3fd0"
  rewrite-ink: "#2433b8"
  rewrite-wash: "#eceefd"
  refusal-amber: "#9a5600"
  refusal-wash: "#fbf1e3"
  verdict-ok: "#1f6b3a"
  verdict-bad: "#b3261e"
  verdict-bad-wash: "#fbeceb"
  series-light: "#b4b4ad"
  series-mid: "#74746d"
typography:
  display:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "clamp(34px, 3.6vw, 50px)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.022em"
    fontVariation: "'opsz' 60"
  headline:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "34px"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.015em"
    fontVariation: "'opsz' 48"
  title:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.005em"
  lede:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "20.5px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "18px"
    fontWeight: 400
    lineHeight: 1.62
  margin:
    fontFamily: "'Source Serif 4 Variable', 'Source Serif 4', Georgia, serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  section-number:
    fontFamily: "'Archivo Narrow', 'Arial Narrow', sans-serif"
    fontSize: "22px"
    fontWeight: 600
    fontFeature: "tnum"
  label:
    fontFamily: "'Archivo Narrow', 'Arial Narrow', sans-serif"
    fontSize: "14px"
    fontWeight: 600
    letterSpacing: "0.03em"
  label-caps:
    fontFamily: "'Archivo Narrow', 'Arial Narrow', sans-serif"
    fontSize: "13px"
    fontWeight: 700
    letterSpacing: "0.05em"
  code:
    fontFamily: "'JetBrains Mono Variable', 'JetBrains Mono', ui-monospace, monospace"
    fontSize: "12.5px"
    fontWeight: 400
    lineHeight: 1.6
rounded:
  control: "2px"
  inline-code: "3px"
spacing:
  rail: "248px"
  margin-column: "300px"
  measure: "68ch"
  column-gap: "48px"
  section-pad: "72px 56px 56px 64px"
  plate-bar: "10px 14px"
  plate-body: "16px"
components:
  button:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-hover:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate}"
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 12px"
  button-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.plate}"
  tag:
    typography: "{typography.label-caps}"
    rounded: "{rounded.control}"
    padding: "1px 7px"
  plate:
    backgroundColor: "{colors.plate}"
    rounded: "0"
  plate-bar:
    typography: "{typography.label}"
    padding: "{spacing.plate-bar}"
  margin-note:
    textColor: "{colors.ink-2}"
    typography: "{typography.margin}"
  toc-link:
    textColor: "{colors.ink-2}"
    padding: "5px 0"
  toc-link-current:
    textColor: "{colors.ink}"
  code-view:
    backgroundColor: "{colors.plate}"
    textColor: "{colors.ink}"
    typography: "{typography.code}"
---

# Design System: QIR Optimizer Review 3

## Overview

**Creative North Star: "The Companion Proceedings"**

The site reads as the companion artifact a CGO or PLDI paper ships: numbered sections, formal definitions, theorem-and-evidence pairs, and figures that the real engine computes live. Its idiom comes from the audience's own publishing tradition, so the reader is treated as a peer reviewer. It is not a slide deck and not a product landing page. Typesetting carries the authority: a serif text face at a true measure, a condensed grotesk for figure apparatus and running heads, and monospace only where IR or code is shown.

The page is dense but measured. A sticky contents rail sits on the left. Each section pairs a reading column with a margin column for citations, presenter script and viva notes. Figures are hairline-ruled white plates on a bright neutral ground, each with a numbered caption. Colour is close to absent: everything is ink on paper except two semantic hues, which mark what the optimizer did.

**Key Characteristics:**
- Proceedings furniture: running heads, § numbers, numbered figure and table captions, C1–C4 contributions, a two-column reference list.
- Reading column at 68ch, with a margin column beside it.
- Figures are flat white plates with a 1px ink border. There are no shadows anywhere.
- Ink near-black for everything structural. Ultramarine means "rewrite", amber means "refused".
- State is carried by mark form as well as hue: strike-through for removed, dashed outline for refused.

## Colors

A neutral proceedings palette: warm-grey ink on near-white paper, with two reserved semantic hues and a verdict pair.

### Primary
- **Rewrite Ultramarine** (`rewrite-ultramarine`): the single accent. Reserved for marks of a rewrite: removed, changed and added gates, struck code lines, focus rings and text selection. **Rewrite Ink** (`rewrite-ink`) is its text-weight shade for links and the rewrite tag. **Rewrite Wash** (`rewrite-wash`) is the background for highlighted or struck code lines and added gates.

### Secondary
- **Refusal Amber** (`refusal-amber`): a rewrite the optimizer declined, plus the dependence that blocked it. It appears as a dashed gate outline, a dashed underline on a code line, and the refused tag. **Refusal Wash** (`refusal-wash`) fills refused gates and lines, and warning diagnostics.

### Tertiary
- **Verdict Green / Verdict Red** (`verdict-ok`, `verdict-bad`, with `verdict-bad-wash`): pass/fail outcomes only, such as test status, equivalence verdicts, error diagnostics and the unsafe optimizer's broken result. Never decorative.

### Neutral
- **Proceedings Paper** (`ground`): the page ground.
- **Plate White** (`plate`): figure plates, buttons, code views and callouts.
- **Press Ink** (`ink`): text, plate borders, the rail rule, primary and pressed controls, and the darkest chart series.
- **Secondary Ink** (`ink-2`): margin notes, captions, inactive contents entries.
- **Tertiary Ink** (`ink-3`): section numbers, contribution numerals C1–C4, reference numbers, running heads, axis labels and affiliations.
- **Hairline** (`rule`, `rule-2`): section dividers, plate-bar and table rules; `rule-2` fills inline code and bar tracks.
- **Chart Series Ramp** (`series-light`, `series-mid`, then `ink`): baseline, intermediate and full configurations in benchmark charts.

### Named Rules
**The Two Meanings Rule.** Ultramarine means "the optimizer rewrote this". Amber means "the optimizer refused this". Neither hue appears for any other reason. Section numbers, numerals and chart series stay in the neutral ramp.

**The Mark Form Rule.** Every state hue is paired with a form: removed is struck through, refused is a dashed outline or dashed underline, added is filled with the wash. The state must still read in greyscale. Dashed ink without amber is structural only (block boundaries, the presenter-script note) and never means refusal.

## Typography

**Display Font:** Source Serif 4 Variable, optical sizing on (with Georgia)
**Label Font:** Archivo Narrow 500/600/700 (with Arial Narrow)
**Mono Font:** JetBrains Mono Variable (with ui-monospace)

**Character:** A scholarly text serif does the arguing. A condensed grotesk does the apparatus around it, the way a journal sets figure labels and running heads. Mono is confined to IR, code, diagnostics and keyboard keys.

### Hierarchy
- **Display**: the paper title only, balanced wrap.
- **Headline**: section titles, preceded by a tertiary-ink § number in the label face with tabular numerals.
- **Title**: subsections inside a section.
- **Lede / Body**: body is 18px at 1.62, held to the 68ch measure. Lede is used for opening claims. Abstract text drops to 17px.
- **Margin**: margin notes, captions (15.5px) and table text (15.5px, tabular numerals).
- **Label**: buttons, plate bars, run-in note heads, figure and table caption numbers ("Figure 1", bold, 0.04em tracking), circuit text.
- **Label caps**: table headers, pane heads, tags, the rail title and h4 block heads such as "Abstract" and "Contributions". Uppercase.
- **Code**: code views, the editor and diagnostics (12–12.5px); inline code is 0.82em on a `rule-2` chip.

### Named Rules
**The Three Voices Rule.** Serif argues, narrow grotesk labels, mono quotes code. Do not set prose in the grotesk or labels in the serif, and do not use mono for anything that is not program text.

**The Tabular Figures Rule.** Every number that can be compared (§ numbers, stats, table cells, bar values) uses tabular numerals.

## Layout

A two-track shell: a 248px sticky contents rail with a 1px ink rule on its right, and the document. Each section is a grid of a reading column (up to 68ch), a 48px gap and a 300px margin column. Section padding is 72/56/56/64px and sections are divided by hairlines. A `wide` section collapses to one column for spanning figures. Its prose stays capped at the measure, and its margin notes flow into an auto-fit grid beneath. Every section opens with a running head (paper short title left, "§n · title" right) over a hairline.

Responsive steps: at 1320px the margin narrows to 250px and the gap to 36px. At 1120px margin notes drop below the column as an auto-fit grid (min 240px), and two-up abstract/figure grids stack. At 860px the rail becomes a static top bar with a disclosure contents list in two columns, sections pad to 16px, side-by-side panes stack, body drops to 17px and headlines to 28px.

Rhythm: paragraphs 16px apart, figures 28/32px, definitions and callouts 22px, subsections 40px above.

### Named Rules
**The Scroll, Don't Clip Rule.** Wide content (circuits, code, display math, tables) scrolls horizontally inside its own container. It is never clipped and never shrunk below legibility.

## Elevation & Depth

Flat by doctrine. There are no box-shadows anywhere in the system. Depth comes from tonal layering: Plate White figures and controls sit on Proceedings Paper, framed by a 1px ink border. Hierarchy within a plate comes from hairline rules (plate bar, pane dividers, timeline and event strips), never from lift.

### Named Rules
**The Printed Page Rule.** If it could not be printed in a journal, it does not ship. That rules out shadows, blur, glow and gradients.

## Shapes

Square printed geometry. Controls, tags and keyboard keys take a barely-there 2px corner, inline code takes 3px, and plates, callouts, definitions and tables are fully square. Lines carry the structure: a 1px ink border frames plates, notes and callouts. Definitions and the abstract open with an ink top rule (1–1.5px) and close with a hairline. Table headers sit on a 1.5px ink rule. Icons come from one authored set on a 16px grid with a 1.6px stroke and square caps and miters, drawn inline as SVG.

## Components

### Buttons
Typeset, not styled. A button reads as a label in a box.
- **Shape:** 1px ink border, 2px corner.
- **Default:** plate fill, ink text, label face 600, 6px 12px padding.
- **Hover / Pressed:** fills ink with plate text (0.15s, expo-out ease). `aria-pressed` holds the inverted state.
- **Primary:** ink fill at rest. It is used for Play/Run.
- **Disabled:** 40% opacity, no hover inversion.
- **Segmented:** buttons share one ink border and are divided by internal ink rules, with square inner corners.
- **Focus:** 2px ultramarine outline, 3px offset, applied globally.

### Tags
- **Style:** label caps at 12.5px, a 1px border in `currentColor`, no fill, 2px corner.
- **Variants:** ok (green), bad (red), rewrite (rewrite ink), refused (amber).

### Figure Plates (signature)
- White plate with a 1px ink border and no radius or shadow.
- **Plate bar:** label-face controls and stats over a hairline.
- **Body:** 16px padding. Panes split by hairlines, and timeline and event strips are ruled above.
- **Caption:** sits below the plate. A bold label-face "Figure n" is followed by a serif caption in secondary ink.

### Margin Notes
- A 1px ink top rule with a bold label-face run-in head floated into the first line. Presenter-script notes use a dashed top rule. Script and viva notes are hidden in audience mode.

### Navigation
- **Rail:** label-caps title, then contents entries on a 30px number grid. Numbers are in tertiary ink. Entries are secondary ink and turn ink on hover. The current entry is ink at weight 600 with a 28px × 1.5px ink underline mark. The rail foot holds the audience-mode toggle (label caps, ink border, inverted when on).
- **Mobile:** a disclosure "Contents" list with a rotating chevron.

### Code View
- Mono 12.5/1.6 on plate, with a 40px right-aligned line-number gutter.
- Line states follow the Mark Form Rule. Highlighted lines get the rewrite wash. Removed lines get the rewrite wash plus a 1.5px ultramarine strike. Refused lines get the refusal wash plus a dashed amber underline. Error lines get the red wash.
- Syntax colours are muted print tones: keyword plum, function blue, number rust, string green, comment grey italic, labels ink 600.

### Circuit Diagram
- Wires are grey hairlines and gates are square plate-filled boxes with ink strokes and label-face 700 text. Basic-block boundaries are dashed ink lines with `%label` heads. Marked gates thicken to 2px in ultramarine (rewrite) or dashed amber (refused). Gates animate position with a 0.6s expo-out ease.

## Do's and Don'ts

### Do:
- **Do** number everything a reader might cite: § sections, Figure n, Table n, C1–C4, reference numbers.
- **Do** keep prose at the 68ch measure and put citations, script and viva answers in the margin column.
- **Do** frame every live figure as a white plate with a 1px ink border and a numbered caption below it.
- **Do** pair every state hue with a mark form (strike, dashed outline, wash).
- **Do** use the neutral series ramp (`series-light`, `series-mid`, `ink`) for chart and data series, with the darkest step for the full configuration.
- **Do** let wide figures scroll horizontally inside their plate.

### Don't:
- **Don't** use ultramarine or amber for emphasis, section numbers, numerals or decoration.
- **Don't** add shadows, gradients, glows or rounded cards. Plates are square and flat.
- **Don't** set code-like or IR text in anything but JetBrains Mono, and don't set prose in mono.
- **Don't** use dashed amber for anything except a refused rewrite.
