import test from "node:test";
import assert from "node:assert/strict";
import { createStarterServer } from "../server.js";

async function fixture(t, options) {
  const server = createStarterServer(options);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => {
    server.closeAllConnections();
    server.close();
  });
  return (path, options) =>
    fetch(`http://127.0.0.1:${server.address().port}${path}`, options);
}

test("the starter serves its page, script, and fictional request inbox", async (t) => {
  const call = await fixture(t);
  assert.match(await (await call("/")).text(), /Small requests/);
  assert.match(
    (await call("/app.js")).headers.get("content-type"),
    /javascript/,
  );
  const response = await call("/api/requests");
  assert.equal(response.status, 200);
  const { requests } = await response.json();
  assert.equal(requests.length, 8);
  assert.equal(requests.filter((item) => item.status === "open").length, 7);
});

test("handling a request is reflected by the next read and is safe to repeat", async (t) => {
  const call = await fixture(t);
  for (let i = 0; i < 2; i++) {
    const response = await call("/api/requests/GD-103", {
      method: "PATCH",
      body: JSON.stringify({ status: "resolved" }),
    });
    assert.equal(response.status, 200);
  }
  assert.equal(
    (await (await call("/api/requests")).json()).requests.find(
      (item) => item.id === "GD-103",
    ).status,
    "resolved",
  );
  const other = await fixture(t);
  assert.equal(
    (await (await other("/api/requests")).json()).requests.find(
      (item) => item.id === "GD-103",
    ).status,
    "open",
  );
});

test("invalid updates and unknown paths do not mutate the inbox or expose source", async (t) => {
  const call = await fixture(t);
  for (const body of ["null", "{}", "not-json", '{"status":"missing"}'])
    assert.equal(
      (await call("/api/requests/GD-103", { method: "PATCH", body })).status,
      400,
    );
  assert.equal(
    (
      await call("/api/requests/GD-999", {
        method: "PATCH",
        body: '{"status":"resolved"}',
      })
    ).status,
    404,
  );
  assert.equal((await call("/server.js")).status, 404);
  assert.equal((await call("/package.json")).status, 404);
  assert.equal(
    (
      await call("/api/requests/GD-103", {
        method: "PATCH",
        body: " ".repeat(4097),
      })
    ).status,
    413,
  );
});

test("an empty inbox remains a successful response", async (t) => {
  const call = await fixture(t, { requests: [] });
  assert.deepEqual(await (await call("/api/requests")).json(), {
    requests: [],
  });
});

test("next-request recommendation excludes resolved requests and breaks exact ties by ascending ID", async (t) => {
  const call = await fixture(t);
  const response = await call("/api/next-request");
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.request.id, "GD-103");
  assert.equal(body.reason, "Highest urgency, then oldest request.");

  await call("/api/requests/GD-103", {
    method: "PATCH",
    body: JSON.stringify({ status: "resolved" }),
  });
  const next = await (await call("/api/next-request")).json();
  assert.equal(next.request.id, "GD-105");
});

test("next-request respects urgency hierarchy and oldest timestamp within tier", async (t) => {
  const call = await fixture(t, {
    requests: [
      {
        id: "REQ-1",
        urgency: "low",
        status: "open",
        createdAt: "2026-11-01T00:00:00Z",
      },
      {
        id: "REQ-2",
        urgency: "normal",
        status: "open",
        createdAt: "2026-11-02T00:00:00Z",
      },
      {
        id: "REQ-3",
        urgency: "normal",
        status: "open",
        createdAt: "2026-11-01T12:00:00Z",
      },
      {
        id: "REQ-4",
        urgency: "urgent",
        status: "open",
        createdAt: "2026-11-03T00:00:00Z",
      },
    ],
  });

  const res1 = await (await call("/api/next-request")).json();
  assert.equal(res1.request.id, "REQ-4");

  await call("/api/requests/REQ-4", {
    method: "PATCH",
    body: JSON.stringify({ status: "resolved" }),
  });

  const res2 = await (await call("/api/next-request")).json();
  assert.equal(res2.request.id, "REQ-3");
});

test("next-request returns status 200 with request null and helpful reason when queue is empty or fully resolved", async (t) => {
  const emptyCall = await fixture(t, { requests: [] });
  const emptyRes = await emptyCall("/api/next-request");
  assert.equal(emptyRes.status, 200);
  assert.deepEqual(await emptyRes.json(), {
    request: null,
    reason: "No open requests remain.",
  });

  const resolvedCall = await fixture(t, {
    requests: [
      {
        id: "REQ-X",
        urgency: "urgent",
        status: "resolved",
        createdAt: "2026-11-01T00:00:00Z",
      },
    ],
  });
  const resolvedRes = await resolvedCall("/api/next-request");
  assert.equal(resolvedRes.status, 200);
  assert.deepEqual(await resolvedRes.json(), {
    request: null,
    reason: "No open requests remain.",
  });
});

test("next-request handles snoozedUntil correctly across future, expired, missing, and invalid cases", async (t) => {
  const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const futureCall = await fixture(t, {
    requests: [
      {
        id: "SNOOZE-FUT",
        urgency: "urgent",
        status: "open",
        snoozedUntil: future,
        createdAt: "2026-11-01T00:00:00Z",
      },
      {
        id: "REGULAR-NORM",
        urgency: "normal",
        status: "open",
        createdAt: "2026-11-02T00:00:00Z",
      },
    ],
  });
  const futureRes = await (await futureCall("/api/next-request")).json();
  assert.equal(futureRes.request.id, "REGULAR-NORM");

  const expiredCall = await fixture(t, {
    requests: [
      {
        id: "SNOOZE-PAST",
        urgency: "urgent",
        status: "open",
        snoozedUntil: past,
        createdAt: "2026-11-01T00:00:00Z",
      },
      {
        id: "REGULAR-NORM",
        urgency: "normal",
        status: "open",
        createdAt: "2026-11-02T00:00:00Z",
      },
    ],
  });
  const expiredRes = await (await expiredCall("/api/next-request")).json();
  assert.equal(expiredRes.request.id, "SNOOZE-PAST");

  const missingCall = await fixture(t, {
    requests: [
      {
        id: "NO-SNOOZE",
        urgency: "urgent",
        status: "open",
        createdAt: "2026-11-01T00:00:00Z",
      },
      {
        id: "REGULAR-NORM",
        urgency: "normal",
        status: "open",
        createdAt: "2026-11-02T00:00:00Z",
      },
    ],
  });
  const missingRes = await (await missingCall("/api/next-request")).json();
  assert.equal(missingRes.request.id, "NO-SNOOZE");

  const invalidCall = await fixture(t, {
    requests: [
      {
        id: "INVALID-DATE",
        urgency: "urgent",
        status: "open",
        snoozedUntil: "not-a-valid-date",
        createdAt: "2026-11-01T00:00:00Z",
      },
      {
        id: "REGULAR-NORM",
        urgency: "normal",
        status: "open",
        createdAt: "2026-11-02T00:00:00Z",
      },
    ],
  });
  const invalidRes = await (await invalidCall("/api/next-request")).json();
  assert.equal(invalidRes.request.id, "INVALID-DATE");

  const allSnoozedCall = await fixture(t, {
    requests: [
      {
        id: "SNOOZE-ALL",
        urgency: "urgent",
        status: "open",
        snoozedUntil: future,
        createdAt: "2026-11-01T00:00:00Z",
      },
    ],
  });
  const allSnoozedRes = await allSnoozedCall("/api/next-request");
  assert.equal(allSnoozedRes.status, 200);
  assert.deepEqual(await allSnoozedRes.json(), {
    request: null,
    reason: "No open requests remain.",
  });
});
