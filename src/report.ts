/**
 * Report rendering.
 *
 * The report is written so that it can be pasted straight into a GitHub
 * issue: every matched rule gets its evidence, a fix list, and a link to the
 * upstream issue where the same failure was reported.
 *
 * Defence in depth: whatever reaches this module is re-redacted again before
 * it is rendered, so a secret can never escape into a report even if the
 * caller forgot to redact the input first.
 */

import { redactText, type RedactionHit } from "./redact.ts";
import type { AnalysisResult, RuleMatch, Severity } from "./rules.ts";
import type { CollectionResult } from "./logs.ts";

export interface ReportInput {
  analysis: AnalysisResult;
  collection?: CollectionResult;
  redactions?: { total: number; hits: RedactionHit[] };
  generatedAt?: string;
  pluginVersion?: string;
  vaultName?: string;
}

const SEVERITY_LABEL: Record<Severity, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Hint",
};

const SEVERITY_ICON: Record<Severity, string> = {
  critical: "🔴",
  warning: "🟡",
  info: "🔵",
};

function now(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}

function safe(text: string): string {
  return redactText(text).text;
}

function escapeInline(text: string): string {
  return text.replace(/\|/g, "\\|");
}

export function renderSummary(input: ReportInput): string {
  const { matches } = input.analysis;
  if (matches.length === 0) {
    const scanned = input.analysis.scannedLines;
    return `SyncMedic check complete: no known failure signature matched (${scanned} lines scanned).`;
  }
  const critical = matches.filter((m) => m.severity === "critical");
  const first = matches[0];
  const head =
    critical.length > 0
      ? `${critical.length} critical ${critical.length === 1 ? "problem" : "problems"} found`
      : `${matches.length} ${matches.length === 1 ? "problem" : "problems"} found`;
  return `SyncMedic: ${head}. Top priority: ${first.ruleId} "${first.title}".`;
}

export function renderMarkdownReport(input: ReportInput): string {
  const { analysis, collection, redactions } = input;
  const lines: string[] = [];

  lines.push("# SyncMedic health check report");
  lines.push("");
  lines.push(
    `> ${renderSummary(input)}  ·  Generated ${safe(input.generatedAt ?? now())}  ·  Plugin version ${safe(
      input.pluginVersion ?? "0.1.8"
    )}`
  );
  lines.push("");
  if (input.vaultName) {
    lines.push(`- Vault: ${safe(input.vaultName)}`);
  }
  lines.push(
    `- Scanned: ${analysis.scannedDocuments} files / ${analysis.scannedLines} lines, ${analysis.matchedDocuments} files matched`
  );
  if (redactions) {
    const detail =
      redactions.hits.length > 0
        ? ` (${redactions.hits.map((h) => `${h.category}×${h.count}`).join(", ")})`
        : "";
    lines.push(`- Redacted: ${redactions.total} value(s)${detail}`);
  }
  lines.push("");

  lines.push("## Findings");
  lines.push("");

  if (analysis.matches.length === 0) {
    lines.push(
      `No known failure signature matched. This scan covered ${analysis.scannedLines} log lines, ${
        analysis.scannedDocuments > 0
          ? "and none of the 22 rules matched that content."
          : "but no log files were collected, so this only means 'no problem seen', not 'no problem there'."
      }`
    );
    lines.push("");
  } else {
    for (const match of analysis.matches) {
      lines.push(
        `### ${SEVERITY_ICON[match.severity]} ${match.ruleId} ${safe(match.title)}`
      );
      lines.push("");
      lines.push(
        `- Severity: ${SEVERITY_LABEL[match.severity]} | Category: ${safe(match.category)} | Occurrences: ${match.occurrences}`
      );
      lines.push(
        `- Signature source: ${match.origin === "source" ? "a string confirmed in the plugin source" : "real output a user pasted into an upstream issue"}`
      );
      if (match.evidence.length > 0) {
        lines.push("");
        lines.push("Evidence:");
        lines.push("");
        lines.push("```");
        for (const evidence of match.evidence) {
          lines.push(`${safe(evidence.source)}:${evidence.line} ${safe(evidence.text)}`);
        }
        lines.push("```");
      }
      lines.push("");
      lines.push("How to fix:");
      lines.push("");
      for (const fix of match.fixes) {
        lines.push(`1. ${safe(fix)}`);
      }
      lines.push("");
      if (match.issues.length > 0) {
        const links = match.issues
          .map(
            (issue) =>
              `- ${issue.repo}#${issue.number} (${issue.relation === "direct" ? "direct evidence" : "related discussion"}): ${issue.url}`
          )
          .join("\n");
        lines.push("Upstream issues:");
        lines.push("");
        lines.push(links);
        lines.push("");
      }
    }
  }

  if (collection) {
    const empty = collection.sources.filter((s) => s.found === 0);
    if (empty.length > 0) {
      lines.push("## Sources that produced no logs");
      lines.push("");
      lines.push("| Source | How to collect it |");
      lines.push("| --- | --- |");
      for (const source of empty) {
        lines.push(
          `| ${escapeInline(safe(source.label))} | ${escapeInline(safe(source.hint))} |`
        );
      }
      lines.push("");
    }

    if (collection.errors.length > 0) {
      lines.push("## Problems during collection");
      lines.push("");
      for (const error of collection.errors) {
        lines.push(`- ${safe(error)}`);
      }
      lines.push("");
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(
    "This report was generated locally by SyncMedic. All log content has been redacted, so it is safe to paste into a public issue."
  );

  return lines.join("\n");
}

export function renderJsonReport(input: ReportInput): string {
  const { analysis } = input;
  const payload = {
    tool: "SyncMedic",
    pluginVersion: input.pluginVersion ?? "0.1.8",
    generatedAt: input.generatedAt ?? now(),
    vaultName: input.vaultName ? safe(input.vaultName) : undefined,
    scanned: {
      documents: analysis.scannedDocuments,
      lines: analysis.scannedLines,
      matchedDocuments: analysis.matchedDocuments,
    },
    redactions: input.redactions ?? { total: 0, hits: [] },
    matches: analysis.matches.map((match: RuleMatch) => ({
      ruleId: match.ruleId,
      title: safe(match.title),
      severity: match.severity,
      category: safe(match.category),
      occurrences: match.occurrences,
      origin: match.origin,
      evidence: match.evidence.map((evidence) => ({
        line: evidence.line,
        source: safe(evidence.source),
        text: safe(evidence.text),
      })),
      fixes: match.fixes.map((fix) => safe(fix)),
      issues: match.issues.map((issue) => ({
        repo: issue.repo,
        number: issue.number,
        relation: issue.relation,
        url: issue.url,
      })),
    })),
    sources: (input.collection?.sources ?? []).map((source) => ({
      id: source.id,
      label: safe(source.label),
      pluginId: source.pluginId,
      found: source.found,
      hint: safe(source.hint),
    })),
    errors: (input.collection?.errors ?? []).map((error) => safe(error)),
  };

  return JSON.stringify(payload, null, 2);
}
