# Guest desk handoff

## Decision

**Code:** https://github.com/elliot14A/hyatus-assessment

- **Fixed `GET /api/next-request`**: The endpoint now returns only open requests (`records.filter((item) => item.status === "open")`). The starter code sorted all records without checking status, which recommended the already-resolved request `GD-104` (urgent, oldest) on page load.
- **Tie-break**: Fixed. The starter code broke exact ties with a descending ID sort (`b.id.localeCompare(a.id)`), which picked `GD-105` over `GD-103`. I fixed this to an ascending ID sort (`a.id.localeCompare(b.id)`), selecting `GD-103` first.
- **Reason text**: Kept the server reason string (`"Highest urgency, then oldest request."` when a request is recommended, and `"No open requests remain."` when the queue is empty).
- **Kept the PATCH "mark handled" flow unchanged**: I first suspected it was broken, but it works as designed. A misleading UI state caused the confusion: the browser was hitting a stale in-memory server process that had not reloaded our changes, so `GET /api/next-request` kept returning already-resolved `GD-104`. Clicking "Mark handled" sent the PATCH successfully, but the next recommendation request returned `GD-104` again, making the button look unresponsive. Restarting the server with native watch mode fixed this, and I added tests to lock in the behavior.
- **Usability**: The **Handle next** banner now shows the recommended request's key details: guest name, room number, urgency tag, and description text. It also adds a visual "Next up" badge to the matching card in the list. These details come directly from the backend recommendation, so the operator can act without having to search the list below. I considered adding a separate detail view for each task, but kept the change minimal, focused, and free of extra dependencies.

---

## Why

- **Requirements**: Never recommend a resolved request, and sort by urgency (`urgent` > `normal` > `low`), then oldest `createdAt`, then ascending request ID for exact ties.
- **Assumption**: Every request has a valid urgency (`urgent`, `normal`, or `low`), as defined in the data model. An unknown value results in an invalid sort order. If real-world input can lack an urgency tag, the product specification should define an explicit fallback rank and test it at the boundary, rather than adding an arbitrary default to the code.

---

## How I checked

- **`npm test`**: Ran the native Node.js test runner (`node --test test/*.test.js`):
  ```text
  ✔ the starter serves its page, script, and fictional request inbox (40.7ms)
  ✔ handling a request is reflected by the next read and is safe to repeat (20.7ms)
  ✔ invalid updates and unknown paths do not mutate the inbox or expose source (13.4ms)
  ✔ an empty inbox remains a successful response (4.6ms)
  ✔ next-request recommendation excludes resolved requests and breaks exact ties by ascending ID (8.4ms)
  ✔ next-request respects urgency hierarchy and oldest timestamp within tier (5.8ms)
  ✔ next-request returns status 200 with request null and helpful reason when queue is empty or fully resolved (5.0ms)
  ℹ tests 7
  ℹ suites 0
  ℹ pass 7
  ℹ fail 0
  ```

- **New tests**:
  1. `next-request recommendation excludes resolved requests and breaks exact ties by ascending ID`: Verifies `GD-104` is never recommended, `GD-103` beats `GD-105` on exact ties, and resolving `GD-103` advances the queue to `GD-105`.
  2. `next-request respects urgency hierarchy and oldest timestamp within tier`: Verifies urgent requests come before older normal or low requests, and ties within the same urgency level pick the oldest request.
  3. `next-request returns status 200 with request null and helpful reason when queue is empty or fully resolved`: Verifies empty queues and fully resolved queues return `{ request: null, reason: "No open requests remain." }` with status 200.

- **Browser**: Started the server with `npm start` (using native `node --watch`). Confirmed `GD-103` appeared in the banner with full guest, room, and detail metadata. Clicked "Mark handled" across all items in order (`GD-103` -> `GD-105` -> `GD-102` -> `GD-106` -> `GD-101`), confirming the banner showed "All caught up." with "No open requests remain." and hid the action button. Switched between "Open requests", "All requests", and "Handled" filter tabs, confirming badges and cards stayed synchronized.

- **Unverified**: Simulated network drops and timeout errors were not manually triggered in the browser.

---

## Working with AI

- **Rejected a silent fallback**: The AI assistant first added a default rank (`(rank[a.urgency] ?? 3)`) for missing urgencies. I removed it because it would hide bad or missing data instead of surfacing it. Fallback rules belong in the product requirements, not as hard-coded guesses.
- **Chose the usability change myself**: The AI assistant first suggested keyboard shortcuts and an undo button (an undo action already exists under the Handled tab, and both suggestions felt carried over from other projects). I chose to show the missing guest, room, and detail metadata directly inside the "Handle next" banner so the operator has the context needed to act immediately.
- **Relying on high-value test standards**: I used my existing test guidelines to write behavior-focused tests for boundary rules, avoiding trivial assertions that only check static properties.

---

## Remaining work

- **Validation for missing urgency**: If incoming data can omit urgency, add explicit schema checks to reject or handle invalid inputs at the system boundary.
- **Automated browser tests**: The frontend is verified through manual browser testing. An end-to-end suite (such as Playwright) could be added if automated UI checks are required later.
