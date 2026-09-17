# Hearth

Calendar and household workspace with a warm cream/forest-green theme and coordinated dark mode. Uses Google Calendar directly and PocketBase for real-time cross-device sync of tasks, chores, groceries, pantry, meals, recipes, and user settings. No AI service is used.

## Run and verify

Requires Node 22+.

1. Copy .env.example to .env and configure your OAuth credentials.
2. Run `npm install`, then `npm start`.
3. Open http://localhost:3000.

The local server and Vercel use the same API handlers. Public files are explicitly allowlisted locally; secrets and server source cannot be downloaded.

Tests:

- `npm run check`: check application JavaScript syntax; Vercel runs this before deployment.
- `npm test`: calendar math, timezone normalization, pagination, event writes, cookie encryption, request-origin checks, and PocketBase client integration.
- `npx playwright install chromium`, then `npm run test:browser`: desktop/mobile browser workflows, login card, and timeline geometry using mocked Google and PocketBase responses. No test changes a real calendar.
- `npm run icons`: render the SVG master into favicon, Apple touch, regular, and maskable app icons.
- `npm run screenshots`: start an isolated local preview on port 3108 and capture all five destinations in desktop/mobile and light/dark variants under `test-results/screenshots/`. All API calls and household data in these screenshots are fixtures.

On Windows PowerShell with script execution disabled, use `npm.cmd` and `npx.cmd`.

## Vercel

Deploy the repository with the Other framework preset. The build command in `vercel.json` runs `npm run check` before deployment. Configure Production environment variables:

| Key | Value |
| --- | --- |
| APP_BASE_URL | https://hearth.krugcloud.com |
| GOOGLE_CLIENT_ID | Google web OAuth client ID |
| GOOGLE_CLIENT_SECRET | Current Google client secret |
| TOKEN_ENCRYPTION_KEY | Stable random secret, at least 32 characters |

Google OAuth authorized redirect URI: https://hearth.krugcloud.com/auth/google/callback

When changing the public domain, add its exact callback URL to the existing Google OAuth web client, set Vercel's Production `APP_BASE_URL` to that domain's origin, then redeploy. Start Google sign-in again from the new domain. Updating only the Google redirect setting is insufficient: Hearth also uses `APP_BASE_URL` to validate calendar writes. Starting sign-in on one domain and returning to another loses the host-only OAuth state cookie and can cause an invalid-state error.

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

## Hearth accounts and household storage

Hearth uses PocketBase 0.40.4 for household data and personal preferences. Google Calendar is an independent connected service: changing Google accounts does not change your household. Navigation stays local to each device.

- Sign in from the Hearth account button. In Settings, the owner can create a one-use invitation code valid for 24 hours. No invitation email is sent. Joining brings your personal lists into the destination household; moving from an already shared household requires an administrator.
- Password recovery uses PocketBase's email flow. Configure SMTP and its password-reset template before offering recovery.
- Reads require household membership. Direct collection writes are locked; authenticated hooks validate and transact changes. Personal events and settings remain owner-only.
- Persistent operation IDs and database receipts make lost responses safe to retry. Concurrent changes reject the entire operation with a refresh-and-review message.
- Queues and caches are separated by server URL and user ID. Sign-out retains pending edits and restores separate device lists. Changing server URLs clears authentication.
- Sync details shows failed edits. Retry connection failures. Discard rejected stale previews and their dependent edits, refresh, and rebuild. An attempted operation with an unknown outcome must be retried before discarding.
- Device lists stay local until **Import device lists** is selected. Matching IDs are skipped. Meals offers a recipe-only import. Local calendar events are not included in list import.
- Empty remote lists replace cached lists. Real-time notifications trigger snapshot refreshes, with foreground polling as a fallback.

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

## PocketBase installation and upgrade

**Keeping `spectado/pocketbase:0.19.2` on Unraid?** The bundled server scripts now
support that version. Follow [the Unraid installation steps](pocketbase/UNRAID.md)
to mount the two folders without changing your image or data path. Both 0.19.2
and 0.40.4 pass the isolated integration checks.

1. Back up PocketBase's data directory. Test against a restored copy first. This version is verified with **PocketBase 0.40.4**; follow its upgrade instructions if your server is older.
2. Copy both repository directories **pocketbase/pb_migrations** and **pocketbase/pb_hooks** to the server. Start PocketBase with those migration/hook directories, or place them beside the executable under the default names.
3. The additive migration **1789516800_household_sync.js** creates or upgrades collections, locks raw writes, and scopes reads. Existing items with a recorded creator move to a separate household for that creator. Historical broad access is not treated as proof of membership. Use invitation codes to reconnect members.
4. Rows without a recorded creator remain preserved but inaccessible. A superuser must verify ownership and assign a household relation. Review duplicate historical client IDs before rollout. Clients cannot claim orphaned rows.
5. Restart PocketBase to load hooks. Verify GET /api/hearth/snapshot while authenticated and verify unrelated users cannot read each other's items. Migrations replace the old permissive JSON schema as the sole schema source.
6. Deploy the frontend after the backend. Configure HTTPS and permitted origins on the PocketBase host. Browser requests go directly to PocketBase; the open-ended local proxy has been removed.
7. Open Hearth online to refresh the service-worker cache. Device recipe references migrate once; shared meal references gain snapshots when resolvable. Device recipes require explicit import.

The earlier Google/Supabase household queue remains in its original storage key. It is never silently replayed into PocketBase or another account. Resolve or export legacy edits before retiring an older deployment. Legacy API handlers remain for migration compatibility; the current UI uses PocketBase household hooks.

Production deployment and applying migrations to live data remain separate rollout steps.

## New everyday shortcuts

- **+ Add** parses grocery quantities, task dates, or event dates/times into editable fields. Events continue into the full editor for calendar and end-time selection. Times without AM/PM are shown literally in 24-hour form for review.
- **Start cooking** opens large ingredient and method checklists, a timer, and an optional screen-awake control. Finishing a planned meal opens the pantry deduction preview; confirmation marks it cooked. Timers stop when cooking mode closes and do not send background notifications.

## Verification

- **npm test**: unit/API tests, queue recovery, account isolation, recipe/inventory/chore logic, and Quick Add parsing.
- **npm run test:browser**: calendar, local/shared households, offline retries, account switching, Quick Add, cooking, and phone layouts using fixtures.
- **npm run test:pb**: real isolated PocketBase tests for authorization, invitations, receipts, rollback, stale snapshots, and empty lists. Set HEARTH_PB_BIN to a 0.40.4 executable. The Windows default is the downloaded binary under the temporary directory. Tests use a disposable data directory and localhost port 8199, never your configured server.
- **npm run screenshots**: captures desktop/phone destinations in both themes under test-results/screenshots/. Cooking browser tests also capture light/dark phone screenshots.
