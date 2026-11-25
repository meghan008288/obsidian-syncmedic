/**
 * A very small HTTP client built on curl.
 *
 * The drift check runs on three kinds of machine: a developer on Windows, a
 * GitHub runner on Ubuntu and anything else that has curl installed. The
 * binary is called "curl.exe" on Windows and "curl" everywhere else, so the
 * name is picked from the platform instead of being hard coded.
 *
 * The HTTP status is read back separately from the body so that a missing
 * file can be told apart from a machine that cannot reach the network. That
 * difference decides whether the drift check reports a broken fingerprint or
 * simply admits that it could not look.
 */
import { spawnSync } from "node:child_process";

const STATUS_MARKER = "__SYNC_MEDIC_HTTP_STATUS__:";

/** The curl binary to call on the given platform. */
export function curlBinary(platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? "curl.exe" : "curl";
}

export interface CurlOptions {
  proxy?: string;
  token?: string;
  accept?: string;
  maxTime?: number;
  retries?: number;
}

/** The arguments for one curl call. */
export function curlArgs(url: string, options: CurlOptions = {}): string[] {
  const args = [
    "-s",
    "-L",
    "--max-time",
    String(options.maxTime ?? 45),
    "--retry",
    String(options.retries ?? 2),
    "--retry-delay",
    "2",
    "--retry-all-errors",
  ];
  if (options.proxy) args.push("-x", options.proxy);
  if (options.token) args.push("-H", `Authorization: Bearer ${options.token}`);
  args.push("-H", `Accept: ${options.accept ?? "text/plain"}`);
  args.push("-w", `\n${STATUS_MARKER}%{http_code}`);
  args.push(url);
  return args;
}

/** The HTTP status curl reported, or 0 when the request never got an answer. */
export function parseStatus(raw: string): { status: number; body: string } {
  const at = raw.lastIndexOf(`\n${STATUS_MARKER}`);
  if (at < 0) return { status: 0, body: raw };
  const status = Number(raw.slice(at + STATUS_MARKER.length + 1).trim());
  return {
    status: Number.isFinite(status) ? status : 0,
    body: raw.slice(0, at),
  };
}

export interface HttpResult {
  /** True when the server answered with a 2xx status. */
  ok: boolean;
  /** The HTTP status, or 0 when the request never reached the server. */
  status: number;
  /** The response body. */
  body: string;
  /** Why the request failed, when it did. */
  error?: string;
}

/**
 * Fetch one URL. A 404 is not an error here: the caller decides what a
 * missing page means. A machine that cannot reach the network at all is
 * reported as status 0.
 */
export function fetchText(url: string, options: CurlOptions = {}): HttpResult {
  const result = spawnSync(curlBinary(), curlArgs(url, options), {
    encoding: "utf-8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error) {
    return { ok: false, status: 0, body: "", error: result.error.message };
  }

  const { status, body } = parseStatus(result.stdout ?? "");
  if (status === 0) {
    return {
      ok: false,
      status: 0,
      body,
      error: (result.stderr ?? "").trim() || "no answer from the server",
    };
  }
  return { ok: status >= 200 && status < 300, status, body };
}
