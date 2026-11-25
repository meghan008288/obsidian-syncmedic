import { test } from "node:test";
import assert from "node:assert/strict";

import { curlArgs, curlBinary, parseStatus } from "../scripts/http.ts";

test("the curl binary follows the platform", () => {
  assert.equal(curlBinary("win32"), "curl.exe");
  assert.equal(curlBinary("linux"), "curl");
  assert.equal(curlBinary("darwin"), "curl");
});

test("every request follows redirects and gives up eventually", () => {
  const args = curlArgs("https://example.test/file.ts");
  assert.ok(args.includes("-L"), "redirects are not followed");
  assert.ok(args.includes("--max-time"));
  assert.ok(args.includes("--retry"));
  assert.equal(args[args.length - 1], "https://example.test/file.ts");
});

test("the proxy and the token are only sent when they exist", () => {
  const plain = curlArgs("https://example.test/file.ts");
  assert.ok(!plain.includes("-x"), "a proxy was used without being asked for");
  assert.ok(
    !plain.some((arg) => arg.startsWith("Authorization:")),
    "a token was sent without being asked for"
  );

  const proxied = curlArgs("https://example.test/file.ts", {
    proxy: "http://127.0.0.1:7897",
    token: "secret-token",
  });
  assert.ok(proxied.includes("-x"));
  assert.ok(proxied.includes("http://127.0.0.1:7897"));
  assert.ok(proxied.includes("Authorization: Bearer secret-token"));
});

test("the HTTP status is read back from the body", () => {
  const parsed = parseStatus("file contents\n__SYNC_MEDIC_HTTP_STATUS__:200");
  assert.equal(parsed.status, 200);
  assert.equal(parsed.body, "file contents");
});

test("a response without a status is reported as no answer", () => {
  const parsed = parseStatus("the connection was dropped");
  assert.equal(parsed.status, 0);
  assert.equal(parsed.body, "the connection was dropped");
});

test("a body that ends in digits is not mistaken for a status", () => {
  const parsed = parseStatus("the port is 8080\n__SYNC_MEDIC_HTTP_STATUS__:404");
  assert.equal(parsed.status, 404);
  assert.equal(parsed.body, "the port is 8080");
});
