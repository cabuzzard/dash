"""Stamp the canonical microsite-index.html template into every microsites/*/index.html,
preserving each site's 4 JS constants and 2 Notion links."""
import re, os

DASH = r"C:\Users\flipo\repo\dash"
TEMPLATE_PATH = os.path.join(DASH, "microsites", "microsite-index.html")

with open(TEMPLATE_PATH, 'r', encoding='utf-8') as f:
    template = f.read()

def get_vals(content):
    def g(pattern):
        m = re.search(pattern, content)
        return m.group(1) if m else None
    return {
        'campaign_id': g(r'const CAMPAIGN_ID\s*=\s*"([^"]+)"'),
        'research_id': g(r'const RESEARCH_ID\s*=\s*"([^"]+)"'),
        'site_url':    g(r'const SITE_URL\s*=\s*"([^"]+)"'),
        'notion_camp': g(r'href="https://www\.notion\.so/([^"]+)"[^>]*>↗ Campaign'),
        'notion_res':  g(r'href="https://www\.notion\.so/([^"]+)"[^>]*>↗ Research'),
    }

def apply_template(tpl_content, site):
    c = tpl_content
    c = re.sub(r'(const CAMPAIGN_ID\s*=\s*")[^"]+(")',
               lambda m: m.group(1) + site['campaign_id'] + m.group(2), c)
    c = re.sub(r'(const RESEARCH_ID\s*=\s*")[^"]+(")',
               lambda m: m.group(1) + site['research_id'] + m.group(2), c)
    c = re.sub(r'(const SITE_URL\s*=\s*")[^"]+(")',
               lambda m: m.group(1) + site['site_url'] + m.group(2), c)
    c = re.sub(r'(href="https://www\.notion\.so/)[^"]+("[^>]*>↗ Campaign)',
               lambda m: m.group(1) + site['notion_camp'] + m.group(2), c)
    c = re.sub(r'(href="https://www\.notion\.so/)[^"]+("[^>]*>↗ Research)',
               lambda m: m.group(1) + site['notion_res'] + m.group(2), c)
    return c

microsites_dir = os.path.join(DASH, "microsites")

for name in sorted(os.listdir(microsites_dir)):
    path = os.path.join(microsites_dir, name, "index.html")
    if not os.path.isfile(path):
        continue
    with open(path, 'r', encoding='utf-8') as f:
        existing = f.read()
    site = get_vals(existing)
    missing = [k for k, v in site.items() if not v]
    if missing:
        print(f"SKIP  {name}: missing {missing}")
        continue
    new_content = apply_template(template, site)
    with open(path, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"OK    {name}  campaign={site['campaign_id'][:8]}…")

print("Done.")
