import { RULES } from "../src/rules.ts";

const sev = { critical: "Critical", warning: "Warning", info: "Hint" } as const;
const scope = {
  "remotely-save": "Remotely Save",
  "obsidian-livesync": "LiveSync",
  any: "General",
} as const;

for (const rule of RULES) {
  const issues = rule.issues
    .map((issue) => `[#${issue.number}](https://github.com/${issue.repo}/issues/${issue.number})`)
    .join(" ");
  console.log(
    `| \`${rule.id}\` | ${scope[rule.scope]} | ${sev[rule.severity]} | ${rule.title} | ${
      rule.origin === "source" ? "confirmed in source" : "from an issue"
    } | ${issues} |`
  );
}
