"""Port microsite-index.html updates to all deployed microsites."""
import re, os

BASE = r"C:\Users\18318\dash\microsites"
TEMPLATE = os.path.join(BASE, "microsite-index.html")

# Also keep microsite-template.html in sync
TEMPLATE_COPY = os.path.join(BASE, "microsite-template.html")

DEPLOYED = [
    "analog-vs-digital-mindset",
    "estate-divorce-property-resource",
    "foreclosure-fraud",
    "human-ai",
    "main-notion-ai-content-management",
    "mobility-mentor-fundraising",
    "mobility-mentor-services",
    "taoist-wanderings",
    "trail-notes",
]

with open(TEMPLATE, encoding="utf-8") as f:
    master = f.read()

# Update microsite-template.html to match
with open(TEMPLATE_COPY, "w", encoding="utf-8") as f:
    f.write(master)
print(f"Updated microsite-template.html")

# Regex to find the 4 JS constants block in the template
CONST_PAT = re.compile(
    r'(const WORKER_URL\s*=\s*"[^"]*";\s*\n'
    r'const CAMPAIGN_ID\s*=\s*"[^"]*"[^\n]*\n'
    r'const RESEARCH_ID\s*=\s*"[^"]*"[^\n]*\n'
    r'const SITE_URL\s*=\s*"[^"]*"[^\n]*)',
    re.MULTILINE
)

# Regex to find the Notion links line in the template
NOTION_PAT = re.compile(
    r'(<a href="https://www\.notion\.so/[^"]*"[^>]*>↗ Campaign</a>[^<]*<a href="https://www\.notion\.so/[^"]*"[^>]*>↗ Research</a>)'
)

for deploy_path in DEPLOYED:
    target = os.path.join(BASE, deploy_path, "index.html")
    if not os.path.exists(target):
        print(f"SKIP (not found): {deploy_path}")
        continue

    with open(target, encoding="utf-8") as f:
        old = f.read()

    # Extract unique JS constants from existing microsite
    m_const = CONST_PAT.search(old)
    if not m_const:
        print(f"SKIP (no constants found): {deploy_path}")
        continue
    unique_consts = m_const.group(1)

    # Extract unique Notion links from existing microsite
    m_notion = NOTION_PAT.search(old)
    unique_notion = m_notion.group(1) if m_notion else None

    # Start from master, replace template constants with this microsite's constants
    updated = CONST_PAT.sub(unique_consts, master, count=1)

    # Replace Notion links if found
    if unique_notion:
        updated = NOTION_PAT.sub(unique_notion, updated, count=1)

    with open(target, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"Updated: {deploy_path}")

print("Done.")
