#!/usr/bin/env python3
"""
Sync all product sites from the operator-resilience-intensive template.
Preserves each site's PRODUCT_ID, RESEARCH_ID, SITE_URL, and Notion links.
Run from: C:/Users/flipo/repo/dash/productsites/
"""

import os
import re

TEMPLATE = "operator-resilience-intensive/index.html"
SKIP = {"operator-resilience-intensive"}  # template itself

# Notion IDs used in the template — not valid for other product sites
TEMPLATE_NOTION_IDS = {
    "38f1f7d3a4bb81158d9cd0ec1364951b",  # operator-resilience-intensive product page
    "3911f7d3a4bb81cfa636f3309e6475f1",  # operator-resilience-intensive research page
}


def extract(html, name):
    """Extract the unique constants from an existing product site."""
    product_id  = re.search(r'const PRODUCT_ID\s*=\s*"([^"]*)"', html)
    research_id = re.search(r'const RESEARCH_ID\s*=\s*"([^"]*)"', html)
    site_url    = re.search(r'const SITE_URL\s*=\s*"([^"]*)"', html)

    # Notion links — expect 2 (Product + Research)
    notion_links = re.findall(
        r'<a href="(https://www\.notion\.so/[^"]+)"[^>]*class="notion-link">↗ (\w+)</a>',
        html
    )

    if not (product_id and site_url):
        raise ValueError(f"Could not extract constants from {name}")

    pid = product_id.group(1)
    rid = research_id.group(1) if research_id else ""

    # Replace stale template Notion IDs with the site's own IDs
    clean_links = []
    for href, label in notion_links:
        notion_id = href.replace("https://www.notion.so/", "")
        if notion_id in TEMPLATE_NOTION_IDS:
            if label.lower() in ("product", "campaign"):
                clean_links.append((f"https://www.notion.so/{pid}", "Product"))
            elif rid:
                clean_links.append((f"https://www.notion.so/{rid}", "Research"))
        else:
            clean_links.append((href, label))

    return {
        "PRODUCT_ID":  pid,
        "RESEARCH_ID": rid,
        "SITE_URL":    site_url.group(1),
        "notion_links": clean_links,
    }


def apply(template, vals, name):
    """Substitute the site-specific values into the template."""
    result = template

    result = re.sub(
        r'const PRODUCT_ID\s*=\s*"[^"]*";[^\n]*',
        f'const PRODUCT_ID  = "{vals["PRODUCT_ID"]}"; // {name}',
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

    # Replace Notion links block (first occurrence only)
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
        for n, err in errors:
            print(f"  {n}: {err}")


if __name__ == "__main__":
    main()
