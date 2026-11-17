# Guest desk handoff

## Decision

**Code:** https://github.com/elliot14A/hyatus-assessment

- **Added `snoozedUntil` filtering in `GET /api/next-request`**: The endpoint now checks `snoozedUntil` against the current time (`Date.now()`). If a request has a valid date later than now, the recommendation engine skips it.
- **What didn't change**: Requests with missing, invalid, or expired timestamps are not hidden and are ranked exactly as before. All stage 2 rules remain in place: resolved requests are never recommended, and the ordering is strictly urgency (`urgent` > `normal` > `low`), then oldest `createdAt`, then ascending request ID for exact ties. No timers, schedulers, or new storage mechanisms were added.
- **Stage 2 triage rules preserved**:
  - `records.filter((item) => item.status === "open")` ensures resolved requests (`GD-104`) are never recommended.
  - Exact ties break on ascending alphanumeric request ID (`a.id.localeCompare(b.id)`), selecting `GD-103` over `GD-105`.
  - Reason strings remain clean and server-defined (`"Highest urgency, then oldest request."` or `"No open requests remain."`).
  - PATCH "mark handled" endpoint and UI flow remain unchanged.
  - Usability improvement: The Handle next banner and list cards display complete request context (guest, room, urgency, problem detail, and date with time in UTC, e.g. "3 Nov, 08:30 UTC") and links to the inbox list with a "Next up" spotlight badge.

---

## Why

- **Requirements**: Allow requests to be temporarily postponed by providing a future `snoozedUntil` timestamp. When evaluated, any future timestamp skips the request from recommendation. Missing, unparseable, or expired timestamps must remain active in the triage pool without breaking ranking.
- **Stateless time evaluation**: Evaluating `Date.now()` at the moment of request satisfies the business rule cleanly without background worker overhead, scheduled intervals, or cache invalidation complexity.
- **Stage 2 continuity**: Ensuring all non-snoozed requests follow the established hierarchy (urgency, age, ID) preserves predictable queue triage for the operator.

---

## How I checked

- **`npm test`**: Ran the native Node.js test runner (`node --test test/*.test.js`):
  ```text
  ✔ the starter serves its page, script, and fictional request inbox (46.2ms)
  ✔ handling a request is reflected by the next read and is safe to repeat (21.8ms)
  ✔ invalid updates and unknown paths do not mutate the inbox or expose source (15.1ms)
  ✔ an empty inbox remains a successful response (4.5ms)
  ✔ next-request recommendation excludes resolved requests and breaks exact ties by ascending ID (8.0ms)
  ✔ next-request respects urgency hierarchy and oldest timestamp within tier (5.5ms)
  ✔ next-request returns status 200 with request null and helpful reason when queue is empty or fully resolved (5.6ms)
  ✔ next-request handles snoozedUntil correctly across future, expired, missing, and invalid cases (9.2ms)
  ℹ tests 8
  ℹ suites 0
  ℹ pass 8
  ℹ fail 0
  ```

- **Observed test results for the four snooze cases**:
  1. **Future case**: An urgent open request with `snoozedUntil` set 1 hour in the future was skipped; the server recommended the next eligible normal-priority request (`REGULAR-NORM`).
  2. **Expired case**: An urgent open request with `snoozedUntil` set 1 hour in the past was not hidden; the server recommended it (`SNOOZE-PAST`) over lower-priority open requests.
  3. **Missing case**: An urgent open request without a `snoozedUntil` property was not hidden; the server recommended it (`NO-SNOOZE`) over lower-priority open requests.
  4. **Invalid case**: An urgent open request with an invalid date string (`"not-a-valid-date"`) was not hidden; the server recommended it (`INVALID-DATE`) over lower-priority open requests.
  5. **All-snoozed boundary**: When all open requests are snoozed into the future, `/api/next-request` returns status 200 with `{ request: null, reason: "No open requests remain." }`.

- **Browser**: Started server via `npm start` with native `node --watch`. Verified `GD-103` loaded in the triage banner and stepped through the queue until reaching the "All caught up." state.


---

## Working with AI

- **Rejected a silent fallback**: The AI assistant originally added a speculative fallback rank (`(rank[a.urgency] ?? 3)`) for missing urgencies. I removed it because it would hide bad or missing data instead of surfacing it.
- **Chose the usability change myself**: The AI assistant first suggested keyboard shortcuts and an undo button (an undo action already exists under the Handled tab). I redirected the focus to showing the missing guest, room, and detail metadata directly inside the "Handle next" banner so triage is self-contained.
- **Relying on high-value test standards**: I used established testing guidelines to write behavior-focused tests for boundary rules, avoiding trivial assertions that only check static properties.

---

## Remaining work

- **Validation for missing urgency**: If incoming data can omit urgency, add explicit schema checks to reject or handle invalid inputs at the system boundary.
- **Automated browser tests**: The frontend is verified through manual browser testing. An end-to-end suite (such as Playwright) could be added if automated UI checks are required later.
