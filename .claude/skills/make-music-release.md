# make-music-release

Take one finished song (an original or a licensed cover) and run the full **release** pass:
prep every file and field for a **DistroKid** upload, publish a release post to the campaign's
content hub blog, then hand the post to the hub's own promotion strategy so a promo campaign
(clips / social / email) gets built around it.

**DistroKid has no publishing API.** This skill produces every file + a metadata sheet + the
exact upload click-path; the ~5-minute DistroKid upload itself is manual (same pattern as
`make-kdp-package` with Amazon KDP). Do **not** browser-automate the DistroKid dashboard —
it's against their ToS and risks the account.

This is the production skill for the **"Music Distribution"** Method (Notion Methods DB →
"Music Distribution", id `3c21f7d3a4bb816c9ceef9da960b3c6a`). The method is intentionally
**not attached to a campaign** — it's reusable, though in practice every run so far is the
**Creative Flow Guitar — Weekly Sessions** campaign (`34b1f7d3a4bb8154b0c5e0abcaae272a`,
hub slug `creative-flow-guitar`, `creativeflowguitar.com`).

## Trigger phrases
"make the music release", "release this song", "run make-music-release", "prep the DistroKid
release for <song>", "put <song> out"

## Inputs
- **song** — a Content Strategy song title (e.g. `Old Truck Song`), OR a path to an audio
  file. Required.
- **campaign** — defaults to Creative Flow Guitar; resolved from the song title's `Campaign`
  relation if it has one.
- **type** (optional) — `original` (default) or `cover`. A cover changes the licensing step.
- **release date** (optional) — default = today + 4 weeks (gives DistroKid + stores lead time
  for playlist consideration; minimum sane lead is ~2 weeks).

## Constants
- Content Strategy DB `9fa5f42f010b47e7a82032607e07d6a1` · Campaigns DB
  `087b1163b4e64975bc7a4b686ff801de` · Research DB `557e6b7b8c434a578d45ecb0a8329f63` ·
  Strategy DB `6f7a8666944746b2ae98d41db0c4e419` · Assets DB `e91bdb6e770b4d298e9f62166a0fd5de`
  · Products DB `e92fcfce75fc4f54b553df0b7672ff48` · Growth Strategy DB
  `437b8c2615234b6bbe4a694b31f3000f`.
- Prep-file output folder: `web/music/{slug}/` (`slug` = kebab-case of the song title).
- The hub blog post is written by the existing worker pipeline, not this skill — it lands at
  `web/hub/creative-flow-guitar/blog/{post-slug}/` (see `docs/methods-titles-assets.md`
  § "Blog - SEO - News").
- **Auth:** chat-run skill — do **all** Notion reads/writes through the **Notion connector**,
  no PIN. The two worker actions this skill leans on (`publishSeoPostToLiveSite` via the SEO
  Post branch, and `generateGrowthStrategy`) are triggered by the operator from the microsite,
  or by a PIN'd worker call if `PIN` is on hand — see Steps 4 and 5.

### DistroKid release facts (verify against DistroKid's current upload form at release time)
- **Audio:** upload a **WAV** master (16-bit or 24-bit, 44.1 kHz+). DistroKid accepts MP3 but
  a WAV master is the standard; flag if only an MP3 exists.
- **Cover art:** square, **3000×3000 px** min, RGB JPG/PNG, < 36 MB. **No** URLs, no social
  handles, no store logos, no blurry text — DistroKid rejects those.
- **Metadata:** track title, primary artist / band name (must match the Spotify/Apple artist
  profile you want it on), primary + optional secondary genre, language of the lyrics,
  explicit / clean flag, songwriter legal name(s) + split %, `℗`/`©` year + holder (the
  imprint), label name (imprint). Let DistroKid assign the **ISRC** and **UPC** unless you
  already own one.
- **Cover songs:** DistroKid sells the mechanical license in-flow (~$12 first year, then
  ~$24/yr) for stream/download stores. That license does **not** cover selling the same
  recording yourself on Bandcamp/Fourthwall — that needs a separate mechanical license; leave
  a direct-sale cover off the storefront until that's cleared.
- **Stores:** select all by default. **HyperFollow** pre-save/landing page is generated on
  submit — grab its URL, it's the link every promo post points at until the release is live.

## Workflow (run every step)

Read `.claude/skills/_content-governance.md` first — its research-sourcing + voice bar govern
every piece of written copy below (the release post, the caption seeds).

### Step 0 — Gather the song
- If **song** is a Content Strategy title: read its page — `### Pillar Content` if present,
  plus lyrics / chord sheet / genre / feel / story notes in the body, its `Campaign` and
  `product` relations. If it's a raw audio path: create the Content Strategy title first
  (`Grouping = "Music"`, method relation → Music Distribution), and write a short pillar from
  whatever notes the operator gives.
- Locate the **audio file**. Check `C:\Users\flipo\Downloads\mp3\` and
  `C:\Users\flipo\OneDrive\Documents\Pro Tools\Bounced Files\` first. Confirm a **WAV master**
  exists; if only an MP3 is on hand, note it loudly — the operator should bounce a WAV before
  uploading.
- Read **campaign Research** (Statement / Unique Opportunity / Keywords) and the **product**
  (the "MP3 publishing" product on Creative Flow Guitar) — source for the release-post copy
  and the store blurb.
- Read the **Music Distribution** method page body for any voice/format notes left by a prior
  pass, and the `Alternative Music Distribution Stack` strategy record
  (`3bc1f7d3a4bb81479cfedf7a020fa9fa`) for the stack context.
- **Stop if there's no usable audio.** A release with no master file can't proceed.

### Step 1 — Write the release metadata sheet
Write `web/music/{slug}/distrokid-metadata.md`:
- **Track title / Primary artist / Secondary artist(s) / Primary genre / Secondary genre /
  Language / Explicit flag.**
- **Songwriter(s)** — legal name(s) and split %. Default: 100% to the operator unless told
  otherwise.
- **`℗` & `©`** — `{year} {imprint}`. **Label / imprint name.**
- **Release date** — the computed date; note the lead-time reasoning.
- **Cover vs. original** — if cover: the original songwriter/publisher, and a one-line note
  that the DistroKid cover licence is stream/download only (no self-storefront sale yet).
- **Lyrics** — the full lyrics, plain text, for DistroKid's lyrics field.
- **Store selection / price tier** — all stores; standard price tier.
- **Upload click-path** — the current DistroKid steps: `distrokid.com` → **Upload** → new
  single → the audio tab (upload WAV) → the details tab (paste every field above) → artwork
  tab (upload `cover.png`) → covers/publishing tab (cover licence if applicable) → review →
  submit → **copy the HyperFollow URL**.

### Step 2 — Cover art
- If the operator supplies art, place it at `web/music/{slug}/cover.png` and verify it's
  ≥ 3000×3000 and carries no text/URLs that would fail DistroKid review.
- Otherwise generate a 3000×3000 cover — the ChatGPT-in-Chrome flow in `CLAUDE.md`
  § "ChatGPT image generation", or a Canva design via `create-design-specs` — styled from the
  hub's tokens/fonts (`web/hub/hubs.design.json`, `creative-flow-guitar` entry). Save to
  `web/music/{slug}/cover.png`.

### Step 3 — DistroKid upload (manual — operator does this)
Hand the operator: the metadata sheet path, the cover path, the WAV path, and the click-path.
They upload. When done they give you back the **HyperFollow URL** (and ISRC/UPC if shown).
Record those on the song title's page (a `### Release` section: HyperFollow, ISRC, UPC,
release date, DistroKid submission date).

### Step 4 — Publish the release post to the hub blog
This reuses the existing **`Blog - SEO - News`** SEO-Post pipeline — do **not** build a new
publishing path.
- On the song title (or a dedicated release title if the song title is being kept as the
  creative doc): set `Grouping = "Music"`, attach the **Music Distribution** method, and make
  sure a `### Pillar Content` section holds the **release post** — liner notes / the story of
  the song / what's in the direct-sale bundle / where to hear it (HyperFollow link). Voice per
  `_content-governance.md`: the operator's own broadcaster-who-plays-guitar register, not
  music-PR boilerplate.
- Trigger the SEO-Post branch of `generateTitleAssets` for that title (microsite 🧩 **Generate
  Assets** modal → method `Blog - SEO - News` or Music Distribution with a blog asset type →
  it satisfies the `isSeoPost` test, writes one finished article, creates it at **Publish**,
  flips the title to Publish, and runs `publishSeoPostToLiveSite` → the post lands at
  `web/hub/creative-flow-guitar/blog/{post-slug}/` + `blog/index.html` + `blog/posts.json`,
  which the hub's journal section reads back). Pass the HyperFollow URL + Bandcamp/Fourthwall
  links as `sources` so they render as a linked list.
- If running fully in chat with a `PIN`, this is a `POST` to the worker `generateTitleAssets`
  action; otherwise tell the operator which title to hit 🧩 on.

### Step 5 — Hand off to the hub's promotion strategy
The release post is now a published hub asset. Build the promo campaign **around that post**
using the existing Growth Strategy machinery — don't generate a social pack here.
- Seed a Growth Strategy with the published release post as `seedTitleId`
  (`generateGrowthStrategy`, campaign = Creative Flow Guitar, product = the MP3-publishing
  product). Per `CLAUDE.md` § Growth Strategy, the seed title's own content becomes the primary
  driver, so the strategy + its Strategy Slots come out shaped around this specific release
  (clip angles for Shorts/Reels, X/Reddit conversation hooks, an email beat, a listing-repost
  cadence).
- Operator action: the 🚀 button on the release post's product row in the microsite
  (`generateGrowthStrategy` with the seed). Or a PIN'd worker call. The Slots then fill the
  normal way (`generateTitleFromSlot`, ✍️ Write Pillar) — this skill's job ends at the handoff.
- Published `listing`-type assets also get picked up by `runListingRepostReminders` → Weekly
  Planner automatically; nothing to do for that.

### Step 6 — Save the assets back to Notion
Upsert (via the Notion connector) one Assets DB record per channel, each with `Content
Strategy` → the song/release title:
- **DistroKid** — `Channel = "DistroKid"`, `Asset Type = "listing"`, `Design Link` → the
  cover, `Final Media File` → the WAV/MP3, `Body` → the liner notes, `Notes` → HyperFollow +
  ISRC + UPC. `Asset Status = Development` until the release is live on Spotify, then
  `Published`.
- **Hub blog post** — created by Step 4, nothing to add.
- **Bandcamp** / **Fourthwall** (direct sale) — one `listing` asset each, `Body` → the store
  blurb, `Notes` → the bundle contents ($7 song+instrumental+chords, $12 studio session,
  etc. per the strategy record). `Asset Status = Development` until the operator lists it.

### Step 7 — Report
Give: the slug, the three prep-file paths, the release date + lead-time note, the DistroKid
click-path, a HyperFollow placeholder line for the operator to fill, the hub blog post URL,
and the Growth Strategy handoff instruction (which button, which seed). Remind that the
DistroKid upload and the Bandcamp/Fourthwall listing are manual, and stores take 1-5 business
days after the release date to show the track live.

## Notes
- **One method, one skill.** `digital music recording` (Methods DB) was a redundant stub —
  it's marked `Status: Delete`. Everything release-related is this skill.
- The full operational instructions also live in the **`Alternative Music Distribution Stack`**
  Content Strategy record (`3bc1f7d3a4bb81479cfedf7a020fa9fa`) under "## Operational Workflow"
  — that record is the human-facing home; this file is the executable copy. Keep them in sync
  if the workflow changes.
- Covers: never assume the DistroKid cover licence lets you sell the recording on your own
  storefront. Stream/download stores only until a separate mechanical licence is in hand.
- Re-run after a re-master or new cover art: overwrites the prep files; bump the DistroKid
  asset and re-upload the changed file in DistroKid's "edit release" flow.
