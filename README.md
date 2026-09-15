# Hearth

Calendar and household workspace with a warm cream/forest-green theme and coordinated dark mode. Uses Google Calendar directly and PocketBase for real-time cross-device sync of tasks, chores, groceries, pantry, meals, recipes, and user settings. No AI service is used.

## Run and verify

Requires Node 22+.

1. Copy .env.example to .env and configure your OAuth credentials.
2. Run `npm install`, then `npm start`.
3. Open http://localhost:3000.

The local server and Vercel use the same API handlers. Public files are explicitly allowlisted locally; secrets and server source cannot be downloaded.

Tests:

- `npm test`: calendar math, timezone normalization, pagination, event writes, cookie encryption, request-origin checks, and PocketBase client integration.
- `npx playwright install chromium`, then `npm run test:browser`: desktop/mobile browser workflows, login card, and timeline geometry using mocked Google and PocketBase responses. No test changes a real calendar.
- `npm run icons`: render the SVG master into favicon, Apple touch, regular, and maskable app icons.
- `npm run screenshots`: start an isolated local preview on port 3108 and capture all five destinations in desktop/mobile and light/dark variants under `test-results/screenshots/`. All API calls and household data in these screenshots are fixtures.

On Windows PowerShell with script execution disabled, use `npm.cmd` and `npx.cmd`.

## Vercel

Deploy the repository with the Other framework preset and no build command. Configure Production environment variables:

| Key | Value |
| --- | --- |
| APP_BASE_URL | https://hearth-coral-two.vercel.app |
| GOOGLE_CLIENT_ID | Google web OAuth client ID |
| GOOGLE_CLIENT_SECRET | Current Google client secret |
| TOKEN_ENCRYPTION_KEY | Stable random secret, at least 32 characters |

Google OAuth authorized redirect URI: https://hearth-coral-two.vercel.app/auth/google/callback

The existing OAuth consent-screen publication and Calendar API enablement still apply. Changing environment values requires a new deployment. Preview deployments need a matching origin and OAuth redirect.

Tokens are encrypted in HttpOnly cookies (Secure on HTTPS). The server refreshes Google access tokens as needed. The session cookie lasts up to 180 days; Google revocation or testing-mode token expiration can still require reconnection. Disconnect clears this browser's cookie; revoke the app in Google account permissions to remove authorization globally.

## Calendars

- All accessible Google calendars are listed, grouped by ownership and colored using Google calendar metadata. Visibility persists on the device; hiding all calendars shows no events.
- Events load for the selected month plus adjacent weeks. Schedule covers today through the next 180 days. All result pages are fetched.
- Sync refreshes while the app is open, every minute, and on navigation. This is foreground polling, not background push sync.
- Timed events use the device timezone. All-day dates keep their original date boundaries. Week/day provide 24 hours, separate all-day rows, overlapping-event lanes, and overnight segments.
- Writes preserve the original calendar, use PATCH to leave unrelated Google fields intact, and use ETags to detect concurrent changes. Failed saves/deletes leave the event intact.
- Recurring-event edits apply only to the selected occurrence. Read-only and special Google event types open as details; the Google link exposes advanced features.
- Sharing controls are available for owned calendars. They update Google ACL permissions without sending a notification email. The recipient may need to subscribe through Google before that calendar appears in their list.
- Local events are never uploaded automatically. The old title-based demo cleanup was removed because it could delete legitimate events.

Google API references: [event pagination](https://developers.google.com/workspace/calendar/api/v3/reference/events/list), [patch semantics](https://developers.google.com/workspace/calendar/api/v3/reference/events/patch), [calendar sharing](https://developers.google.com/workspace/calendar/api/v3/reference/acl/insert).

## Shared household setup

Shared storage requires your Supabase project. Until configured, the app explicitly says lists and custom recipes save on this device.

1. Run supabase.sql in your project's SQL editor.
2. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel's server environment.
3. Set HOUSEHOLD_MEMBERS to your Google email followed by krugemilee@gmail.com, separated by a comma.
4. Set HOUSEHOLD_ID to a stable name such as home. Redeploy.

Each member signs in with Google. The server verifies the connected account via Google's primary calendar ID and checks the configured email allowlist. No invitation is needed. Google sign-in alone never gives an arbitrary visitor access to your household. The service key is server-only; the database denies direct anonymous/authenticated-client access through RLS.

Household items use individual rows. Both devices refresh shared data every 15 seconds while a household destination is open. Single-item edits use the latest successful write. Shopping previews, pantry transfers, cooking deductions, and chore advancement use a transaction and reject a stale household snapshot. Every queued batch has a persistent operation ID, so retrying after a lost response cannot apply it twice.

Device-only lists are not automatically uploaded. In Meals, **Import recipes from this device** explicitly imports local custom recipes into a connected household using stable IDs; repeating the import does not duplicate or overwrite existing household recipes. Favorites are personal to the current account on this browser.

## Home tools and limits

## Everyday workflows

- **Home** opens on first visit; later visits remember the last destination. Complete urgent tasks, open events, choose or change dinner, and open shopping directly from the overview.
- **Calendar** retains month/week/day/schedule, search, Google sharing, recurrence, overlap handling, dragging, and offline operations. Event creation keeps dates and times visible and groups optional fields under **More options**.
- **Tasks** groups work into Overdue, Today, Later, and Completed. Assignment, priority, and recurrence are available during creation. Postponing preserves the original recurring schedule; completing or skipping advances it once. Monthly chores retain their original day across shorter months. Optional rotation advances through selected household members.
- **Meals** includes a searchable recipe picker, cook-time/favorite/pantry/use-soon filters, custom recipes, and a responsive weekly plan. Planned meals retain recipe snapshots even when the source recipe is edited or deleted. Unresolvable legacy meals ask for a replacement recipe before calculations.
- **Shopping** groups groceries by editable aisle. Shopping mode enlarges checkboxes and hides editing controls; purchased items collapse into a separate section. **Put purchased items in pantry** previews quantities and transfers the confirmed items once.
- **Pantry** lives within Shopping. Optional expiration dates surface items dated within seven days, including past dates. **Made this meal** previews editable deductions, uses earliest-expiring compatible stock first, reports shortages, and never deducts below zero.

Shopping generation previews required quantities, pantry stock, already-listed groceries, and proposed additions. Purchased groceries count as available until transferred. Only matching ingredient names and units combine; different units remain explicit for review. Recipe directions describe their original serving count, alongside a scaled ingredient list.

Meal balance is a transparent ingredient-category checklist. It does not claim to calculate calories or a validated health score from free text.

The app does not implement full Google Calendar parity: Google remains the place to manage entire recurring series, attachments, invitations, conference creation, complex reminders, and advanced calendar settings.

## Upgrading an existing deployment

1. Back up your household data and run the current `supabase.sql` in Supabase before deploying this version. The migration is rerunnable and preserves existing rows. It adds the `recipes` kind, operation receipts, and the server-only transactional function.
2. Deploy the updated application and API together. Existing environment variables and household membership rules remain valid. The updated local server serves the manifest, SVG, PNG, and favicon with their correct content types.
3. Open Hearth while online once to refresh its service-worker cache and icon assets. Some devices may retain an installed icon until the app is reinstalled.
4. Existing device recipes migrate locally once, retaining the old storage key as a backup. Legacy meal references gain stable IDs and snapshots when resolvable. Connected household meal references migrate in place; local recipes require explicit import.
5. Pending changes stay bound to their original account. A batch that later encounters a stale snapshot remains in **Sync details**: discard that failed operation, refresh, and rebuild its preview. Later queued operations stay ordered and may also need review if they depended on discarded changes.

Production deployment and running the migration on a live Supabase project are separate from local implementation and verification.
