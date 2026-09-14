# Hearth Calendar

A Google Calendar-inspired front end with event management, calendar visibility controls, month/week/day/schedule views, search, reminders, and local persistence.

## Run it

1. Copy `.env.example` to `.env` and add your Google OAuth client ID and secret.
2. In Google Cloud Console, add `http://localhost:3000/auth/google/callback` as an authorized redirect URI.
3. Run `node server.js`, then open `http://localhost:3000`.

The app still works in local-only mode if `.env` has not been configured. The server must be used for the Google connection because OAuth refresh tokens are kept server-side.

## Deploy on Vercel

The repository includes Vercel serverless OAuth and Calendar API routes. In **Vercel → Project → Settings → Environment Variables**, set these for Production (and Preview if you use preview deployments):

- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `TOKEN_ENCRYPTION_KEY` — a long, randomly generated private value
- `APP_BASE_URL` — your exact public origin, for example `https://your-project.vercel.app`

In Google Cloud Console, add `${APP_BASE_URL}/auth/google/callback` to **Authorized redirect URIs**. For the example above, that is `https://your-project.vercel.app/auth/google/callback`. Do not use the localhost URI for a Vercel deployment.

Vercel functions keep each person’s encrypted OAuth token in their own secure browser cookie, so users can connect independent Google accounts without sharing credentials or requiring a database.

## Google two-way sync

The UI intentionally does not store Google credentials in the browser. A production sync service should own OAuth tokens and use the Google Calendar API:

1. Create a Google Cloud project, enable **Google Calendar API**, configure an OAuth consent screen, and create a web OAuth client.
2. The Connect button should begin the authorization-code flow on your backend with the `https://www.googleapis.com/auth/calendar` scope and offline access.
3. Store encrypted refresh tokens per user; never expose them to the client.
4. When an event changes locally, send the app event ID and `updated` timestamp to the backend. Create/update/delete its paired Google event with `events.insert`, `events.update`, or `events.delete`.
5. Store the Google event ID, ETag, and sync token. Pull incremental Google changes with `events.list` using `syncToken`, applying deletions as well.
6. Subscribe to Google Calendar push notifications (`events.watch`) and enqueue an incremental pull for each notification. Resolve simultaneous edits with a documented policy such as last-write-wins, or surface a conflict to the user.

Useful backend endpoints are `GET /auth/google`, `GET /auth/google/callback`, `POST /api/events`, `PATCH /api/events/:id`, `DELETE /api/events/:id`, and `POST /api/google/webhook`.

The included `server.js` implements the authorization-code flow, token refresh, event pull, and create/update/delete against the primary Google calendar. Calendar changes made in Hearth are pushed when saved; the **Sync now** button pulls changes made in Google Calendar.
