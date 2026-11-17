import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const seed = JSON.parse(
  readFileSync(new URL("./requests.json", import.meta.url), "utf8"),
);
const files = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/app.js", ["app.js", "application/javascript; charset=utf-8"]],
  ["/style.css", ["style.css", "text/css; charset=utf-8"]],
]);

function json(res, status, value) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(value));
}

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size <= 4096) chunks.push(chunk);
  }
  if (size > 4096)
    throw Object.assign(new Error("Request is too large."), { status: 413 });
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Send a JSON object."), { status: 400 });
  }
}

function isSnoozed(item, now = Date.now()) {
  if (!item.snoozedUntil) return false;
  const time = Date.parse(item.snoozedUntil);
  return !Number.isNaN(time) && time > now;
}

// A new server starts with independent fictional records. A browser reload keeps changes;
// restarting the process resets them. The exercise does not need a database or credentials.
export function createStarterServer({ requests = seed } = {}) {
  const records = structuredClone(requests);
  return createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    try {
      const { pathname } = new URL(req.url, "http://localhost");
      if (req.method === "GET" && files.has(pathname)) {
        const [file, type] = files.get(pathname);
        res.writeHead(200, { "Content-Type": type });
        return res.end(
          readFileSync(new URL(`./public/${file}`, import.meta.url)),
        );
      }
      if (req.method === "GET" && pathname === "/api/next-request") {
        const rank = { urgent: 0, normal: 1, low: 2 };
        const now = Date.now();
        // for all the requests urgency always exists and I'm assuming it always does in the real scenario as well
        // if it doesn't I can add a fallback based on requirement
        const openRecords = records.filter(
          (item) => item.status === "open" && !isSnoozed(item, now),
        );
        const request =
          openRecords.toSorted(
            (a, b) =>
              rank[a.urgency] - rank[b.urgency] ||
              a.createdAt.localeCompare(b.createdAt) ||
              a.id.localeCompare(b.id),
          )[0] || null;
        return json(res, 200, {
          request,
          reason: request
            ? "Highest urgency, then oldest request."
            : "No open requests remain.",
        });
      }
      if (req.method === "GET" && pathname === "/api/requests") {
        return json(res, 200, {
          requests: records.toSorted(
            (a, b) =>
              a.createdAt.localeCompare(b.createdAt) ||
              a.id.localeCompare(b.id),
          ),
        });
      }
      const match = pathname.match(/^\/api\/requests\/([A-Z0-9-]+)$/);
      if (req.method === "PATCH" && match) {
        const record = records.find((item) => item.id === match[1]);
        if (!record) return json(res, 404, { error: "Request not found." });
        const body = await readBody(req);
        if (
          !body ||
          Array.isArray(body) ||
          !["open", "resolved"].includes(body.status)
        )
          return json(res, 400, { error: "Status must be open or resolved." });
        record.status = body.status;
        return json(res, 200, { request: record });
      }
      return json(res, 404, { error: "This route is not available." });
    } catch (error) {
      json(res, error.status || 500, {
        error: error.status
          ? error.message
          : "The request could not be completed.",
      });
    }
  });
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  const port = Number(process.env.PORT || 43211);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error("PORT must be between 1 and 65535.");
  createStarterServer().listen(port, "127.0.0.1", () =>
    console.log(`Guest desk: http://127.0.0.1:${port}`),
  );
}
