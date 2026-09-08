# Character wizard workspace shell

## Goal

The character creation wizard currently uses a narrow centered column. On desktop this leaves most of the viewport unused and makes the step navigation compete with the form content. This change introduces a desktop-first workspace shell for the existing wizard without changing its selection model, API payload, or step business rules.

## Scope

- Add a reusable `CharacterWorkspaceShell` component inside the character wizard feature.
- Render the wizard with a two-column desktop workspace: a persistent step rail and a scrollable content pane.
- Keep the action bar visible at the bottom of the content pane.
- Make completed steps and the current step clickable; future steps remain disabled.
- Preserve `WizardSelection`, `canGoNext`, existing step components, and character creation payloads.
- At widths below 768px, replace the step rail with a compact horizontal progress strip and keep the document free of horizontal overflow.
- Retune choice-card grids to four columns on wide desktop, two columns on tablet, and one column on narrow screens.

Out of scope: changing step content, adding new API calls, changing validation rules, redesigning the interactive character sheet, or implementing level-up flows.

## Component design

`CharacterWorkspaceShell` owns layout only. It receives a title, ordered step descriptors, current step index, a callback for selecting an accessible step, the main content, and the action bar. It does not know character-domain fields or API types.

The wizard page remains the state owner. It derives each descriptor's state from the existing index and selection validation, passes the active step content to the shell, and keeps `handleBack`/`handleNext` unchanged except for rendering them inside the shell action region.

Step descriptors expose a stable key, translated label, status (`current`, `complete`, `available`), and disabled state. A step is complete when the user has moved past it; a future step cannot be selected until the current step is valid and completed.

## Layout and responsive behavior

The shell fills the available application viewport using `min-height: calc(100dvh - var(--app-header-height, 0px))`. Desktop uses a grid with a 220–280px step rail and a flexible content pane. The content pane has its own vertical scrolling context; the page itself must not gain horizontal scrolling.

The action bar is sticky at the bottom of the content pane, separated from form content with a border and surface background. The step rail remains visible while the content pane scrolls.

At widths below 768px, the rail becomes a horizontal strip with overflow handled inside the strip. Labels may collapse to the step number while the accessible name remains available to assistive technology. The action bar stays sticky. Choice cards use `repeat(4, minmax(0, 1fr))` at wide desktop, two columns at medium widths, and one column below 520px.

## Accessibility and errors

The current step is marked with `aria-current="step"`. Disabled future steps are real disabled buttons, not links with ignored clicks. The shell keeps the existing heading hierarchy and focus order: step navigation, content, then actions. Selecting a step never discards state. Existing loading and API error rendering remain unchanged.

## Verification

- Component tests cover current-step rendering, disabled future steps, navigation to completed steps, and state preservation after returning to an earlier step.
- Existing wizard payload and validation tests remain unchanged and must pass.
- Playwright coverage checks the desktop shell at 1440×900, the intermediate layout at 1280×720, and no horizontal document overflow at 375px.
- TypeScript build, Vitest, and Ruff must pass. All changed text files retain CRLF line endings.

