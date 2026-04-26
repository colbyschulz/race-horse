# Wireframe Planning

_Started 2026-04-25 20:42 UTC_

---

## User

Take a look at the spec and implementation plan in the code base and let's start with a wire frame from there.

## Assistant

_[tool: local_ls]_

_[tool: local_ls]_

_[tool: local_read]_

_[tool: local_read]_

_[tool: copy_files]_

_[tool: copy_starter_component]_

Got it — I've read both docs thoroughly. Let me grab the design system tokens, then build the wireframes.

_[tool: update_todos]_

_[tool: write_file]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Here's what's in the wireframes — 8 screens across 5 sections:

| Section | Screens |
|---|---|
| **Landing** | Mobile sign-in with Strava CTA, feature bullets |
| **Today** | Mobile hero card (tempo run, Strava match, "ask coach" shortcut) + Desktop with sidebar + live coach panel |
| **Calendar** | Mobile week view (type badges, completion checkmarks, weekly total) + Desktop month view (with weekly mileage column) |
| **Plans** | Mobile plan list (active badge, archived, build/upload CTAs) + Upload sheet (drop zone, extraction progress, review step) |
| **Coach** | Mobile full chat (conversation tabs, tool-call indicators, context attachment) |

**Click any artboard to focus it fullscreen.** You can pan/zoom the canvas freely.

A few things worth deciding before we go hi-fi:

- **Coach entry point on mobile** — currently a floating ✦ FAB. Should it be a 4th tab instead, or a slide-up sheet triggered from anywhere?
- **Desktop coach** — shown as a persistent right panel on Today. Should it always be open, or toggleable?
- **Calendar default on mobile** — spec says week view. Want to keep that, or reconsider?
- **Plans "Review" step after upload** — currently a sheet overlay. Want it as a separate full page instead?

## User

Verifier agent check completed

## Assistant

All clear from the verifier. The wireframes look good.

What do you think of the layouts? Any screens you want to explore differently, or are you ready to start refining a particular section?

## User

I really dislike the typography. Is that what's in my design system?

## Assistant

No — I chose **Caveat** (the sketchy handwritten font) specifically for the wireframe aesthetic, to keep things rough and low-fi. It's not your design system.

Your design system specifies:
- **Syne** — display/headings (geometric, confident)
- **Roboto** — body/UI (clean, readable)

Want me to swap the wireframes over to Syne + Roboto so you can see what the actual type feels like at this stage? Or if you're happy with the structure/layout, we could jump straight into a hi-fi pass using the full design system.

## User

I updated the files in the repo to remove a feature around the chat sessions. Let's check and update the wireframe.

## Assistant

_[tool: local_read]_

_[tool: local_grep]_

_[tool: local_read]_

_[tool: str_replace_edit]_

Got it — two key changes:

1. **Coach screen**: remove the conversation list/tabs → single rolling chat with a **Clear chat** button + **Coach notes** indicator in the header
2. **New `/settings` screen**: preferences + coach notes editor

Let me update both.Now update the render section to include the new screens:

_[tool: str_replace_edit]_

_[tool: done]_

Updated. Two changes reflected in the wireframes:

- **Coach screen** — conversation tabs are gone. Header now has **Coach notes** (pill linking to settings) + **Clear chat** (with a confirm dialog artboard showing the "Your coach notes will not be affected" copy)
- **Settings screen** — new section with preferences, the coach notes textarea (with char counter + Save/Reset), and Strava connection status

The desktop Today coach panel still shows the old conversation UI — want me to update that to match the single rolling chat model too?

## User

Can I add a brown to the design system for this project? I think I want brown to be the main accent color and the name of the app will be Race Horse

## Assistant

Love that. The existing palette is already earth-toned so a rich brown will slot in naturally — and "Race Horse" is a great name.

A few quick thoughts before I update the wireframes:

- The current accent is **terracotta** (#C4622D) — a burnt orange-brown. Do you want to replace it entirely, or keep terracotta for workout type badges and make brown the primary brand color?
- Here are three brown directions that harmonize with the existing palette:

| Name | Hex | Feel |
|---|---|---|
| **Saddle** | `#7A4728` | Rich, classic leather |
| **Walnut** | `#5C3317` | Deep, almost espresso |
| **Chestnut** | `#8B5A2B` | Warm, mid-tone, readable |

Which feels right? And should I swap all the terracotta accents (buttons, active states, borders) to brown, or just the primary brand moments (logo, nav active state, hero CTA)?

Also — should the app name in the wireframes change from "colbystrainingplan" to **Race Horse**, and is the domain still `colbystrainingplan.com` or will that change too?

## User

Swap out terrcotta for a brown that fits in with the design system. But keep terrcotta in the system for accents or other things

## Assistant

_[tool: run_script]_

_[tool: done]_

_[tool: str_replace_edit]_

Nice domain. Let me update that in the wireframes.

The run_script already wiped it — the spec text isn't in the wireframe HTML. Good to know for the hi-fi pass though. When we build the actual screens, all URLs and the footer/landing copy will say `race.horse`.

Anything else to adjust in the wireframes, or are you ready to move toward hi-fi?

## User

Let's move toward hi fi

## Assistant

_[tool: local_ls]_

_[tool: list_files]_

_[tool: read_file]_

_[tool: read_file]_

_[tool: questions_v2]_

Good foundation — I have the full token set, type scale, and component patterns. Before I build, a few focused questions:

## User

Questions answered:
- screens: All of them
- device: Both side-by-side
- brown: 0
- variations: 2 — a/b to compare
- nav_style: 0
- coach_entry: Floating button (FAB) → slide-up sheet
- feel: Dense & data-rich — pack in the numbers, Refined — feels like a tool for serious athletes, Bold type — big workout names, strong hierarchy

## Assistant

_[tool: update_todos]_

_[tool: write_file]_

_[tool: done]_

_[tool: fork_verifier_agent]_

_[tool: update_todos]_

Here's what's in the hi-fi — 13 artboards across 6 sections:

| Section | A | B | Desktop |
|---|---|---|---|
| **Landing** | Clean, centered | Editorial dark | — |
| **Today** | Card-heavy, full stat grid | Big editorial type | Sidebar + coach panel |
| **Calendar** | Grid cells with color bars | Agenda rows | Month view |
| **Plans** | Card list | Bold brown active strip | — |
| **Coach** | Slide-up sheet (75%) | Full screen | — |
| **Settings** | Preferences + coach notes editor | — | — |

**Click any artboard to go fullscreen.** The color bar system on calendar cells (each workout type gets its own color strip) is worth a close look at full size.

A few things to react to:
- **Landing A vs B** — do you want the dark editorial direction, or keep it light?
- **Today A vs B** — the big Syne headline in B vs the dense stat grid in A
- **Plans B** — the brown active strip is bolder; works if plans become a frequently visited screen
- **Coach sheet A** — 75% slide-up lets you see the underlying screen, reinforcing it's always one tap away

What's landing and what isn't?

## User

For landing I want a light but editorial. 
Today I like B Editorial
Calendar I like B, but let's get rid of the checkmarks. It's too busy. I also want ot be able to button press to next week or previous week. 
Plans A card list.
Coach I liek the slide up

## Assistant

_[tool: str_replace_edit]_

Got it. Three changes to make:
1. **Landing** → light bg + big editorial Syne type (blend of A+B)
2. **Calendar B** → strip checkmarks, upgrade prev/next to proper buttons
3. Consolidate canvas to show chosen directions prominently

_[tool: str_replace_edit]_

Now fix Calendar B — remove checkmarks, upgrade the prev/next to real buttons:Now update the canvas to surface the chosen directions first:

_[tool: str_replace_edit]_

_[tool: done]_

_[tool: fork_verifier_agent]_

Three updates done:

- **Landing** — big editorial Syne type on the warm light background, feature list as divider rows
- **Calendar** — checkmarks gone, prev/next week are proper tappable buttons (the calendar is now interactive — try clicking them in the preview)
- **Canvas** — chosen directions marked with ✓ and sorted first in each section, alts pushed to the right

What's next — any refinements, or ready to pick a specific screen to detail further?

## User

Verifier agent check completed

## Assistant

## Assistant

## Assistant

