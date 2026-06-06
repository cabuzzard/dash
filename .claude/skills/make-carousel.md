# make-carousel

Generate a full Instagram carousel in Canva, merge all slides into one multi-page design, save the Canva link to the matching drive in Notion, and log everything to Notion SM Posts DB.

## Trigger phrases
"make a carousel", "new carousel", "generate carousel", "next carousel", "carousel about X"

## Inputs
- **topic** — the carousel subject (required). If not given, pick the highest-opportunity calm productivity angle not yet covered.
- **product** — defaults to "Coaching Carousels" product in Notion.

## Style rules (ALWAYS follow)
- 7 slides
- Editorial minimal: warm cream/off-white background, elegant thin serif font, delicate botanical branch accent
- Slide 1: hook headline + italic subtext + slide counter "1/7"
- Slides 2–6: number (01–05) top left, bold headline, 2–3 sentence body, counter
- Slide 7: CTA — centered quote, save/follow prompt, counter "7/7"
- No photography, no faces, no loud colors

## Workflow (execute every step, no skipping)

### Step 1 — Write content
Write all 7 slide scripts before generating any designs. Include:
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
- Merged Canva design link (ready to open and publish)
- Notion drive link
- Caption + hashtags ready to paste

## Notes
- The merged design will always be in the user's Canva account under the title
- If page count is > 7 after merging, warn the user — a source slide had multiple pages
- For future carousels, number them sequentially (Carousel 04, 05, etc.)
- Calm Productivity content angles not yet used: morning routines, deep work, saying no to meetings, single-tasking, digital minimalism, energy management, weekly reviews
