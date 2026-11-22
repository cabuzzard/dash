# Strategy gap recommendations — 2026-10-18

These extend the supplied strategy briefs. The original research transcript was not available: these are recommendations based on the supplied material, current primary-source guidance, and the hubs' existing positioning. Prices and demand remain unvalidated hypotheses.

| Hub | Gap filled |
|---|---|
| Build Watcher | Fixed-scope bid and scope analysis, priority 3 |
| AI Implementation | Fixed-scope workflow audit, priority 3 |
| Home Services | Remote maintenance planning report, priority 3; explicitly not an inspection |
| Mountainwize | Decision workbook or mini-course, priority 3 |
| Sunflower Acres | Accessible gardening workshop, priority 3 |
| Creative Flow Guitar | Personal performance feedback, priority 3 |
| Surf Vacations | Retain charter referrals and custom planning; no third offer forced |
| Sustainable Aquarium | Retain consulting and affiliate/guides; no third offer forced |
| The Care Gap | Fill existing fundraising, retirement-community and caregiver-support rows with funder/partner/sponsor-supported pilots, priorities 1–3 |
| Multifamily Acquisitions | Fill existing deal-finder and acquisition-niche research/content ideas; add fixed-fee acquisition screening, priorities 1–3 |

Existing populated cells, including user-entered initiative names and content notes, remain unchanged. Existing raw brainstorm rows stay in place. The limit is up to three developed recommendations per hub, not deletion of legacy rows. Care Gap's education stays free to caregivers, funded by organizations. Multifamily offers are fixed-scope research/content services, not transaction-contingent commissions or investment recommendations.

## Basis and limits

- [SBA: validate a business idea with prospective customers](https://www.sba.gov/blog/2017/2017-04/startup-business-ideas-4-steps-identify-right-one/). Supports the approach of a sample deliverable and customer interviews; does not validate these niches or prices.
- [University of Minnesota Extension: agritourism](https://extension.umn.edu/agriculture/farm-operations-and-systems/agritourism). Supports considering farm experiences as a diversification route; a paid accessible workshop is our proposed application.
- [Family Caregiver Alliance: professional training](https://www.caregiver.org/professional-resources/professional-tools/professional-training/). Provides a basis for working with qualified caregiver educators; does not establish sponsor willingness to pay.
- [Candid: finding nonprofit grants](https://learning.candid.org/finding-grants/272047). Supports aligned-funder research; does not establish eligibility or likely awards for this foundation.
- [SEC: broker-dealer registration guide](https://www.sec.gov/about/divisions-offices/division-trading-markets/division-trading-markets-compliance-guides/guide-broker-dealer-registration). Context for avoiding a speculative securities-finder commission model; no legal conclusion about this user's activities is made.

## Operation

`scripts/complete-hub-strategies.py` defaults to a dry run; `--apply` writes the eight affected existing KV free-form tables. It adds stable-ID rows only when absent, fills only blank cells in explicitly identified matching rows, checks for intervening edits, and backs up the full before/expected-after records under `_scratch/strategy-gaps-*`. No app code, UI, schema or new storage system is introduced. The original updater remains a separate historical operation and should not be used to seed these additional hubs.


## Full hub registry correction

A subsequent audit of the actual published Dash source and `hub:sites:extra` found **12** hubs, including Construction Project Management and Medicare Services Consulting. The original ten-hub audit missed these dynamic registrations.

- Construction Project Management: filled the existing consulting row with a contractor project-controls setup offer (priority 1), and the existing tools row with paid scheduling/cost-control templates (priority 2). No overlapping owner-representation initiative was added.
- Medicare Services Consulting: filled the existing care-strategies row with non-clinical care organization (priority 1), filled the consulting row with organization-funded general education (priority 2), and added a planning toolkit (priority 3). Existing text remains unchanged. These are planning hypotheses, not plan-selling or clinical-service claims.

Sources checked: [Medicare: free personalized SHIP counseling](https://www.medicare.gov/basics/your-medicare-rights/get-help-with-your-rights-and-protections) and [CMS: agent/broker licensing and training](https://www.cms.gov/medicare/health-drug-plans/managed-care-marketing/medicare-marketing-guidelines/agent-broker-compensation). The proposed educational/planning offers are our recommendations; these sources do not validate prices or customer demand.

Only the two missed existing KV tables changed in the correction. A read-back audit enumerates the published built-in registry plus the dynamic registry rather than relying on a fixed count. The rendered page could not be inspected because the computer-use session had no connected browser; this was a published-source and persisted-data audit.
