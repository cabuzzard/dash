# make-carousel

Research what's trending on the topic, write original carousel copy inspired by it, generate a full Instagram carousel in Canva, merge all slides into one multi-page design, save the Canva link to the matching drive in Notion, and log everything to Notion SM Posts DB.

**Growth alignment:** carousels are the authority/save engine — read the "carousel" method's "Growth Strategy (2026)" section and the master [📈 Account Growth OS](https://app.notion.com/p/39a1f7d3a4bb818a8653e60a1b6cf6f7). Engineer every carousel for **saves + shares** (weighted 3–5× a like): slide 1 = ~80% of the weight (open a gap in <10 words, "is this for me? / what do I get?"), 6–10 slides, campaign keywords in the on-screen text of the slides + caption for SEO, and a last slide that's a saveable recap + a `save this` / `send this to…` / `comment [KEYWORD]` CTA.

## Trigger phrases
"make a carousel", "new carousel", "generate carousel", "next carousel", "carousel about X", "research and make a carousel about X"

## Inputs
- **topic / keywords** — the carousel subject (required-ish). If not given, pick the highest-opportunity calm productivity angle not yet covered (see list at bottom).
- **product** — defaults to "Coaching Carousels" product in Notion.
- **campaign** (optional) — if the user names a specific microsite/campaign, check its Research DB entry in Notion for existing "TikTok Trends" / "Trend Intelligence" fields before doing a fresh web search — reuse that data if it's recent.

## Style rules (ALWAYS follow)
- 7 slides
- Editorial minimal: warm cream/off-white background, elegant thin serif font, delicate botanical branch accent
- Slide 1: hook headline + italic subtext + slide counter "1/7"
- Slides 2–6: number (01–05) top left, bold headline, 2–3 sentence body, counter
- Slide 7: CTA — centered quote, save/follow prompt, counter "7/7"
- No photography, no faces, no loud colors

## Workflow (execute every step, no skipping)

### Step 0 — Research trending content
- If a campaign was named, first check Notion Research DB (collection lookup by Campaign relation) for a "TikTok Trends" / "Trend Intelligence" field. If present and recent, use it as your primary source and skip live search.
- Otherwise, use WebSearch to find what's currently resonating on the topic — queries like `"<topic>" tiktok trending`, `"<topic>" instagram carousel viral`, `"<topic>" reels hook`, `"<topic>" short form video ideas`.
- Pull 5–8 real top-performing posts. Note each one's **hook style, angle, and structure only** — not verbatim wording. This is inspiration, not source material.
- Pick the single most resonant angle for this carousel given what's trending right now.

### Step 1 — Write content (rewritten, never copied)
Use the researched hooks/angles to shape structure and pacing, but every word must be original — do not lift phrasing from the source posts. Write all 7 slide scripts before generating any designs. Include:
- Hook headline (slide 1)
- 5 insight headlines + body copy (slides 2–6)
- CTA quote + call to action (slide 7)
- Instagram caption (150–200 words)
- 10 hashtags

### Step 2 — Generate slides in parallel
Call `generate-design` (design_type: instagram_post) for all 7 slides simultaneously.
Pick the best candidate from each (prefer clean botanical, minimal cream).
Call `create-design-from-candidate` to save all 7.

### Step 3 — Merge into one design (ALWAYS do this)
- Call `merge-designs` type: create_new_design with slide 1
- Then call `merge-designs` type: modify_existing_design to insert slides 2–7 one at a time
- Result: one multi-page Canva design ready to publish as a carousel
- Save the merged design's edit_url as the canva link

### Step 4 — Create drive in Notion
Call `notion-create-pages` on the Drives DB (collection://3751f7d3-a4bb-80c1-b4f6-000b4decf331):
- Name: "Carousel NN — [Topic]"
- product: link to Coaching Carousels product page
- canva link: the merged design edit_url
- Page content: all 7 Canva slide edit links, caption, hashtags

### Step 5 — Update drive canva link via worker
Call `updateDrive` with the drive ID and canvaLink so it appears in the Products tab.

### Step 6 — Log to SM Posts DB
Call `notion-create-pages` on SM Posts DB (collection://ec422a5d-7161-42e6-843f-39a09893737b):
- Post Title: carousel title
- Status: Draft
- Platform: Instagram
- Caption: generated caption
- Hashtags: generated hashtags
- Page content: merged Canva design link + all individual slide links

### Step 7 — Report back
Confirm:
- Which trending posts/angles inspired this carousel (topic + why it's timely right now)
- Merged Canva design link (ready to open and publish)
- Notion drive link
- Caption + hashtags ready to paste
- Reminder that posting to Instagram is a manual step (see Notes) — status is set to Draft, not published

## Notes
- **No auto-posting exists in this repo.** There is no Instagram/Meta Graph API integration wired up here — "posted" means: download/export the merged design from Canva, then post it manually from the Instagram app using the generated caption + hashtags. Always say this explicitly at the end so it's never assumed to be automatic.
- Canva MCP tools (`generate-design`, `create-design-from-candidate`, `merge-designs`) must be connected in the session for Steps 2–3. If they're not available, stop and tell the user to connect the Canva connector first rather than improvising a substitute.
- The merged design will always be in the user's Canva account under the title
- If page count is > 7 after merging, warn the user — a source slide had multiple pages
- For future carousels, number them sequentially (Carousel 04, 05, etc.)
- Calm Productivity content angles not yet used: morning routines, deep work, saying no to meetings, single-tasking, digital minimalism, energy management, weekly reviews
