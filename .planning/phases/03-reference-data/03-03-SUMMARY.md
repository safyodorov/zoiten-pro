---
phase: 03-reference-data
plan: "03"
subsystem: ui-components
tags: [combobox, base-ui, ui-primitive, creatable, inline-create]
dependency_graph:
  requires: [03-01]
  provides: [CreatableCombobox primitive for Phase 4 product form]
  affects: [04-products product form category/subcategory fields]
tech_stack:
  added: []
  patterns:
    - "@base-ui/react/combobox — manual filtering (does NOT auto-filter)"
    - "Controlled combobox with local inputValue state for filtering"
    - "Separate <button> for create affordance (not Combobox.Item) to avoid value conflicts"
key_files:
  created:
    - components/combobox/CreatableCombobox.tsx
  modified: []
decisions:
  - "Used a plain <button> (not Combobox.Item) for the create affordance to avoid value conflicts and allow onClick handler that calls onCreate without base-ui selection logic"
  - "inputValue is kept as local state, synced via onInputValueChange from Combobox.Root"
  - "Manual filtering via useMemo — base-ui does not auto-filter items"
metrics:
  duration: "~5 minutes"
  completed_date: "2026-04-05"
  tasks_completed: 1
  files_created: 1
  files_modified: 0
requirements: [REF-05]
---

# Phase 03 Plan 03: CreatableCombobox Component Summary

## One-liner

Reusable controlled combobox with inline "Добавить" affordance using @base-ui/react/combobox and manual filtering.

## What Was Built

`components/combobox/CreatableCombobox.tsx` — a generic, fully controlled combobox component for Phase 4's product form. Allows users to select from existing options or create a new one inline without leaving the form.

### Key behaviors:

- **Filtering**: `useMemo` over `options` filtered by `inputValue` (case-insensitive `.includes`). base-ui Combobox does NOT auto-filter, so this is handled manually.
- **Create affordance**: When `inputValue.trim()` is non-empty and no exact label match exists, a `<button>` labeled `"Добавить: {inputValue}"` appears at the bottom of the popup with a Plus icon.
- **Clicking create**: Calls `onCreate(inputValue.trim())` and clears `inputValue`. The dropdown stays open — caller is responsible for adding the new option to `options` (async flow).
- **Controlled**: `value` and `onValueChange` are passed through to `Combobox.Root`. Local `inputValue` state is separate from the selection.
- **Empty state**: `Combobox.Empty` renders "Нет вариантов" when filtered list is empty and no create item is shown.

## Exports

- `CreatableComboboxOption` — `{ value: string; label: string }`
- `CreatableComboboxProps` — full props interface
- `CreatableCombobox` — the component

## Phase 4 Usage Pattern

```typescript
<CreatableCombobox
  options={categories.map(c => ({ value: c.id, label: c.name }))}
  value={selectedCategoryId}
  onValueChange={setCategoryId}
  onCreate={async (name) => {
    const result = await createCategory({ name, brandId: currentBrandId })
    if (result.ok) toast.success("Категория создана")
  }}
  placeholder="Выберите категорию"
/>
```

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| Task 1: CreatableCombobox component | `6ff409e` | feat(03-03): CreatableCombobox — filterable combobox with inline-create affordance |

## Deviations from Plan

None — plan executed exactly as written.

The plan noted to use `Combobox.Positioner` + `Combobox.Popup` structure rather than just `Combobox.Popup`, which is the correct structure for base-ui v1.3.x. This was applied as the standard popup pattern.

## Known Stubs

None. The component is fully functional and wires all data through props.

## Self-Check: PASSED

- `components/combobox/CreatableCombobox.tsx` exists: FOUND
- Commit `6ff409e` exists: FOUND
- TypeScript compiles with no errors: CONFIRMED
