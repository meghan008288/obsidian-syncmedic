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
  critical: "严重",
  warning: "警告",
  info: "提示",
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
    return `SyncMedic 体检完成：没有命中已知故障指纹（扫了 ${scanned} 行）。`;
  }
  const critical = matches.filter((m) => m.severity === "critical");
  const first = matches[0];
  const head =
    critical.length > 0
      ? `发现 ${critical.length} 个严重问题`
      : `发现 ${matches.length} 个问题`;
  return `SyncMedic 体检：${head}，最优先的是 ${first.ruleId}「${first.title}」。`;
}

export function renderMarkdownReport(input: ReportInput): string {
  const { analysis, collection, redactions } = input;
  const lines: string[] = [];

  lines.push("# SyncMedic 同步体检报告");
  lines.push("");
  lines.push(
    `> ${renderSummary(input)}  ·  生成时间 ${safe(input.generatedAt ?? now())}  ·  插件版本 ${safe(
      input.pluginVersion ?? "0.1.1"
    )}`
  );
  lines.push("");
  if (input.vaultName) {
    lines.push(`- Vault：${safe(input.vaultName)}`);
  }
  lines.push(
    `- 扫描：${analysis.scannedDocuments} 个文件 / ${analysis.scannedLines} 行，命中 ${analysis.matchedDocuments} 个文件`
  );
  if (redactions) {
    const detail =
      redactions.hits.length > 0
        ? `（${redactions.hits.map((h) => `${h.category}×${h.count}`).join("、")}）`
        : "";
    lines.push(`- 已脱敏：${redactions.total} 处${detail}`);
  }
  lines.push("");

  lines.push("## 命中的问题");
  lines.push("");

  if (analysis.matches.length === 0) {
    lines.push(
      `没有命中已知故障指纹。本次扫了 ${analysis.scannedLines} 行日志，${
        analysis.scannedDocuments > 0
          ? "这些内容里没有 22 条规则中的任何一条。"
          : "但没有采集到任何日志文件，所以这句话只能说明「没看到问题」，不能说明「没有问题」。"
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
        `- 严重程度：${SEVERITY_LABEL[match.severity]}　分类：${safe(match.category)}　出现次数：${match.occurrences}`
      );
      lines.push(
        `- 指纹来源：${match.origin === "source" ? "插件源码中确认存在的字符串" : "用户在上游 issue 中贴出的真实输出"}`
      );
      if (match.evidence.length > 0) {
        lines.push("");
        lines.push("证据：");
        lines.push("");
        lines.push("```");
        for (const evidence of match.evidence) {
          lines.push(`L${evidence.line} ${safe(evidence.text)}`);
        }
        lines.push("```");
      }
      lines.push("");
      lines.push("怎么修：");
      lines.push("");
      for (const fix of match.fixes) {
        lines.push(`1. ${safe(fix)}`);
      }
      lines.push("");
      if (match.issues.length > 0) {
        const links = match.issues
          .map(
            (issue) =>
              `- ${issue.repo}#${issue.number}（${issue.relation === "direct" ? "直接证据" : "相关讨论"}）：${issue.url}`
          )
          .join("\n");
        lines.push("上游 issue：");
        lines.push("");
        lines.push(links);
        lines.push("");
      }
    }
  }

  if (collection) {
    const empty = collection.sources.filter((s) => s.found === 0);
    if (empty.length > 0) {
      lines.push("## 没采到日志的来源");
      lines.push("");
      lines.push("| 来源 | 怎么才能采到 |");
      lines.push("| --- | --- |");
      for (const source of empty) {
        lines.push(
          `| ${escapeInline(safe(source.label))} | ${escapeInline(safe(source.hint))} |`
        );
      }
      lines.push("");
    }

    if (collection.errors.length > 0) {
      lines.push("## 采集过程中的问题");
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
    "本报告由 SyncMedic 在本机生成，所有日志内容均已脱敏，可以直接粘贴到公开 issue。"
  );

  return lines.join("\n");
}

export function renderJsonReport(input: ReportInput): string {
  const { analysis } = input;
  const payload = {
    tool: "SyncMedic",
    pluginVersion: input.pluginVersion ?? "0.1.1",
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
