# Hearth Calendar

A Google Calendar-inspired front end with event management, calendar visibility controls, month/week/day/schedule views, search, reminders, and local persistence.

## Run it

Open `index.html` in a browser, or serve the folder with any static server.

## Google two-way sync

The UI intentionally does not store Google credentials in the browser. A production sync service should own OAuth tokens and use the Google Calendar API:

1. Create a Google Cloud project, enable **Google Calendar API**, configure an OAuth consent screen, and create a web OAuth client.
2. The Connect button should begin the authorization-code flow on your backend with the `https://www.googleapis.com/auth/calendar` scope and offline access.
3. Store encrypted refresh tokens per user; never expose them to the client.
4. When an event changes locally, send the app event ID and `updated` timestamp to the backend. Create/update/delete its paired Google event with `events.insert`, `events.update`, or `events.delete`.
5. Store the Google event ID, ETag, and sync token. Pull incremental Google changes with `events.list` using `syncToken`, applying deletions as well.
6. Subscribe to Google Calendar push notifications (`events.watch`) and enqueue an incremental pull for each notification. Resolve simultaneous edits with a documented policy such as last-write-wins, or surface a conflict to the user.

Useful backend endpoints are `GET /auth/google`, `GET /auth/google/callback`, `POST /api/events`, `PATCH /api/events/:id`, `DELETE /api/events/:id`, and `POST /api/google/webhook`.

The current Connect flow is deliberately a visual/local prototype; completing the above server-side integration activates genuine two-way sync safely.
