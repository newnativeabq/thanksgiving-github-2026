# Add a recipe to the hub

## Guest experience

1. From **Menu & servings**, an invited Editor opens **Add recipe**. The dialog has **Copy agent prompt**, **Load example**, and **Validate and preview**. On mobile it uses a full-width dialog with a scrollable preview.
2. The guest copies the [recipe prompt](recipe-import-prompt.txt) into the agent of their choice and adds their recipe or rough notes there. The copy action includes the exact [Recipe v1 JSON Schema](recipe-import-v1.schema.json) and the currently validated ingredient names, suggested keys, units, and aisles. The roster includes ingredient metadata only. The guest chooses what recipe text to send. The hub never calls an agent.
3. The guest pastes one JSON object. A single `json` code fence is accepted when it encloses the whole response. Validation stays local. Parse errors give a line and column when available. Schema errors give the field path and a correction, for example `ingredients[2].amount` needs a positive number or a supported to-taste entry. The dialog keeps the paste visible so the guest can correct it or ask their agent to fix it.
4. **Review recipe** shows the card, ordered steps, source, cooking times, serving yield, and supplied dietary and allergen tags. The guest enters an explicit event serving target from 1 to 100. Show scaled quantities alongside the base quantities. Display ingredient matches and planned new shopping entries before saving.
5. **Save recipe** commits the reviewed recipe. Once the hub confirms it, close the dialog and focus the new card. Preserve the paste and selections after a failed save while the same Google session remains active. Clear the draft on sign-out or session loss.

Optional recipe information only appears when the guest supplies it. The menu can filter by dietary tags supplied with a recipe. Label imported tags as guest-supplied on the card, in recipe details, and in copied recipes. An empty allergen list means none were identified in the submitted information.

## Import contract

- Use the checked-in JSON Schema as the validator and as the schema included with the copy prompt. Unknown fields and schema versions fail. Reject JSON with duplicate object keys, excess depth, or more than 64 KiB of pasted UTF-8 data. Cap the compact normalized recipe JSON at 32 KiB before writing its Sheet cell. The normalized JSON cap includes JSON escapes and multibyte characters.
- The agent describes the base recipe. The app assigns the recipe and ingredient record IDs. The guest reviews the event serving target separately.
- Keep recipe text literal in the browser and in Sheets. Render pasted strings as text, including copied names and errors. Store string cells with explicit `stringValue`, numbers with `numberValue`, and checklist booleans with `boolValue`. Open supplied links only after validating an HTTPS URL with a host and without embedded credentials. Validation and preview do not fetch source links or images.
- Keep a measured amount in its declared unit. Treat `to_taste` as unscaled. Map existing units such as `lbs` and `cloves` to their v1 equivalents. Keep mass, volume, and count separate. Use `oz` for weight and `fl_oz` for fluid ounces. Add an **Other** shopping aisle for the v1 `other` value.
- The agent's `grocery_key` suggests a match. Show an existing match only if the key, canonical unit, aisle, and ingredient identity agree. Compare names case-insensitively with normalized whitespace, preserving modifiers such as low-sodium or unsalted. The guest confirms whether to reuse it or keep a separate item. For a new ingredient, allocate `ing-<recipe UUID>-<group index>`. The index is an integer from 1 to 40. The key fits the import schema and can be reused through a later ingredient roster. Repeated lines for the same ingredient and unit can share one reviewed key in the same import. Keep incompatible ingredients or units separate.
- A reused grocery entry keeps its current checked or removed status. In preview, say when added demand will land on an already checked or excluded item. Link back to the usual grocery controls for an explicit status change. Initial unchecked status on a newly created row is part of the proposed import and is visible before save.
- Re-read the current Sheet before save. Require another review for changes that read observes in ingredient matches, displayed check status, or title warnings. The batch does not condition its save on those reads. It only appends new rows and preserves edits to reused rows. Refresh after save and display the effective check and title state if another guest made a change in the meantime. Independent imports can have the same name and distinct IDs.

## Google Sheets persistence

Add one tab named `Recipe_Definitions` with these columns in order.

```text
dish_id	definition_json	ingredient_keys_json	created_at	import_fingerprint
```

Store the validated normalized recipe in `definition_json` and the resolved grocery keys, in ingredient order, in `ingredient_keys_json`. Treat these as immutable in v1. Use `recipe-<UUID>` for imported dish IDs and join them to `Menu_Servings` by `dish_id`. The menu row remains authoritative for the display name, current serving target, and removal state. Existing recipes keep their catalog definitions and Sheet-backed names and targets. Prep steps stay on their existing timeline.

Extend `Grocery_Checks` with `item_name`, `unit`, and `aisle` in E:G. Fill those columns for new grocery keys. Legacy rows keep their existing A:D values. Use the first occurrence in the fixed catalog order for each legacy grocery identity, independent of which recipes are active. The grocery row supplies the canonical identity for each new key, so a second recipe can still use a shared ingredient when the first recipe is removed or invalid. When checking a saved mapping, compare the ingredient identity, canonical unit, and aisle with the grocery entry. Use the canonical grocery label on the shopping list.

Use one `spreadsheets.batchUpdate` with `AppendCellsRequest` operations for the recipe definition, its menu row, and any new grocery check rows. Put a `CreateDeveloperMetadataRequest` with a caller-assigned, positive, spreadsheet-unique ID in the same atomic batch. Set the metadata key to `event_hub_recipe_import_v1`, its location to the spreadsheet, and its visibility to `DOCUMENT`. The operation generates a recipe UUID and a random metadata ID, freezes the reviewed payload, and hashes the canonical JSON for the normalized definition, resolved ingredient keys, and initial target. Store the recipe UUID and fingerprint in the metadata value and the fingerprint in the definition row. The metadata ID acts as the replay guard. Confirm atomic behavior and explicit-ID collision handling with the test spreadsheet before enabling imports. [Google Sheets batch updates](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate), [Developer metadata fields](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.developerMetadata)

Display the import ID before sending. After an uncertain response, compare the guard and fingerprint, the stored definition and ordered key mapping, and the presence of one menu row and each planned new grocery row. Check reused grocery identities independently. Another guest can already have renamed the menu row, changed its target, or checked a grocery item. Those mutable values do not determine whether the import committed. If the guard, definition, menu row, and planned new rows are all absent, a deliberate retry uses the same frozen payload, keys, and metadata ID. If the reviewed checklist status or title warnings change before retry, require another confirmation of the same frozen operation. If a reused identity changes, the guard conflicts, or only part of the expected data is visible, stop the retry and show the import ID for organizer review.

Replay protection applies while the same pending import stays in session memory. If the guest reloads after an uncertain save, use the import ID to check `Recipe_Definitions` before starting another import. Ask the organizer to resolve it if the ID was lost or the matching rows disagree.

## Existing data and rollout

- Release a reader that supports validated imported IDs before enabling the writer. Ask guests with older pages open to reload before the first import. The old reader rejects extra keys, so a later rollback must keep the compatible reader in place while imported rows exist.
- The organizer adds the new tab and grocery identity headers, protects all headers, and checks existing permissions. If column A in Menu or Groceries is protected all the way down, narrow protection to the legacy key rows and header so invited Editors can append new rows. The app treats appended keys as immutable. An Editor with direct Sheet access can still change unprotected imported cells.
- Guests can validate and preview while the organizer completes setup. Live saves require both the new tab and the grocery identity headers. A malformed imported recipe or a menu row with a missing definition is flagged with its ID and omitted from the active menu. Existing records and unrelated valid imports continue to load. Check the persisted schema, resolution array length and order, key namespace, menu join, and referenced grocery rows on every refresh. Include imported content and mapping in refresh change detection.
- Preserve inactive grocery keys when interpreting removed recipes and checklist resets. The owner pauses app writes during structural changes to row order or headers.

To rebuild the browser validator after a schema change, run `npm ci` and `npm run build:recipe` and include the generated module with the schema. Run `npm run build:css` after changing the site styles.

## Implementation acceptance

- A guest can copy the prompt, paste the current example, and see a scaled preview before saving. A valid paste alone causes no Sheet write.
- Unknown fields or versions, duplicate JSON keys, invalid numbers or units, and oversized escaped or multibyte payloads produce specific messages. A to-taste amount stays unscaled.
- Imported recipes work in the live menu, detail, copy, and grocery flows. Shared checks preserve their state. Test an intervening grocery check or removal after preflight in a second browser. The import preserves it and the post-save view shows it. Concurrent imports with overlapping ingredient names either reuse an explicitly confirmed compatible item or create distinct new keys.
- Lost responses reconcile without duplicate recipes during the same session. A rejected append or collision leaves no partial menu or grocery rows. Test recovery after another editor changes the title, target, or checks. Test from an invited Editor account on the actual test Sheet, including missing permissions, missing tabs, and older-client refresh behavior.
