/**
 * The diagnostics pipeline: collect -> redact -> match -> report.
 *
 * Redaction happens BEFORE matching on purpose: the rule signatures are
 * written against the raw strings, but they only need the surrounding
 * structure, never the secret itself. The result is that the evidence lines
 * in the report are safe to paste into a public issue.
 */

import { collectLogs, type CollectionResult, type VaultAdapter } from "./logs.ts";
import { redactText, type RedactionHit } from "./redact.ts";
import { analyzeDocuments, type AnalysisDocument, type AnalysisResult } from "./rules.ts";
import {
  renderJsonReport,
  renderMarkdownReport,
  renderSummary,
} from "./report.ts";
import {
  DEFAULT_SETTINGS,
  PLUGIN_VERSION,
  normalizeSettings,
  type SyncMedicSettings,
} from "./settings.ts";

export interface RunInput {
  adapter: VaultAdapter;
  /** Console output pasted by the user. */
  pasted?: string;
  settings?: Partial<SyncMedicSettings>;
  pluginVersion?: string;
  vaultName?: string;
  generatedAt?: string;
}

export interface RunOutput {
  analysis: AnalysisResult;
  collection: CollectionResult;
  redactions: { total: number; hits: RedactionHit[] };
  markdown: string;
  json: string;
  summary: string;
}

export async function runDiagnostics(input: RunInput): Promise<RunOutput> {
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    ...(input.settings ?? {}),
  });

  const collection = await collectLogs(input.adapter, {
    maxBytesPerFile: settings.maxBytesPerFile,
    maxFiles: settings.maxFiles,
    pasted: input.pasted,
  });

  // Redact every document before it reaches the rules engine.
  const hitCounts = new Map<string, number>();
  let redactionTotal = 0;
  const documents: AnalysisDocument[] = [];

  for (const document of collection.documents) {
    const redacted = redactText(document.text);
    redactionTotal += redacted.total;
    for (const hit of redacted.hits) {
      hitCounts.set(hit.category, (hitCounts.get(hit.category) ?? 0) + hit.count);
    }
    documents.push({
      pluginId: document.pluginId,
      path: document.path,
      text: redacted.text,
    });
  }

  const hits: RedactionHit[] = [];
  for (const [category, count] of hitCounts) {
    hits.push({ category: category as RedactionHit["category"], count });
  }
  const redactions = { total: redactionTotal, hits };

  const analysis = analyzeDocuments(documents);

  const reportInput = {
    analysis,
    collection,
    redactions,
    pluginVersion: input.pluginVersion ?? PLUGIN_VERSION,
    vaultName: input.vaultName,
    generatedAt: input.generatedAt,
  };

  return {
    analysis,
    collection,
    redactions,
    markdown: renderMarkdownReport(reportInput),
    json: renderJsonReport(reportInput),
    summary: renderSummary(reportInput),
  };
}
