/**
 * Redaction of secrets that appear inside Obsidian sync plugin logs.
 *
 * DESIGN CONTRACT: redaction must be *surgical*. We replace only the secret
 * value and keep every surrounding character (including the key name and the
 * line structure), because:
 *   1. the rules engine runs on the redacted text, so a redacted log must
 *      still match its failure signature;
 *   2. the report is meant to be pasted into a public GitHub issue, so it
 *      must not leak credentials but must stay readable.
 *
 * Every rule guards its value with NOT_MARKER, so running redaction twice is
 * a no-op: an already-redacted value is never re-redacted into a different
 * category.
 */

export type RedactionCategory =
  | "bearer-token"
  | "basic-auth"
  | "oauth-token"
  | "refresh-token"
  | "password"
  | "secret-key"
  | "aws-key"
  | "github-token"
  | "webhook-url"
  | "email"
  | "user-path"
  | "url-credential"
  | "query-secret"
  | "obsidian-license";

export interface RedactionHit {
  category: RedactionCategory;
  count: number;
}

export interface RedactionResult {
  text: string;
  hits: RedactionHit[];
  total: number;
}

/** Matches the marker shape this module produces. */
const MARKER_SHAPE = /^\[[A-Za-z-]+:[A-Za-z-]+\]$/;
/**
 * A value that is exactly `[something:something]` is treated as an existing
 * redaction marker and left alone.
 */
const NOT_MARKER = "(?!\\[[A-Za-z-]+:[A-Za-z-]+\\])";

function mark(category: RedactionCategory): string {
  return `[REDACTED:${category}]`;
}

interface RedactionRule {
  category: RedactionCategory;
  pattern: RegExp;
  /** Rebuilds the matched text; `m` is the RegExpExecArray. */
  build: (m: RegExpExecArray) => string;
  /**
   * Optional veto. When it returns false the match is left alone AND is not
   * counted, which keeps the redaction totals honest.
   */
  accept?: (m: RegExpExecArray) => boolean;
}

/**
 * Rule order matters: more specific categories run first so that, for
 * example, a `refresh_token` in a query string is attributed to
 * `query-secret` rather than to `oauth-token`.
 */
const RULES: RedactionRule[] = [
  {
    category: "webhook-url",
    pattern: new RegExp(
      "(https?://hooks\\.(?:slack\\.com|discord\\.com)/(?:services|api/webhooks)/)" +
        NOT_MARKER +
        "[^\\s\"'<>]+",
      "gi"
    ),
    build: (m) => m[1] + mark("webhook-url"),
  },
  {
    category: "bearer-token",
    pattern: new RegExp(
      "(\\bBearer\\s+)" + NOT_MARKER + "[A-Za-z0-9\\-._~+/]{8,}=*",
      "g"
    ),
    build: (m) => m[1] + mark("bearer-token"),
  },
  {
    category: "basic-auth",
    pattern: new RegExp(
      "(\\bBasic\\s+)" + NOT_MARKER + "[A-Za-z0-9+/]{8,}={0,2}",
      "g"
    ),
    build: (m) => m[1] + mark("basic-auth"),
  },
  {
    category: "aws-key",
    pattern: /\b(?:AKIA|ASIA|ABIA|ACCA)[0-9A-Z]{16}\b/g,
    build: () => mark("aws-key"),
  },
  {
    category: "github-token",
    pattern: /\b(?:ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9_]{20,}\b/g,
    build: () => mark("github-token"),
  },
  {
    category: "url-credential",
    pattern: new RegExp(
      "(\\b[a-z][a-z0-9+.-]*://[^\\s/:@]+):" + NOT_MARKER + "[^\\s/@]+@",
      "gi"
    ),
    build: (m) => m[1] + ":" + mark("url-credential") + "@",
  },
  {
    category: "query-secret",
    pattern: new RegExp(
      "([?&](?:access_?token|refresh_?token|api_?key|apikey|auth_?token|" +
        "password|passwd|pwd|secret|client_?secret|token|sig|signature|" +
        "p_?token|bypass_?token|code)=)" +
        NOT_MARKER +
        "[^&\\s\"'<>]+",
      "gi"
    ),
    build: (m) => m[1] + mark("query-secret"),
  },
  {
    category: "obsidian-license",
    pattern: new RegExp(
      "(\"license\"\\s*:\\s*\")" + NOT_MARKER + "[^\"]{8,}(\")",
      "gi"
    ),
    build: (m) => m[1] + mark("obsidian-license") + m[2],
  },
  {
    category: "refresh-token",
    pattern: new RegExp(
      "(\"?refresh_?token\"?(?:\\s*[:=]\\s*\"?))" + NOT_MARKER + "[^\"',\\s,}\\]]+",
      "gi"
    ),
    build: (m) => m[1] + mark("refresh-token"),
  },
  {
    category: "oauth-token",
    pattern: new RegExp(
      "(\"?(?:access_?token|id_?token|auth_?token|graph_?token|token)" +
        "\"?(?:\\s*[:=]\\s*\"?))" +
        NOT_MARKER +
        "[^\"',\\s,}\\]]+",
      "gi"
    ),
    build: (m) => m[1] + mark("oauth-token"),
  },
  {
    category: "secret-key",
    pattern: new RegExp(
      "(\"?(?:client_?secret|app_?secret|api_?secret|encryption_?key|" +
        "secret_?key|secret)\"?(?:\\s*[:=]\\s*\"?))" +
        NOT_MARKER +
        "[^\"',\\s,}\\]]+",
      "gi"
    ),
    build: (m) => m[1] + mark("secret-key"),
  },
  {
    category: "password",
    pattern: new RegExp(
      "(\"?(?:password|passwd|pwd)\"?(?:\\s*[:=]\\s*\"?))" +
        NOT_MARKER +
        "[^\"',\\s,}\\]]+",
      "gi"
    ),
    build: (m) => m[1] + mark("password"),
  },
  {
    // "the password is hunter2" - a credential stated in plain prose.
    // Only values that actually look like a credential are taken, so that
    // sentences like "the password is stored in the vault" stay readable.
    category: "password",
    pattern: /(\b(?:password|passwd|pwd)\b[^:=\n]{0,40}?\bis\s+)([^\s"',;]{6,})/gi,
    accept: (m) => {
      const value = m[2];
      const hasDigit = /\d/.test(value);
      const hasLetter = /[a-z]/i.test(value);
      return (hasDigit && hasLetter) || value.length >= 12;
    },
    build: (m) => m[1] + mark("password"),
  },
  {
    category: "email",
    pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    build: () => mark("email"),
  },
  {
    category: "user-path",
    pattern: new RegExp(
      "([A-Za-z]:\\\\Users\\\\)" + NOT_MARKER + "[^\\\\/:*?\"<>|\\r\\n]+",
      "g"
    ),
    build: (m) => m[1] + mark("user-path"),
  },
  {
    category: "user-path",
    pattern: new RegExp(
      "(/(?:home|Users)/)" + NOT_MARKER + "[^/\\s]+",
      "g"
    ),
    build: (m) => m[1] + mark("user-path"),
  },
];

interface ApplyOutcome {
  text: string;
  count: number;
}

function applyRule(text: string, rule: RedactionRule): ApplyOutcome {
  const re = new RegExp(
    rule.pattern.source,
    rule.pattern.flags.includes("g") ? rule.pattern.flags : rule.pattern.flags + "g"
  );
  let out = "";
  let cursor = 0;
  let count = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m[0] === "") {
      re.lastIndex += 1;
      continue;
    }
    if (rule.accept && !rule.accept(m)) {
      continue;
    }
    out += text.slice(cursor, m.index) + rule.build(m);
    cursor = m.index + m[0].length;
    count += 1;
  }
  out += text.slice(cursor);
  return { text: out, count };
}

export function redactText(input: string): RedactionResult {
  const counts = new Map<RedactionCategory, number>();
  let text = input;

  for (const rule of RULES) {
    const { text: next, count } = applyRule(text, rule);
    text = next;
    if (count > 0) {
      counts.set(rule.category, (counts.get(rule.category) ?? 0) + count);
    }
  }

  const hits: RedactionHit[] = [];
  let total = 0;
  for (const [category, count] of counts) {
    hits.push({ category, count });
    total += count;
  }

  return { text, hits, total };
}

/** True when the given value looks like a marker produced by this module. */
export function isRedactionMarker(value: string): boolean {
  return MARKER_SHAPE.test(value);
}
