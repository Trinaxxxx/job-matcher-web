---
name: Job Matcher
description: Warm editorial paper meets an honest, monospaced scoreboard.
colors:
  bg: "#FFF6E9"
  surface: "#FFFFFF"
  surface-2: "#FBF1DE"
  fg: "#0A171D"
  muted: "#56666A"
  muted-2: "#8A9599"
  border: "rgba(10, 23, 29, 0.1)"
  border-strong: "rgba(10, 23, 29, 0.16)"
  accent: "#003F47"
  accent-hover: "#00313A"
  accent-soft: "rgba(0, 63, 71, 0.08)"
  ring: "rgba(0, 63, 71, 0.4)"
  highlight: "#FF6600"
  highlight-hover: "#E85A00"
  highlight-soft: "rgba(255, 102, 0, 0.12)"
  success: "#2f7d53"
  success-soft: "rgba(47, 125, 83, 0.12)"
  warning: "#9a6b12"
  danger: "#b4432f"
typography:
  display:
    fontFamily: "Bricolage Grotesque, var(--ff-sans), sans-serif"
    fontSize: "clamp(2.6rem, 6vw, 4.25rem)"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.03em"
  headline:
    fontFamily: "Bricolage Grotesque, var(--ff-sans), sans-serif"
    fontSize: "clamp(1.9rem, 3.5vw, 2.75rem)"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Bricolage Grotesque, var(--ff-sans), sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  body:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Hanken Grotesk, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.12em"
  data:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1
    letterSpacing: "normal"
    fontFeature: "tabular-nums"
rounded:
  badge: "6px"
  control: "10px"
  tile: "12px"
  card: "14px"
  panel: "16px"
spacing:
  gutter: "16px"
  gutter-lg: "24px"
  section-y: "64px"
  section-y-lg: "96px"
  stack: "40px"
  hero-gap: "56px"
components:
  button-primary:
    backgroundColor: "{colors.highlight}"
    textColor: "#FFFFFF"
    rounded: "{rounded.control}"
    padding: "0.625rem 1.25rem"
  button-primary-hover:
    backgroundColor: "{colors.highlight-hover}"
  button-ghost:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "0.625rem 1.25rem"
  button-ghost-hover:
    backgroundColor: "{colors.surface-2}"
    textColor: "{colors.accent}"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.card}"
  field:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.fg}"
    rounded: "{rounded.control}"
    padding: "0.55rem 0.75rem"
  badge:
    textColor: "{colors.accent}"
    backgroundColor: "{colors.accent-soft}"
    rounded: "{rounded.badge}"
    padding: "0.15rem 0.5rem"
  score-tile:
    backgroundColor: "{colors.success-soft}"
    textColor: "{colors.success}"
    rounded: "{rounded.tile}"
    typography: "{typography.data}"
    size: "3.5rem"
---

# Design System: Job Matcher

## Overview

**Creative North Star: "The Honest Ledger"**

Job Matcher reads like a well-kept ledger on warm paper: cream stock, ink-black text, and a column of monospaced figures you are meant to trust. The world is warm-confidence — editorial warmth carrying hard, legible data. Nothing is hyped; the numbers do the arguing. The surface is calm and typographic, built so a dense ranked list of jobs feels readable rather than busy. Its one restraint is an earned loudness: a single bright orange that marks the way forward and the payoff at the end of the pipeline.

The system runs two themes from one set of semantic tokens. Light is the home voice — warm editorial cream (`bg` #FFF6E9) under ink (`fg` #0A171D), with deep teal (`accent` #003F47) carrying structure, links, and every AI mark. Dark is a cooler monochrome: a near-black teal ground (#06141B) with teal surfaces and a lighter teal accent (#5FB8A9). The orange highlight is the only color shared verbatim across both modes; its constancy is what makes it read as "the action" regardless of theme.

Against the category default (a centered marketing headline over an abstract gradient), this world refuses decoration for its own sake. Depth is near-flat, motion is a single authored entrance, and icons are drawn, never glyphs from a system font. The artifact — a ranked shortlist with scores and plain-English reasons — is the hero.

**Key Characteristics:**
- Warm editorial paper (light) / cool monochrome (dark), one semantic token set driving both.
- Monospaced tabular figures on every score, count, and sub-score.
- Deep teal for structure and AI marks; one reserved orange for the action and the payoff.
- Near-flat surfaces, hairline borders, soft ambient shadow only on the hero artifact.
- Drawn 1.7-stroke icons at 22px; no glyph fonts.

## Colors

A warm, low-saturation editorial palette: cream and ink carry the page, deep teal carries structure, and a single orange carries momentum. Tier colors are reused verbatim as fit-score badges.

### Primary
- **Reserved Orange** (#FF6600): The only loud color. It marks the primary action (`Find my matches`), the animated funnel flow line, and the funnel's terminal "shortlist" node — the conversion path and its payoff, nothing else. Shared identically across light and dark.
- **Deep Teal** (#003F47 light / #5FB8A9 dark): The structural voice — links, AI marks, selected states, icon tiles, the "Why ·" and "AI reviewed" labels, and mid-tier (65–79) fit badges. In dark mode it also becomes the card/surface color.

### Neutral
- **Cream Paper** (#FFF6E9 light bg / #06141B dark bg): The ground. A fixed radial wash of `accent-soft` from the top keeps flat sections from going sterile.
- **Surface White** (#FFFFFF light / #003F47 dark): Card and field fill.
- **Warm Panel** (#FBF1DE light / #11212D dark): The `surface-2` tonal layer — alternating section bands, filled chips, empty/skeleton states.
- **Ink** (#0A171D light / #CCD0CF dark): Primary text.
- **Muted** (#56666A light / #9BA8AB dark) and **Muted-2** (#8A9599 light / #6B7D82 dark): Secondary copy, metadata, placeholders.
- **Hairline Border** (rgba(10,23,29,0.1) light / rgba(255,255,255,0.1) dark) and its **Strong** sibling (0.16 / 0.15): Every divider and container edge.

### Semantic / Tier
- **Success Green** (#2f7d53, soft rgba(47,125,83,0.12)): Fit scores ≥ 80 ("Strong").
- **Warning Amber** (#9a6b12): Fit scores 50–64 ("Possible"); rendered on a 12%-opacity amber fill.
- **Danger** (#b4432f): Error/destructive only — not a tier color.

### Named Rules
**The One Orange Rule.** Orange appears only on the conversion path: the primary button, the flow line, and the funnel's final outcome node. If orange shows up on a heading, an icon, or an ordinary row, it has escaped its lane.

**The Teal-Is-Structure Rule.** Every AI mark, link, and "why" label is teal. Teal signals "the system did this and will explain it"; it never competes with orange for the action.

**The Reused-Tier Rule.** Fit-score badges are not a separate color system. They reuse the tier palette verbatim — success-soft ≥ 80, accent-soft ≥ 65, warning ≥ 50, muted below — so the landing hero and the product's results table read identically.

## Typography

**Display Font:** Bricolage Grotesque (fallback Hanken Grotesk, then sans-serif) — headings only.
**Body Font:** Hanken Grotesk (fallback ui-sans-serif, system-ui) — all body and UI.
**Label/Mono Font:** Geist Mono (fallback ui-monospace) — scores, counts, and data only.

**Character:** A humanist-grotesque pairing with warmth and optical sizing: Bricolage brings optimism and tight tracking to headlines, Hanken stays calm and highly legible in dense job data, and Geist Mono gives every number a tabular, trustworthy cadence. Headings set tight (-0.02em, -0.03em on h1) with balanced wrapping.

### Hierarchy
- **Display** (600, clamp(2.6rem, 6vw, 4.25rem), line-height 1.05): The hero h1, set two lines, tracking -0.03em.
- **Headline** (600, clamp(1.9rem, 3.5vw, 2.75rem), line-height ~1.12): Section h2s; the final CTA runs slightly larger (clamp(2rem, 4vw, 3.25rem)).
- **Title** (600, 1.125rem): Step and trust-term h3s (display font).
- **Body** (400, 1rem, line-height 1.6): Running copy; lead paragraphs step up to 1.125rem (text-lg) in muted.
- **Label** (600, 0.6875rem, letter-spacing 0.12em, UPPERCASE): Functional micro-headers — "Sample matches", "One example search", results-table column heads. A native device of this world, not a marketing eyebrow.
- **Data** (600, Geist Mono, tabular-nums): Fit scores (1.5rem in the hero tile), funnel counts (1.125rem), and keyword sub-scores (down to 0.625rem).

### Named Rules
**The Mono-For-Numbers Rule.** Geist Mono and `tabular-nums` appear on every numeral that represents data — scores, tiers' counts, kw sub-scores — and nowhere else. Prose never uses the mono face.

## Layout

Centered single-column reading measure inside a `max-w-6xl` (72rem) container, with `px-4` gutters opening to `sm:px-6`. Sections are stacked full-bleed bands separated by hairline top borders, alternating plain `background` with a translucent `surface-2/40` tint for rhythm. Vertical rhythm is generous: `py-16` sections expanding to `lg:py-24` (CTA bands to `lg:py-28`). The spacing scale is Tailwind's 4px base; recurring steps are 16px gutters, 40px / 56px content gaps, and the 64/96px section band. The hero is an asymmetric two-column grid (`lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]`) giving the ranked-list artifact the wider share; below `lg` it stacks, artifact under copy. Lead paragraphs are capped at `max-w-xl`.

## Elevation & Depth

Near-flat by intent. Surfaces rest at `shadow-sm` (barely-there 1px) or no shadow at all; depth comes from hairline borders and the warm tonal layering of `surface`/`surface-2`, not from lifting. A single fixed radial light wash (`accent-soft` from top center) sits behind everything to keep flat bands from feeling sterile. Only the hero's score-list card is lifted, via `card-lift` (`shadow-md`), to signal "this is the live artifact."

### Shadow Vocabulary
- **Resting** (`box-shadow: 0 1px 2px rgba(10,23,29,0.06)` light): Default card/button seat.
- **Lifted** (`box-shadow: 0 1px 2px …, 0 10px 26px -14px rgba(10,23,29,0.22)` light): The `card-lift` artifact shadow; dark mode deepens to a 12px/30px spread.

### Named Rules
**The Flat-Paper Rule.** Surfaces are flat on warm paper. One element per view may lift (the hero artifact); everything else holds with a hairline and a tonal fill.

## Shapes

Soft, consistent rounding on a small scale: hairline 1px borders everywhere, no hard geometry. The radius family climbs by component weight — badges 6px, buttons and fields 10px, score tiles 12px (`rounded-xl`), cards 14px (the `--radius` token), and wide section panels 16px (`rounded-2xl`). Funnel nodes are full circles (`rounded-full`), the one non-rectilinear silhouette, chosen to read as pipeline stages. Icon chips are 8–10px squares (`rounded-lg`/`rounded-md`).

## Components

### Buttons
- **Shape:** Gently rounded (10px), inline-flex with a 0.5rem gap for trailing icons.
- **Primary:** Orange fill (`highlight`) with white text and `shadow-sm`; hover deepens to `highlight-hover`. The sole orange element on most views. Carries the drawn `rank` icon on CTAs.
- **Ghost:** Surface fill with a strong hairline; hover shifts border and text to teal over a `surface-2` fill.
- **Quiet / Small:** `btn-quiet` is a muted text-only link darkening to `fg`; `btn-sm` tightens padding for the header.
- **States:** All buttons share an `:active` press (`translateY(1px) scale(0.99)`), a 0.5 disabled opacity, and a shared 3px teal focus ring (`ring`).

### Badges / Chips
- **Style:** 6px corners, 0.75rem text, weight 600, tabular-nums. Color pairs a soft tint with its matching solid — `accent-soft`/`accent` for "AI reviewed", `surface-2`/`muted` for "keyword only".
- **Fit badge:** The signature chip — tier-colored by score threshold, shared with the results table.

### Cards / Containers
- **Corner Style:** 14px (`--radius`).
- **Background:** `surface`, hairline `border`, resting `shadow-sm`.
- **Lift:** Add `card-lift` (`shadow-md`) only for the hero artifact.

### Inputs / Fields
- **Style:** Surface fill, strong hairline, 10px radius, muted-2 placeholder.
- **Focus:** Shared 3px teal glow ring; hover (when unfocused) shifts the border to teal.

### Navigation
- **Style:** Sticky top header, translucent `background/80` with `backdrop-blur-md` and a hairline bottom border. Left wordmark ("jm" teal tile + "Job Matcher" in display), right-aligned quiet link, theme toggle, ghost "Log in", and the orange primary CTA.

### Score Index (signature)
The ranked-shortlist-as-hero: a lifted card of rows, each leading with a 56px tier-colored score tile (Geist Mono 1.5rem) and tier label, then role/company/location and a one-line teal-prefixed "Why ·". AI rows carry the "AI reviewed" badge plus a mono `kw` sub-score. Rows enter with staggered `rise` motion.

### Funnel (signature)
A four-stage horizontal pipeline of circular count nodes over an animated orange `flow` line; the terminal node flips from teal hairline to orange to mark the payoff.

### Motion
One authored entrance, fully gated on `prefers-reduced-motion`. `rise` (0.7s `cubic-bezier(0.16, 1, 0.3, 1)`, opacity + 14px translate + blur) fades content up with per-row stagger via `--rise-delay`. `flow` (1.4s, same easing) draws the funnel line via stroke-dashoffset. Content is server-rendered and fully visible without motion.

## Do's and Don'ts

### Do:
- **Do** set every score, count, and sub-score in Geist Mono with `tabular-nums`.
- **Do** reuse the tier palette verbatim for fit badges (success-soft ≥ 80, accent-soft ≥ 65, warning ≥ 50, muted below).
- **Do** keep orange on the conversion path only — the primary button, the flow line, and the funnel's final node.
- **Do** drive color from the semantic tokens so both light and dark themes stay correct.
- **Do** draw icons as 1.7-stroke, 22px SVGs on a 24px viewBox.
- **Do** separate bands with hairline borders and alternating `surface-2/40` tints.

### Don't:
- **Don't** lift more than one element per view; the hero artifact is the exception, not the rule.
- **Don't** use glyph-font or emoji icons; the drawn stroke set is the vocabulary.
- **Don't** put the display or body face on data, or the mono face on prose.
- **Don't** let a heading, icon, or ordinary row turn orange.
- **Don't** introduce hard-edged or zero-radius surfaces; stay on the 6–16px rounded family.
