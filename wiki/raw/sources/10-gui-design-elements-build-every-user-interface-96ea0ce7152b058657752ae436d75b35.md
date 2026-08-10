# 10 GUI Design Elements Build Every User Interface Source Note

Source URL: https://www.uxtigers.com/post/gui-widgets
Publisher: UX Tigers
Author: Jakob Nielsen
Published: 2026-07-29
Retrieved: 2026-08-10
Reading time shown on the page: 28 minutes

## Ingest Focus

This note preserves the article's model for choosing and designing familiar GUI
controls. It does not archive the full article or its illustrations. It keeps
the control semantics, design rules, common failures, and implications for
generative and agentic interfaces needed for later product work.

## Core Model

- The article treats 10 familiar controls as an interaction alphabet: buttons,
  input fields and forms, menus, links, dialog boxes, alerts and messages,
  icons, checkboxes and radio buttons, tabs, and search.
- It groups the controls by job. Buttons act. Forms, selection controls, and
  search accept input. Menus, links, and tabs navigate. Dialogs and alerts let
  the system ask or report. Icons represent objects, actions, and states.
- Windows and the pointer complete the older WIMP model. Product designers now
  inherit much of their behavior from the operating system and browser, but
  can still damage it through unexpected windows, altered scrolling, false
  cursor signals, or hover-only interactions.
- Familiar controls carry learning shared across products. The article applies
  Jakob's Law: people spend most of their time in other products and expect a
  new interface to follow conventions they already know.
- The 86 guidelines reduce to three goals: do not make people remember, guess,
  or wait. The interface should limit demands on memory, certainty, and time.

## Element Notes

### Buttons

- Use a button for an action that changes something, and label it with a verb
  and the outcome. Use a link when the result is navigation.
- Make the control visibly pressable, give each screen one dominant primary
  action, place the action at the end of its task, and acknowledge a press
  within 0.1 seconds.
- Apply Fitts's law by making frequent targets large and close. The article
  recommends touch targets of at least 1 by 1 centimeter.
- Keep temporarily unavailable actions visible in a muted state and explain
  why they are unavailable and how to enable them.
- Use a split button only when one action clearly dominates its variants. Give
  the default action the larger target and separate it visibly from the menu.

### Input fields and forms

- Remove every field that is not needed. Optional fields still consume
  attention and can reduce completion.
- Keep labels visible outside fields. Placeholder text may provide a hint but
  should not be the only label.
- Accept reasonable variations in input format, preserve entered data after an
  error, and place a plain-language error beside the affected field.
- Use controls suited to the data, such as a date picker for dates. Prefer a
  single-column layout with related fields grouped together.
- Do not flag incomplete input while the person is still typing. Validate when
  the person leaves the field or submits the form.
- A truthful estimate such as the number of questions or expected completion
  time can reduce perceived burden before a form begins.

### Menus

- A menu presents a bounded inventory of commands or destinations. Search is a
  better fit when the possible intents are too broad to enumerate.
- Name categories in the language users employ. Verify the structure with card
  sorting or tree testing instead of copying an organization chart.
- Prefer click-to-open menus. If hover is necessary, add a delay and diagonal
  tolerance. Limit cascading menus to two levels.
- Keep top-level navigation visible on desktop. Reserve hidden hamburger
  navigation for screens that lack room for visible choices.
- Show the current location, order choices by importance or frequency, and
  promote the most frequent commands out of the menu into visible controls.

### Links

- Use links for navigation and buttons for actions. Their different visual
  forms tell people what kind of result to expect.
- Make links recognizable, especially inside prose. Color plus an underline is
  stronger than color alone and does not depend on color perception.
- Write link text that predicts its destination, works outside its surrounding
  sentence, and puts the informative words first.
- Distinguish visited links when revisiting is likely. Open links in the same
  tab by default and label deliberate exceptions such as PDF files.

### Dialog boxes

- Use a modal dialog only when work cannot continue without a decision. Use a
  modeless surface when the main task can continue.
- Label actions with their outcomes instead of generic OK and Cancel labels.
  Make the safe action the default and let Escape cancel.
- Ask one short question per dialog. Prefer undo to repeated confirmation for
  reversible actions so people do not learn to dismiss warnings reflexively.
- Do not interrupt a new visitor with an overlay, and never stack dialogs.
  Measure delayed costs such as churn as well as immediate overlay conversions.

### Alerts, notifications, and error messages

- Match the format to the consequence. A temporary toast can confirm a
  completed action, while a problem that needs action must remain visible until
  it is resolved. Reserve modal alerts for severe blocking events.
- State what went wrong, where it happened, and how to recover in plain
  language. Do not rely on raw error codes or blame the person.
- Combine words, an icon, and color so the message does not depend on color
  perception alone.
- Limit notifications and let people tune them. Too many low-value alerts teach
  people to ignore the important ones.

### Icons

- Use a standard symbol when one exists. Pair most icons with text because only
  a small set, such as search, home, settings, and delete, is broadly familiar.
- Test a new icon without its surrounding interface. Hesitation or conflicting
  interpretations show that it needs a label or a different symbol.
- Keep one visual style while giving icons distinct silhouettes. Do not redraw
  a learned symbol only to follow fashion.
- Design a favicon as one legible shape that still identifies the product at
  16 by 16 pixels.

### Checkboxes, radio buttons, and toggles

- Use checkboxes for independent choices that may be combined. Use radio
  buttons for one mutually exclusive choice. Their square and circular shapes
  communicate different selection rules.
- Stack options vertically and make each label part of the clickable target.
- Give a radio group a sensible default when that will not bias a response, and
  include a None option when abstention is valid.
- Phrase options positively. Represent a simple yes-or-no choice with one
  checkbox, and show two to four exclusive choices as visible radio buttons.
- Use a toggle only when the change takes effect immediately. If a later Save
  action commits the setting, use a checkbox.

### Tabs

- Use one row of short tab labels for parallel content of the same type and
  level. Make selected, hovered, and unselected states visibly different, and
  connect the selected tab to its panel.
- Do not use tabs for ordered steps. Do not separate information that people
  must compare, because switching panels turns recognition into a memory task.
- Open the most useful tab by default and give each tab its own URL when the
  platform supports bookmarking, sharing, and Back navigation.

### Search

- Show an open search field near the top of every page in a content-rich
  product. The article recommends room for at least 27 characters rather than
  hiding the field behind an icon.
- Support the magnifying-glass convention and the Enter key. Tolerate common
  spelling, plural, and synonym variations.
- Keep the query visible on the results page, design results as a complete
  interface, and index every area people consider part of the product.
- Review search logs regularly. Frequent queries with poor results reveal
  unmet needs in users' own words.

### Windows, scrolling, pointers, and focus

- Open content in the current tab by default and protect the Back button.
- Preserve normal scrolling, keep scrollbars visible, and use infinite scroll
  only when people do not need controls or a footer below the list.
- Put important content first because people may scroll but attention declines
  farther down a page.
- Keep platform-standard cursors and match each cursor to the real behavior.
  Show a busy indicator for waits longer than one second.
- Do not make hover the only path to important information or actions. Keep a
  visible focus indicator for keyboard navigation.

## Generative and Agentic Interfaces

- The article predicts that familiar controls will remain useful when AI
  generates interfaces from intent. Dynamic layouts weaken spatial memory, so
  stable widget conventions provide orientation.
- Agentic systems also reuse the familiar controls for supervision: approve,
  pause, inspect, and undo. Generative composition increases rather than
  removes the need for consistent control semantics.

## Source Limits

This is a paraphrased note from a prescriptive UX essay. The article links to
supporting work for some guidelines, but this ingest did not independently
verify its historical dates, response-time thresholds, target-size guidance,
business examples, prevalence estimates, or claims about traffic and user
behavior. Consult the original page and its linked sources before using those
details as independent evidence or quoting the author. The page's structured
metadata gives 2026-07-29 as both the publication and modification date.
