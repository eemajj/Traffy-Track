---
name: CityData Case Tracker
description: Contemporary civic operations dashboard for Thawi Watthana district case tracking.
colors:
  primary: "#00744B"
  primary-deep: "#005F3E"
  accent-cold: "#63C9A2"
  neutral-bg: "#F5FAF7"
  surface: "#EAF4EF"
  surface-strong: "#DBEAE2"
  ink: "#11251D"
  muted: "#526B61"
  border: "#C6D9CF"
  success: "#2F7D4E"
  warning: "#C98322"
  danger: "#B13A3A"
typography:
  display:
    fontFamily: "IBM Plex Sans Thai, IBM Plex Sans, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "2rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "IBM Plex Sans Thai, IBM Plex Sans, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.01em"
  title:
    fontFamily: "IBM Plex Sans Thai, IBM Plex Sans, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.35
  body:
    fontFamily: "IBM Plex Sans Thai, IBM Plex Sans, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "0.95rem"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "IBM Plex Sans Thai, IBM Plex Sans, Noto Sans Thai, system-ui, sans-serif"
    fontSize: "0.8rem"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "0.02em"
rounded:
  sm: "10px"
  md: "16px"
  lg: "24px"
  pill: "999px"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "32px"
  xxl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "#F5FAF7"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    typography: "{typography.label}"
  button-primary-hover:
    backgroundColor: "{colors.primary-deep}"
    textColor: "#F5FAF7"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "12px 20px"
    typography: "{typography.label}"
  panel:
    backgroundColor: "#FFFFFF"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "24px"
  status-danger:
    backgroundColor: "#F9E7E7"
    textColor: "{colors.danger}"
    rounded: "{rounded.pill}"
    padding: "6px 12px"
---

# Design System: CityData Case Tracker

## Overview

**Creative North Star: "Emerald civic control room"**

This system should feel like a calm civic operations surface built for long working sessions: cool daylight, disciplined structure, and clear signals. It is formal without stiffness. The design earns trust through consistency, spacing, and crisp hierarchy rather than by looking institutional or heavy.

The interface rejects two extremes at once: old bureaucratic clutter and trendy startup dashboard theatrics. It should never feel dusty, overloaded, beige, neon, glassy, or over-carded. Nordic here means cool light, quiet materials, and disciplined rhythm, not blank white emptiness or generic minimalism.

Key Characteristics:
- Green-tinted near-white architectural surfaces with one emerald civic anchor
- Tight, operational hierarchy with low ornament and clear status language
- Motion used for feedback and state transitions, never for spectacle
- Panels and lists that feel measured, not boxed-in or template-driven
- A modern public-service tone: steady, legible, competent

## Colors

The palette is restrained and calm, with Thawi Watthana emerald as the civic anchor and pale green-tinted layers doing most of the structural work.

### Primary
- **Civic Emerald** (`#00744B`): the main action and orientation color. Use for primary CTA, current location, selected state, active filters, and important directional cues.
- **Deep Civic Emerald** (`#005F3E`): hover and pressed depth for primary controls; also valid for compact headers that need stronger anchoring.

### Secondary
- **Mint Signal** (`#63C9A2`): a lighter accent for subtle emphasis, chart or badge support, and motion highlights. Never use as the main CTA.

### Neutral
- **Mist Ledger** (`#F5FAF7`): page background. It should read clean and lightly green-tinted, not warm or paper-like.
- **Mint Frost Panel** (`#EAF4EF`): secondary surface for toolbars, dropzones, grouped controls, and dashboard strips.
- **Civic Border** (`#C6D9CF`): boundaries, dividers, input strokes, and subtle structural lines.
- **Forest Ink** (`#11251D`): primary text and strong iconography.
- **Archive Green-Gray** (`#526B61`): secondary text, helper text, metadata, and inactive labels.

### Named Rules
**The Cold Architecture Rule.** Warmth must never come from the base surface. The page background stays cool and near-white; urgency and meaning come from signal colors and typography.

**The One-Anchor Rule.** Emerald carries navigation and action. Do not introduce extra saturated hues just to make a screen feel “designed.”

## Typography

**Display Font:** IBM Plex Sans Thai / IBM Plex Sans / Noto Sans Thai / system-ui / sans-serif  
**Body Font:** IBM Plex Sans Thai / IBM Plex Sans / Noto Sans Thai / system-ui / sans-serif  
**Label/Mono Font:** inherit the same family; use system monospace only for IDs and batch refs

**Character:** utilitarian, contemporary, and crisp. One family is enough here; the credibility comes from spacing, weight discipline, and alignment rather than from decorative pairings.

### Hierarchy
- **Display** (600, 2rem, 1.1): page titles and major section anchors only. This is not a marketing hero scale.
- **Headline** (600, 1.5rem, 1.2): section titles, modal headings, and important dashboard summaries.
- **Title** (600, 1.125rem, 1.35): card titles, data block headings, and action group labels.
- **Body** (400, 0.95rem, 1.6): core explanatory text and table-adjacent prose. Keep prose near 65–75ch where practical.
- **Label** (600, 0.8rem, 1.4): button text, field labels, badges, and meta headers. Use sentence case by default; all-caps only for rare machine-like tags.

### Named Rules
**The Operations Scale Rule.** Product typography stays compact and deliberate. No fluid hero type, no oversized display moments, and no decorative tracking tricks.

## Elevation

Depth is conveyed primarily through tonal layering and edge definition, with one soft ambient panel shadow for major containers. Most surfaces should feel seated in place, not floating.

### Shadow Vocabulary
- **Panel Lift** (`0 18px 40px rgba(34, 58, 110, 0.10)`): large page containers, login shell, and important summary panels.
- **Hover Lift** (`0 10px 24px rgba(34, 58, 110, 0.08)`): only for interactive tiles or dropzones that need a gentle hover response.

### Named Rules
**The Seated Surface Rule.** Panels default to tonal contrast and clean borders. Shadows appear sparingly and never compete with the information hierarchy.

## Components

### Buttons
- **Shape:** soft-rectangular, not playful (`16px` radius)
- **Primary:** Civic Emerald fill with near-white text, medium horizontal padding, and confident weight
- **Hover / Focus:** darken toward Deep Civic Emerald; focus ring should be a soft emerald halo, not browser blue
- **Secondary / Ghost:** frost or white surfaces with clear ink text and a visible structural border

### Chips
- **Style:** compact pills with low-saturation background tint and strong text
- **State:** each status chip must combine color + wording; no color-only semantics

### Cards / Containers
- **Corner Style:** `24px` for major shells, `16px` for nested panels
- **Background:** white first, frost second
- **Shadow Strategy:** only major shells get Panel Lift; internal groups rely on tonal separation
- **Border:** thin cool border for sub-panels and input groups
- **Internal Padding:** `24px` default, `16px` in denser control regions

### Inputs / Fields
- **Style:** calm white fill or frost fill with clear stroke, no oversized rounding
- **Focus:** stronger emerald ring and border shift; state must be immediately visible
- **Error / Disabled:** error uses danger tint + text; disabled uses lower-contrast neutrals but remains legible

### Navigation
- **Style:** top-level navigation should feel like a civic instrument panel, not a marketing navbar. Active items use emerald fill or underline logic consistently. Inactive items stay quiet.

### Dropzones
- **Style:** large, calm, instructional surfaces with dashed cool border and one strong signal state on drag-over
- **Behavior:** idle, dragging, success, and error states must each read distinctly

## Do's and Don'ts

### Do:
- **Do** keep the page background calm and near-white, using `#F5FAF7` or adjacent green-tinted tones instead of cream, parchment, or sand.
- **Do** use emerald as the main action and selection language, keeping it rare enough to matter.
- **Do** make pending or risky states unmistakable through color, text, and grouping together.
- **Do** use motion for feedback, reveal order, and state transition in the 150–220ms range with reduced-motion fallbacks.
- **Do** keep radii disciplined: `16px` for controls, `24px` for major containers, pills only for chips and small badges.

### Don't:
- **Don't** make this look like an old government system: no muddy beige backgrounds, no cramped tables as the only structure, no random default form controls.
- **Don't** make it look like a SaaS template: no hero metrics cliché, no repetitive equal cards as the whole composition, no gradient text.
- **Don't** use neon, glassmorphism, or loud startup-dashboard color drama.
- **Don't** interpret Nordic as empty white minimalism with weak contrast or invisible borders.
- **Don't** use motion as decoration. If an animation doesn't clarify state or progression, remove it.
