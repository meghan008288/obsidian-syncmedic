import { RULES } from "../src/rules.ts";

const sev = { critical: "严重", warning: "警告", info: "提示" } as const;
const scope = {
  "remotely-save": "Remotely Save",
  "obsidian-livesync": "LiveSync",
  any: "通用",
} as const;

for (const rule of RULES) {
  const issues = rule.issues
    .map((issue) => `[#${issue.number}](https://github.com/${issue.repo}/issues/${issue.number})`)
    .join(" ");
  console.log(
    `| \`${rule.id}\` | ${scope[rule.scope]} | ${sev[rule.severity]} | ${rule.title} | ${
      rule.origin === "source" ? "源码确认" : "issue 原文"
    } | ${issues} |`
  );
}
