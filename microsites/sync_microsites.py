#!/usr/bin/env python3
"""
Sync all microsites from the hard-grind template.
Preserves each site's CAMPAIGN_ID, RESEARCH_ID, SITE_URL, and Notion links.
Run from: C:/Users/flipo/repo/dash/microsites/
"""

import os
import re

TEMPLATE = "hard-grind/index.html"
SKIP = {"hard-grind"}  # template itself

# Notion IDs used in the hard-grind template — these are NOT valid for other sites
TEMPLATE_NOTION_IDS = {
    "3831f7d3a4bb81e1b1dcf6de96bca6d9",  # hard-grind campaign page
    "3831f7d3a4bb8136999ade12595081e9",  # hard-grind research page
}

def extract(html, name):
    """Extract the unique constants from an existing microsite."""
    campaign_id = re.search(r'const CAMPAIGN_ID\s*=\s*"([^"]*)"', html)
    research_id = re.search(r'const RESEARCH_ID\s*=\s*"([^"]*)"', html)
    site_url    = re.search(r'const SITE_URL\s*=\s*"([^"]*)"', html)

    # Notion links — there can be 1 or 2
    notion_links = re.findall(
        r'<a href="(https://www\.notion\.so/[^"]+)"[^>]*class="notion-link">↗ (\w+)</a>',
        html
    )

    if not (campaign_id and site_url):
        raise ValueError(f"Could not extract constants from {name}")

    cid = campaign_id.group(1)
    rid = research_id.group(1) if research_id else ""

    # If the Notion links are the template's placeholder IDs, fall back to
    # CAMPAIGN_ID / RESEARCH_ID so we don't propagate stale hard-grind links.
    clean_links = []
    for href, label in notion_links:
        notion_id = href.replace("https://www.notion.so/", "")
        if notion_id in TEMPLATE_NOTION_IDS:
            # Replace with the site's own ID
            if not clean_links:
                clean_links.append((f"https://www.notion.so/{cid}", "Campaign"))
            elif rid:
                clean_links.append((f"https://www.notion.so/{rid}", "Research"))
        else:
            clean_links.append((href, label))

    return {
        "CAMPAIGN_ID": cid,
        "RESEARCH_ID": rid,
        "SITE_URL":    site_url.group(1),
        "notion_links": clean_links,
    }

def apply(template, vals, name):
    """Substitute the site-specific values into the template."""
    result = template

    # Replace JS constants (comment is cosmetic, keep it clean)
    result = re.sub(
        r'const CAMPAIGN_ID\s*=\s*"[^"]*";[^\n]*',
        f'const CAMPAIGN_ID = "{vals["CAMPAIGN_ID"]}"; // {name}',
        result
    )
    result = re.sub(
        r'const RESEARCH_ID\s*=\s*"[^"]*";[^\n]*',
        f'const RESEARCH_ID = "{vals["RESEARCH_ID"]}"; // research',
        result
    )
    result = re.sub(
        r'const SITE_URL\s*=\s*"[^"]*";',
        f'const SITE_URL    = "{vals["SITE_URL"]}";',
        result
    )

    # Replace Notion links block
    links = vals["notion_links"]
    if links:
        if len(links) == 1:
            new_block = (
                f'<a href="{links[0][0]}" target="_blank" class="notion-link">'
                f'↗ {links[0][1]}</a>'
            )
        else:
            new_block = (
                f'<a href="{links[0][0]}" target="_blank" class="notion-link">'
                f'↗ {links[0][1]}</a>'
                f' &nbsp; '
                f'<a href="{links[1][0]}" target="_blank" class="notion-link">'
                f'↗ {links[1][1]}</a>'
            )
        result = re.sub(
            r'<a href="https://www\.notion\.so/[^"]+" target="_blank" class="notion-link">↗ \w+</a>'
            r'(?:\s*&nbsp;\s*<a href="https://www\.notion\.so/[^"]+" target="_blank" class="notion-link">↗ \w+</a>)?',
            new_block,
            result,
            count=1
        )

    return result

def main():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    template_path = os.path.join(script_dir, TEMPLATE)

    with open(template_path, encoding="utf-8") as f:
        template = f.read()

    updated = []
    errors  = []

    for entry in sorted(os.listdir(script_dir)):
        entry_path = os.path.join(script_dir, entry)
        if not os.path.isdir(entry_path) or entry in SKIP:
            continue
        index_path = os.path.join(entry_path, "index.html")
        if not os.path.exists(index_path):
            continue
        try:
            with open(index_path, encoding="utf-8") as f:
                existing = f.read()
            vals = extract(existing, entry)
            new_html = apply(template, vals, entry)
            if new_html != existing:
                with open(index_path, "w", encoding="utf-8") as f:
                    f.write(new_html)
                updated.append(entry)
                print(f"  updated  {entry}")
            else:
                print(f"  no change {entry}")
        except Exception as e:
            errors.append((entry, str(e)))
            print(f"  ERROR    {entry}: {e}")

    print(f"\nDone. {len(updated)} updated, {len(errors)} errors.")
    if errors:
        for name, err in errors:
            print(f"  {name}: {err}")

if __name__ == "__main__":
    main()
