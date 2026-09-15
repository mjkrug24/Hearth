# Hearth

Calendar and household workspace. Uses Google Calendar directly and optionally Supabase for shared tasks and groceries. Recipes are built in; no AI service is used.

## Run and verify

Requires Node 22+.

1. Copy .env.example to .env and configure your OAuth credentials.
2. Run `npm install`, then `npm start`.
3. Open http://localhost:3000.

The local server and Vercel use the same API handlers. Public files are explicitly allowlisted locally; secrets and server source cannot be downloaded.

Tests:

- `npm test`: calendar math, timezone normalization, pagination, event writes, cookie encryption, request-origin checks.
- `npx playwright install chromium`, then `npm run test:browser`: desktop/mobile browser workflows and timeline geometry using mocked Google responses. No test changes a real calendar.

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

The shared data API is implemented, but requires your Supabase project. Until configured, the app explicitly says lists save on this device.

1. Run supabase.sql in your project's SQL editor.
2. Add SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to Vercel's server environment.
3. Set HOUSEHOLD_MEMBERS to your Google email followed by krugemilee@gmail.com, separated by a comma.
4. Set HOUSEHOLD_ID to a stable name such as home. Redeploy.

Each member signs in with Google. The server verifies the connected account via Google's primary calendar ID and checks the configured email allowlist. No invitation is needed. Google sign-in alone never gives an arbitrary visitor access to your household. The service key is server-only; the database denies direct anonymous/authenticated-client access through RLS.

Tasks and groceries use individual rows, so updating one item cannot replace the entire list. Both devices refresh shared lists every 15 seconds while Home is open. Simultaneous edits to the same item use the latest successful write. Device-only lists are not automatically uploaded or merged.

## Home tools and limits

Tasks support a due date; groceries support quantities. Both support editing names, checkoff, deletion, and clearing completed items. Recipes include methods, ingredient matching, and adding missing ingredients. Recipe directions are starting points, not personalized dietary plans.

Meal balance is a transparent ingredient-category checklist. It does not claim to calculate calories or a validated health score from free text.

The app does not implement full Google Calendar parity: Google remains the place to manage entire recurring series, attachments, invitations, conference creation, complex reminders, and advanced calendar settings.
