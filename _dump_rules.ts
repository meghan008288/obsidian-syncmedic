import { RULES } from "./src/rules.ts";
for (const r of RULES) {
  console.log(`### ${r.id}  origin=${r.origin}  scope=${r.scope}`);
  console.log(`    issues: ${r.issues.map(i => "#" + i.number + "(" + i.relation + ")").join(" ")}`);
  r.groups.forEach((g, gi) => {
    console.log(`    group${gi}:`);
    g.forEach(p => console.log(`      ${p.source}`));
  });
}