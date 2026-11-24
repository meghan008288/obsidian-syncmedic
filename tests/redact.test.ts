import { test } from "node:test";
import assert from "node:assert/strict";

import { redactText, type RedactionResult } from "../src/redact.ts";

function countOf(result: RedactionResult, category: string): number {
  return result.hits.find((h) => h.category === category)?.count ?? 0;
}

test("redacts a Bearer token but keeps the Authorization header name", () => {
  const raw =
    "plugin:remotely-save:234 Debug request Authorization: Bearer " +
    "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  const out = redactText(raw);

  assert.ok(out.text.includes("Authorization: Bearer"), "header name must survive");
  assert.ok(
    !out.text.includes("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "token must be gone"
  );
  assert.ok(out.text.includes("[REDACTED:bearer-token]"));
  assert.equal(countOf(out, "bearer-token"), 1);
});

test("redacts accessToken, refreshToken and clientSecret but keeps their key names", () => {
  const raw =
    '{"onedrive":{"accessToken":"eyJraWQiOiJ0ZXN0In0.abc.def",' +
    '"refreshToken":"M.R3_BAY.xyz789","clientSecret":"s3cr3tValue"}}';
  const out = redactText(raw);

  assert.ok(out.text.includes("accessToken"), "key name must survive");
  assert.ok(out.text.includes("refreshToken"), "key name must survive");
  assert.ok(out.text.includes("clientSecret"), "key name must survive");
  assert.ok(!out.text.includes("s3cr3tValue"), "client secret must be gone");
  assert.ok(!out.text.includes("M.R3_BAY.xyz789"), "refresh token must be gone");
  assert.ok(countOf(out, "oauth-token") >= 1);
  assert.ok(countOf(out, "refresh-token") >= 1);
  assert.ok(countOf(out, "secret-key") >= 1);
});

test("redacts only the password inside a URL userinfo section", () => {
  const raw = "WebDAV target: https://alice:p4ssw0rd@dav.example.com/obsidian/notes.md";
  const out = redactText(raw);

  assert.ok(out.text.includes("dav.example.com"), "host must survive");
  assert.ok(out.text.includes("alice"), "username must survive");
  assert.ok(!out.text.includes("p4ssw0rd"), "password must be gone");
  assert.ok(out.text.includes("[REDACTED:url-credential]"));
});

test("redacts AWS access key ids", () => {
  // Assembled from parts: a literal AKIA-prefixed key in the source tree
  // trips GitHub's push protection.
  const awsKey = ["AKIA", "IOSFODNN7EXAMPLE"].join("");
  const out = redactText(`aws_access_key_id=${awsKey}`);
  assert.ok(!out.text.includes(awsKey));
  assert.equal(countOf(out, "aws-key"), 1);
});

test("redacts GitHub personal access tokens", () => {
  const token = ["ghp_", "16C7e42F292c6912E7710c838347Ae178B4a"].join("");
  const out = redactText(`token is ${token} ok`);
  assert.ok(!out.text.includes(token));
  assert.equal(countOf(out, "github-token"), 1);
});

test("redacts email addresses", () => {
  const out = redactText("account alice.smith+obsidian@example.com is the owner");
  assert.ok(!out.text.includes("alice.smith+obsidian@example.com"));
  assert.equal(countOf(out, "email"), 1);
});

test("redacts the Windows user profile segment of a path", () => {
  const out = redactText("vault at C:\\Users\\zhangwei\\Documents\\MyVault");
  assert.ok(!out.text.includes("zhangwei"));
  assert.ok(out.text.includes("C:\\Users\\"), "the path prefix must survive");
  assert.ok(out.text.includes("MyVault"), "the vault name must survive");
});

test("redacts secret query parameters but keeps the parameter name", () => {
  const out = redactText("GET https://api.example.com/x?access_token=abc123def&limit=10");
  assert.ok(out.text.includes("access_token="), "param name must survive");
  assert.ok(!out.text.includes("abc123def"));
  assert.ok(out.text.includes("limit=10"), "harmless params must survive");
});

test("redacts Slack webhook URLs", () => {
  // Assembled from parts on purpose: a literal Slack webhook URL in the
  // source tree trips GitHub's push protection, even for a dummy value.
  const webhook = [
    "https://hooks.slack.com",
    "services",
    "T00000000",
    "B00000000",
    "XXXXXXXXXXXXXXXXXXXXXXXX",
  ].join("/");
  const out = redactText(`post to ${webhook}`);
  assert.ok(!out.text.includes("XXXXXXXXXXXXXXXXXXXXXXXX"));
  assert.equal(countOf(out, "webhook-url"), 1);
});

test("redacts a Basic auth header", () => {
  const out = redactText("Proxy-Authorization: Basic YWxpY2U6aHVudGVyMg==");
  assert.ok(!out.text.includes("YWxpY2U6aHVudGVyMg=="));
  assert.ok(out.text.includes("Basic"));
});

test("counts every redaction by category", () => {
  const raw = [
    "Bearer abc.def.ghi",
    "Bearer jkl.mno.pqr",
    "password: hunter2",
  ].join("\n");
  const out = redactText(raw);

  assert.equal(countOf(out, "bearer-token"), 2);
  assert.equal(countOf(out, "password"), 1);
  assert.equal(out.total, 3);
});

test("leaves ordinary prose untouched", () => {
  const raw = "I rotated the token and the password is stored in the vault settings.";
  const out = redactText(raw);
  assert.equal(out.text, raw);
  assert.equal(out.total, 0);
});

test("preserves the line count so evidence line numbers stay valid", () => {
  const raw = ["first line", "second line with alice@example.com", "third line"].join(
    "\n"
  );
  const out = redactText(raw);
  assert.equal(out.text.split("\n").length, raw.split("\n").length);
});

test("keeps the failure signature intact so the rules engine still matches", () => {
  const raw =
    "plugin:remotely-save:234 Error: Request failed, status 403\n" +
    "plugin:remotely-save:234 Error: Request failed, status 429";
  const out = redactText(raw);
  assert.ok(out.text.includes("Request failed, status 403"));
  assert.ok(out.text.includes("Request failed, status 429"));
});

test("is idempotent: redacting twice changes nothing the second time", () => {
  const raw =
    "Bearer abc.def.ghi password: hunter2 alice@example.com " +
    "AKIAIOSFODNN7EXAMPLE C:\\Users\\zhangwei\\vault";
  const once = redactText(raw);
  const twice = redactText(once.text);

  assert.equal(twice.text, once.text);
  assert.equal(twice.total, 0);
});

test("redacts an Obsidian license key value", () => {
  const out = redactText('{"license":"8f3b2c1d9e7a6b5c4d3e2f1a0b9c8d7"}');
  assert.ok(!out.text.includes("8f3b2c1d9e7a6b5c4d3e2f1a0b9c8d7"));
  assert.ok(out.text.includes("license"));
});

test("redacts a password written in prose when the value looks like a credential", () => {
  const out = redactText("plugin:remotely-save:234 Debug password for webdav is hunter2");
  assert.ok(!out.text.includes("hunter2"), "a credential-shaped password must go");
  assert.ok(out.text.includes("[REDACTED:password]"));
});

test("does not redact a password mentioned in ordinary prose", () => {
  const raw = "the password is stored in the vault settings, not in the plugin";
  const out = redactText(raw);
  assert.equal(out.text, raw);
  assert.equal(out.total, 0);
});

test("a vetoed match is not counted as a redaction", () => {
  const raw = "the password is stored in the vault settings";
  const out = redactText(raw);
  assert.equal(out.total, 0);
  assert.equal(out.hits.length, 0);
});
