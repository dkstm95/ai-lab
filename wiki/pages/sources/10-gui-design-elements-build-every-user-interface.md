---
title: 10 GUI Design Elements Build Every User Interface
slug: 10-gui-design-elements-build-every-user-interface
kind: source
status: active
createdAt: 2026-08-10T12:41:00.258Z
updatedAt: 2026-08-10T12:41:00.258Z
reviewAfter: 2027-02-06T12:41:00.258Z
sources:
  - raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
---

## Summary

Jakob Nielsen presents 10 familiar GUI widgets (GUI 위젯) as an interaction alphabet and argues that each control should keep the semantic and visual conventions people learned in other products. The guidelines aim to reduce demands on memory, certainty, and time, including in interfaces assembled or operated by AI.

## Control Selection Guide

| User intent | Control | Contract to preserve |
| --- | --- | --- |
| Commit an action | Button | Look pressable and state the outcome with a verb |
| Enter structured information | Input field or form | Keep labels visible, accept reasonable formats, and preserve data after errors |
| Choose from bounded commands or destinations | Menu | Use the user's vocabulary and keep common choices visible |
| Navigate to another place | Link | Look like a link and predict the destination |
| Resolve a blocking decision | Modal dialog | Interrupt only when work cannot continue and label actions by outcome |
| Report status or recovery information | Alert, notification, or error message | Match persistence to severity and explain the way forward |
| Represent a familiar object, action, or state | Icon | Prefer a standard symbol and pair unfamiliar icons with text |
| Select independent options | Checkbox | Allow any combination and make the label clickable |
| Select one exclusive option | Radio button | Show the available choices and provide a valid default or None option |
| Change a setting immediately | Toggle | Apply the change at once rather than waiting for Save |
| Switch among peer panels | Tabs | Keep one row, show the active panel, and avoid sequential or comparative content |
| Express an open-ended goal | Search | Keep the field visible, tolerate language variation, and support query refinement |

## Key Claims

- accepted: The article describes buttons, forms, menus, links, dialogs, messages, icons, selection controls, tabs, and search as a small vocabulary that composes many modern interfaces.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Familiar control conventions let people transfer learning from other products instead of interpreting a new visual language in each interface.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Buttons should perform actions and state their outcomes, while links should navigate and predict their destinations.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Forms should remove unnecessary fields, keep labels visible, accept reasonable input formats, preserve entered data, and place recovery guidance beside an error.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Menus work best for a bounded and well-labeled set of choices, while search handles intents too broad to enumerate.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Desktop navigation should keep top-level choices visible, avoid deep hover cascades, show the current location, and expose frequent commands outside menus.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: A modal dialog should be reserved for a genuinely blocking decision, use outcome labels and a safe default, and yield to undo when an action is reversible.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Temporary messages suit confirmations, while actionable errors should remain visible and explain what happened, where it happened, and how to recover.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Most icons need text labels unless user research shows that the symbol is already widely understood in the intended context.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Checkboxes represent combinable choices, radio buttons represent one mutually exclusive choice, and toggles represent settings that take effect immediately.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Tabs fit parallel content of the same type and level, not ordered steps or information people must compare across panels.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Search should remain visible in content-rich products, tolerate common language variation, preserve the query on the results page, and expose query logs for product research.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Product interfaces should preserve standard window, scrolling, cursor, hover, and keyboard-focus behavior inherited from the platform.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: The article reduces its 86 guidelines to three goals: do not make people remember, guess, or wait.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md
- accepted: Dynamic interfaces composed or operated by AI increase the value of stable control conventions because people still need to orient themselves and supervise actions through controls such as approve, pause, inspect, and undo.
  source: raw/sources/10-gui-design-elements-build-every-user-interface-96ea0ce7152b058657752ae436d75b35.md

## Application Notes

- hypothesis: Audit a control by comparing its visible form, label, state, and actual result with the contract in the selection guide.
- hypothesis: A generative GUI system should constrain system-produced components by semantic role and platform convention instead of allowing arbitrary visual substitutes for familiar controls.
- hypothesis: Validate any custom icon, hidden navigation, new selection pattern, or unusual cursor with users before treating novelty as an improvement.
- hypothesis: AI-operated interfaces should make approve, pause, inspect, cancel, and undo actions stable even when the surrounding layout changes.

## Source Limits

- hypothesis: Treat the article as an expert design synthesis rather than one empirical study; verify its linked evidence before relying on a numeric threshold, historical detail, prevalence estimate, or business result.
- hypothesis: Consult the original page before using a direct quotation or an illustration because the raw note is a paraphrase and does not archive the images.
