# Shared UI Controls

All pages use the primitives in `components/ui` and composed controls in
`components/shared`. Feature components own behavior, not their own input or
button implementations.

## Controls

| Purpose | Component |
| --- | --- |
| Commands and navigation actions | `Button`, or `Button asChild` with `Link` |
| Mutually exclusive or toggle choices | `ChoiceButton` with `selected` |
| Text, number, email, date and time | `Input` |
| Multiline text | `Textarea` |
| Field caption | `Label`, normally through `FormField` |
| Binary option | `Checkbox` |
| Native radio group | `Radio` (retain a shared `name`) |
| Dropdown | `Select` and `SelectTrigger`, or `NativeSelect` |
| Searchable dropdown | `Combobox` |
| Telephone | `PhoneNumberInput` |
| Locale | `CurrencySelect`, `TimezoneSelect` |
| Modal and drawer | `Dialog`, `AlertDialog`, `Sheet` |
| Loading | `Skeleton` and shared section skeletons |
| Actions row | `FormActions` |

## Sizing And States

- Default editable controls and buttons: 40px high, 8px radius.
- Compact editable controls: 36px. Large: 44px. Extra large: 48px.
- Button `sm`: 32px; `lg` and `xl`: 44px; `2xl`: 48px. Icon sizes match.
- Keep existing explicit sizes where density or touch targets require them.
- Use the size prop, not a per-screen height/radius override.
- Text inputs stay at 16px on small screens to avoid mobile zoom.
- Focus, disabled and invalid styles are defined in the primitives.
- `FormField` connects labels, descriptions and errors to the actual control,
  including controls nested inside a layout wrapper or Radix Select.
- Use semantic tokens (`background`, `foreground`, `muted`, `border`, `primary`,
  `accent`) rather than fixed white/black control colors.
- Use button variants for success, warning and destructive/informational actions.
- The customer storefront retains its white/teal tokens independently of the
  staff theme. Portalled customer dialogs/selects must retain storefront markers.

Layout-only classes (width, alignment, responsive placement) remain appropriate.
Auto-height buttons are allowed for multiline choices, search results and KDS
station controls. Special chrome (the account menu), brand provider buttons and
product quantity groups intentionally retain their contextual presentation.

## Audit And Tests

Run `node scripts/audit-ui-controls.mjs` after UI changes. It parses every page
and component and rejects native controls outside the shared primitives.
The only exceptions are the `NativeSelect` implementation and Menu Manager's
hidden file-import input. A new exception must be justified in the audit.

Run `npx playwright test tests/e2e/ui-control-standards.spec.ts --project=chromium`
for the source guard. Set `E2E_UI_CONTROLS_URL` to a local route rendering
`tests/fixtures/UiControlsPreview.tsx` to also run the interactive checks in
light, dark and customer themes at desktop and mobile sizes. Do not publish that
test route. Tests use in-memory fixture state, not tenant data.

This source audit does not claim a visual review of every authenticated page.
Exercise the relevant workflows after changes to shared primitives.
