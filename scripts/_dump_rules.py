import re, json
p = r"D:\mini-code\.minimax\sessions\mvs_22ab2ace58da4c4d8e31570b9a16999f\workspace\syncmedic\src\rules.ts"
src = open(p, encoding="utf-8").read()
# pull each rule block
for m in re.finditer(r'\{\s*\n\s*id: "([A-Z]{2}-\d{2})",(.*?)\n  \},\n', src, re.S):
    rid, body = m.group(1), m.group(2)
    groups = re.findall(r'groups: \[(.*?)\],\n', body, re.S)
    origin = re.search(r'origin: "(\w+)"', body)
    g = groups[0] if groups else ""
    pats = re.findall(r'/(.*?)/([a-z]*)', g)
    print("%s  origin=%s" % (rid, origin.group(1) if origin else "?"))
    for pat, flags in pats:
        print("     /%s/%s" % (pat, flags))
