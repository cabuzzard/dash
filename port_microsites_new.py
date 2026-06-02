import re

with open('C:/Users/18318/dash/microsites/microsite-index.html', 'r', encoding='utf-8') as f:
    template = f.read()

sites = [
    {'path': 'foreclosure-fraud',               'cid': '3681f7d3a4bb8195a655d6f022e257f1', 'rid': '3681f7d3a4bb81e29542e24d178a3ad1', 'url': 'https://cabuzzard.github.io/dash/microsites/foreclosure-fraud/'},
    {'path': 'estate-divorce-property-resource', 'cid': '3691f7d3a4bb81de93d9fa2f0607deb7', 'rid': '3691f7d3a4bb8150b543f42f77c7ce3a', 'url': 'https://cabuzzard.github.io/dash/microsites/estate-divorce-property-resource/'},
    {'path': 'lead-gen-small-business',          'cid': '3721f7d3a4bb813ebc1de7576df0ca0a', 'rid': '3721f7d3a4bb8101a3cce42f55bfbec1', 'url': 'https://cabuzzard.github.io/dash/microsites/lead-gen-small-business/'},
    {'path': 'ai-lead-gen-local-services',       'cid': '34f1f7d3a4bb81c2be96c022bdd1ef40', 'rid': '36d1f7d3a4bb81ab8dbbcfdfff7428e3', 'url': 'https://cabuzzard.github.io/dash/microsites/ai-lead-gen-local-services/'},
    {'path': 'small-business-adu-ca',            'cid': '3591f7d3a4bb811a907aeea020352484', 'rid': '3731f7d3a4bb814598eed9735cf331d3', 'url': 'https://cabuzzard.github.io/dash/microsites/small-business-adu-ca/'},
    {'path': 'small-business-re-agent-ca',       'cid': '3731f7d3a4bb816f9d9cd5bffda0549d', 'rid': '3731f7d3a4bb8117b12ddfb70d5a5ced', 'url': 'https://cabuzzard.github.io/dash/microsites/small-business-re-agent-ca/'},
]

for s in sites:
    out = template
    out = re.sub(r'(const CAMPAIGN_ID\s*=\s*")[^"]+(";\s*//.+)', lambda m: m.group(1) + s['cid'] + '"; // ' + s['path'], out)
    out = re.sub(r'(const RESEARCH_ID\s*=\s*")[^"]+(";\s*//.+)', lambda m: m.group(1) + s['rid'] + '"; // research', out)
    out = re.sub(r'(const SITE_URL\s*=\s*")[^"]+(";\s*)',         lambda m: m.group(1) + s['url'] + '";\n', out)
    out = re.sub(
        r'(<a href="https://www\.notion\.so/)[^"]+(".+?Campaign</a> &nbsp; <a href="https://www\.notion\.so/)[^"]+(".+?Research</a>)',
        lambda m: m.group(1) + s['cid'] + m.group(2) + s['rid'] + m.group(3),
        out
    )
    dest = 'C:/Users/18318/dash/microsites/' + s['path'] + '/index.html'
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(out)
    print('Written: ' + dest)

print('Done.')
