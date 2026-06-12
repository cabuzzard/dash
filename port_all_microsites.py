import re

with open('C:/Users/18318/dash/microsites/microsite-index.html', 'r', encoding='utf-8') as f:
    template = f.read()

sites = [
    {'path': 'ai-lead-gen-local-services',          'cid': '34f1f7d3a4bb81c2be96c022bdd1ef40', 'rid': '36d1f7d3a4bb81ab8dbbcfdfff7428e3',  'url': 'https://cabuzzard.github.io/dash/microsites/ai-lead-gen-local-services/'},
    {'path': 'analog-vs-digital-mindset',            'cid': '3671f7d3a4bb815280ccdbdb76166f2a', 'rid': '3671f7d3a4bb813fa601c8518bc44c94',  'url': 'https://cabuzzard.github.io/dash/microsites/analog-vs-digital-mindset/'},
    {'path': 'estate-divorce-property-resource',     'cid': '3691f7d3a4bb81de93d9fa2f0607deb7', 'rid': '3691f7d3a4bb8150b543f42f77c7ce3a',  'url': 'https://cabuzzard.github.io/dash/microsites/estate-divorce-property-resource/'},
    {'path': 'foreclosure-fraud',                    'cid': '3681f7d3a4bb8195a655d6f022e257f1', 'rid': '3681f7d3a4bb81e29542e24d178a3ad1',  'url': 'https://cabuzzard.github.io/dash/microsites/foreclosure-fraud/'},
    {'path': 'human-ai',                             'cid': '3641f7d3a4bb8193898fc59d690851d4', 'rid': '3661f7d3a4bb81adaaadc2ce80784112',  'url': 'https://cabuzzard.github.io/dash/microsites/human-ai/'},
    {'path': 'lead-gen-small-business',              'cid': '3721f7d3a4bb813ebc1de7576df0ca0a', 'rid': '3721f7d3a4bb8101a3cce42f55bfbec1',  'url': 'https://cabuzzard.github.io/dash/microsites/lead-gen-small-business/'},
    {'path': 'main-notion-ai-content-management',    'cid': '3611f7d3a4bb81fe9ebcfe01813d9ac2', 'rid': '3661f7d3a4bb81adaaadc2ce80784112',  'url': 'https://cabuzzard.github.io/dash/microsites/main-notion-ai-content-management/'},
    {'path': 'mobility-mentor-fundraising',          'cid': '34b1f7d3a4bb81b6a8a8fee04df94807', 'rid': '34b1f7d3a4bb8109a2e8ea8d82a4a8d3',  'url': 'https://cabuzzard.github.io/dash/microsites/mobility-mentor-fundraising/'},
    {'path': 'mobility-mentor-services',             'cid': '35c1f7d3a4bb8121987be776faf38344', 'rid': '3661f7d3a4bb81adaaadc2ce80784112',  'url': 'https://cabuzzard.github.io/dash/microsites/mobility-mentor-services/'},
    {'path': 'taoist-wanderings',                    'cid': '3581f7d3a4bb80c9b25efceb41a079b4', 'rid': '3661f7d3a4bb81adaaadc2ce80784112',  'url': 'https://cabuzzard.github.io/dash/microsites/taoist-wanderings/'},
    {'path': 'trail-notes',                          'cid': '3491f7d3a4bb8181b9a2cd5dc7bdf21a', 'rid': '3661f7d3a4bb81adaaadc2ce80784112',  'url': 'https://cabuzzard.github.io/dash/microsites/trail-notes/'},
]

for s in sites:
    out = template
    out = re.sub(r'(const CAMPAIGN_ID\s*=\s*")[^"]+(";\s*//.+)',  lambda m: m.group(1) + s['cid'] + '"; // ' + s['path'], out)
    out = re.sub(r'(const RESEARCH_ID\s*=\s*")[^"]+(";\s*//.+)',  lambda m: m.group(1) + s['rid'] + '"; // research', out)
    out = re.sub(r'(const SITE_URL\s*=\s*")[^"]+(";\s*)',          lambda m: m.group(1) + s['url'] + '";\n', out)
    out = re.sub(
        r'(<a href="https://www\.notion\.so/)[^"]+(".+?Campaign</a> &nbsp; <a href="https://www\.notion\.so/)[^"]+(".+?Research</a>)',
        lambda m: m.group(1) + s['cid'] + m.group(2) + s['rid'] + m.group(3),
        out
    )
    dest = 'C:/Users/18318/dash/microsites/' + s['path'] + '/index.html'
    with open(dest, 'w', encoding='utf-8') as f:
        f.write(out)
    print('Written: ' + dest)

print('All done.')
