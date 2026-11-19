# Event Hub on GitHub Pages with Google Sheets

GitHub Pages serves the hub over HTTPS. Google Identity Services (GIS) gives the browser a short-lived access token, and the Sheets API reads and writes a single owner-managed spreadsheet. The original hub supplies recipe instructions, ingredient IDs, and timeline text. The spreadsheet is authoritative for dish names, serving targets, signup records, grocery checkoffs, and prep completion. The four hub screens appear after their Sheet data passes validation.

## Access and sign-in

- Create a Web application OAuth client, enable the Sheets API, and authorize the origins `https://newnativeabq.github.io` and `http://localhost:8000` for production and local development respectively. The repository path is outside the origin. Use a separate test spreadsheet and localhost for development. Only the public OAuth client ID and spreadsheet ID belong in client configuration.
- Use Restricted Drive sharing and invite named Google accounts as Editors. Google still enforces the assigned access for each account. Store the Sheet outside shared folders or verify inherited access, and turn off the setting that allows Editors to share or change permissions. Drive sharing is the authorization boundary. An Editor can change shared data in the Sheet itself and outside the hub. A Viewer can read every tab, including any identity fields. Keep names optional where possible, leave `guest_email` empty in v1, and use optional display names for attribution. These fields are guest-entered labels.
- Offer a single **Sign in with Google** action using `spreadsheets`. Request only the declared scope and verify the grant on the GIS callback. The spreadsheet scope can cover every spreadsheet the user can access, even though the hub requests only the configured spreadsheet ID.
- Keep tokens and shared spreadsheet data in runtime memory. Starting a sign-in starts a new session because the Google account chooser can select a different account. Clear prior data, drafts, and queued writes, ignore callbacks or responses from the prior session, and load and validate the Sheet before enabling writes. Use the returned expiry and ask the user to reconnect on expiry or 401. Sign-out and access loss also clear shared state. Explain the invitation requirement when an authenticated read is denied.
- A successful read establishes read access. A Sheets token with write scope does not expose the Drive role. Let Google decide whether the account can write. After a permission error on a write, suspend writes and recheck read access. On successful recheck, retain the view and explain the denied edit. If the known Sheet returns 403 or 404 on recheck, clear shared data and explain how to regain access. Avoid write probes and requests for broader Drive scopes.
- For guests outside the owner's Workspace, use an External OAuth app. During testing, invite the same accounts in Drive and the OAuth test-user list. Testing permits up to 100 listed users and grants expire after seven days. Before the event, verify sign-in from the actual Pages origin with representative guest accounts. For a production OAuth rollout, check current verification and domain ownership requirements, including the personal-use exception for fewer than 100 users.

## Spreadsheet contract

The owner seeds one header row per tab. Protect those headers and the preseeded key columns in `Menu_Servings`, `Grocery_Checks`, and `Prep_Checklist`. Leave the signup data columns writable by invited Editors so append can create complete rows. Reserve structural changes for the owner. Load the four ranges with `spreadsheets.values.batchGet` and `UNFORMATTED_VALUE`. Disable saves if headers or fixed keys are missing, malformed, or duplicated. Resolve fixed-row writes by the keys returned in the latest validated read. Use `RAW` for all writes.

| Tab | Columns, in order | Write behavior |
| --- | --- | --- |
| `Menu_Servings` | `dish_id`, `dish_name`, `target_servings`, `updated_by`, `updated_at` | Seed seven recipes. The editor can update the name in B and the serving target in C. Accept integers from 1 to 100. A blank target removes the dish from the active plan. |
| `Potluck_Signups` | `claim_id`, `guest_name`, `guest_email`, `dish_name`, `category`, `needs`, `status`, `timestamp`, `slot_id`, `servings`, `dietary` | Append new claims with `values.append` and `INSERT_ROWS`. Generate a UUID at submission. Leave `slot_id` blank on new signups. Preserve existing slot IDs for grouping older claims. |
| `Grocery_Checks` | `item_key`, `checked`, `checked_by`, `updated_at` | Seed the 50 distinct recipe `groceryId` values. Batch-update B:D for changed items only. Use native Sheet booleans for active rows. A blank status removes the row from the active checklist. |
| `Prep_Checklist` | `step_id`, `completed`, `completed_by`, `updated_at` | Seed the 21 original Tuesday–Thursday step IDs. Update B:D for the selected step. Use native Sheet booleans for active rows. A blank status removes the row from the active checklist. |

Use UTC ISO 8601 timestamps for display and coordination, with last successful write winning for edits to the same serving target or checkoff. These timestamps come from the browser. Sheet editors can change them directly.

## Editable records

| Area | Pencil edit | Trash action | Create or restore |
| --- | --- | --- | --- |
| Menu | Dish name and target servings | Removes the dish and its ingredient quantities from the active plan | Restore with an explicit serving target |
| Potluck | Guest, dish, course, servings, kitchen needs, and dietary tags | Withdraws the signup and retains its Sheet row | Add a new signup |
| Grocery | Shopping check status | Excludes the item from the shopping list | Restore with an explicit check status |
| Prep | Completion status | Excludes the step from the timeline | Restore with an explicit completion status |
| Feedback | Organizer manages ticket status in Sheets | Organizer handles ticket removal in Sheets | Send a ticket from the hub |

Fixed catalog rows retain their protected IDs on removal. A blank value in the existing status or target column represents an excluded row. Recipe instructions, ingredient definitions, and prep task wording live in the site catalog.

The hub validates a fresh snapshot before mutating an existing record. If a value changed since the editor opened the form, the hub asks the editor to review it again. Sheets offers no conditional cell update for this interface. If two writes land between validation and save, the last write to the same cell wins.

## Feedback tickets

Add a `Support_Tickets` tab to the same spreadsheet. Paste this tab-separated header into A1 and protect only row 1. Leave the ticket data rows writable by invited Editors.

```text
ticket_id	created_at	category	summary	details	status
```

The form asks guests for a category, a short summary, and optional details. It explains that anyone with Sheet access can read submissions. It does not request a name or email. Guests with Editor access can submit. Feedback uses the same Google session as the hub. It validates the support tab independently and remains available if a hub tab needs correction.

The form appends a row with `status=open` and displays the ticket ID on confirmation. The organizer filters the ticket tab by status and updates tickets to `in_progress` or `closed` directly in Sheets. Status ownership is a convention for this shared Sheet. If retries produce more than one row with the same ticket ID, use that ID as one ticket.

## Local development

Configure the Google Cloud web client and Sheets API as described above, then set `googleClientId` and `spreadsheetId` in [sheets-config.js](../sheets-config.js). Start a local preview with `python3 -m http.server 8000 --bind 127.0.0.1` and visit `http://localhost:8000/`. Use **Sign in with Google** with an invited Editor account. The tested origin uses `localhost` in the browser address.

Find feedback under **Prep Timeline & Feedback**. Verify an invited Editor can submit and an invited Viewer receives a permission message. Feedback requires only the `Support_Tickets` tab.

The published page serves the checked-in Tailwind output directly. When changing styles or Tailwind classes, run `npm ci` and `npm run build:css` to regenerate `hub.css`.

## Synchronization and failure handling

- Fetch on connect, on return to a visible tab, on explicit refresh, and every 30 seconds while connected and visible. Use one in-flight refresh at a time. Serialize writes per browser and defer normal refreshes while a write is queued or pending. Discard any refresh result that spans a write and fetch again after the write queue drains, even if an obsolete read is still settling. A permission recheck takes precedence over queued writes.
- Send serving changes on commit of the input gesture. Reset actions affect only relevant rows. Hold a draft until it saves or the user dismisses it. Keep failed drafts visible and provide a retry action. A failed or pending write must never be presented as saved.
- Append new potluck signups. Edit the selected mutable fields and withdraw a signup by writing `status=withdrawn` on every matched physical row. Re-read before writing. Conflicting duplicates stay flagged for organizer review and can be withdrawn as a group. Edits leave the claim ID, email, slot, status, and creation time as recorded. Flag simultaneous legacy claims for the same slot ID.
- Disable duplicate submission while an append is pending. If the response is lost, read for the same UUID and show any matching record. The API has no idempotency key. If the UUID is absent, show an unresolved save and allow a deliberate retry using the same UUID in the current session. Fold repeated UUIDs into a single record. A withdrawn duplicate suppresses that claim, and disagreeing active duplicates display an owner-review flag.
- Treat Sheet strings as untrusted text. Render via text APIs or context-appropriate escaping. Serve prebuilt CSS with the GIS token client. The connection toolbar shows live status, and the fourth tab contains the prep checklist and feedback form.
- Pause polling on authorization failure and back off on rate limits or server errors. Structural Sheet edits during app activity can race with A1 writes. The owner should stop app editing during schema or row-order maintenance.

## Acceptance checks for implementation

1. The original menu scaler, derived grocery totals, potluck form and board, and prep timeline work against a seeded test Sheet.
2. An invited Editor can write in all four tabs. A Viewer can read and receives a clear access message on a denied save. An uninvited Google account cannot load the data.
3. Two browser sessions editing different fixed keys preserve both updates. Concurrent claims for the same slot appear as separate records. Recovering from a lost append response does not display duplicate claims.
4. Token expiry, denied consent, account switching, slow refreshes, and failed writes leave the UI in the correct state. Reloaded pages begin disconnected. Shared data and tokens stay out of browser storage and the public repository.
5. Production runs from the GitHub Pages project path with the registered origin and a separate production Sheet.

## Google references

- [GIS browser token model](https://developers.google.com/identity/oauth2/web/guides/use-token-model)
- [Sheets authorization scopes](https://developers.google.com/workspace/sheets/api/scopes)
- [Sheets JavaScript quickstart](https://developers.google.com/workspace/sheets/api/quickstart/js)
- [Sheets values and write modes](https://developers.google.com/workspace/sheets/api/guides/values)
- [Sheets append](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets.values/append)
- [Sheets usage limits](https://developers.google.com/workspace/sheets/api/limits)
- [Google OAuth app audience and testing](https://support.google.com/cloud/answer/15549945?hl=en)
- [Google OAuth verification exceptions](https://support.google.com/cloud/answer/13464323?hl=en)
- [Google Drive sharing controls](https://support.google.com/drive/answer/7166529)
