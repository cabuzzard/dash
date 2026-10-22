# Hub keyword structure sync

The Keywords card's existing visual structure is snapshotted before migration. `hub:structure:<campaignId>` then stores topics by their original logical IDs (including staged IDs), assignments, the main cluster, main offerings, product topic links, proposals, stack groups and order. Compatible legacy KV projections remain available to existing readers. No model calls are used.

`migrateHubStructure {campaignId}` stores and reads back the original snapshot, then compares the migrated projection with an independently captured card view. `syncHubStructure {campaignId,dryRun:true}` is read-only. The first actual sync seeds **card → Notion**; Notion-only topics are retained archived. Two-way merging starts after that seed. `enableHubStructureSync` requires all registered hubs to have verified snapshots and completed seeds before enabling automatic sync.

Subsequent runs compare each item's values against its previous baseline. If both sides changed, the newer timestamp wins and the other complete value is retained in `sync:conflicts:<campaignId>`. Topic `Main` denotes membership in the card's main cluster. The Campaign's additive `Hub Keyword Structure` property mirrors cluster names/order and stack metadata; topic rows expose Topic Key, Hub Cluster, Main, Status, Card Data and Synced At. Product Topic ID stays on Products; per-hub main offerings are a multi-select. All Notion writes are read back before the baseline advances.

Card structure saves enqueue a non-blocking sync. The existing midnight UTC cron queues every registered hub; the existing four-minute cron retries queued work. An existing-D1 lease serializes card saves and syncs per hub. No new binding or cron is added. A busy save returns an explicit retry error before changing the card.

The card shows the last successful sync, errors, conflicts (with **Use this instead**), archived-topic restoration and the last 30 snapshot entries. `restoreHubStructure {campaignId,snapshotId}` first snapshots current state, restores the selected structure and syncs it. Later-created topics remain archived. Snapshot bodies and the original snapshot are retained; nothing is hard-deleted. Failed runs are held in the existing flow held store with a reason and snapshot reference.

`Hub Placement` and `Placed In Hub` are derived from the existing hierarchy model and written only when changed. These metadata writes do not change statuses or regenerate/publish content. The Information Flow graph and Current Methods worksheet are not changed by this feature.

Placement updates checkpoint every 60 records to stay within Worker request limits. Pending batches stay queued and are visible on the card. Automatic sync cannot be enabled until the initial placement batches finish. Notion sync date fields use minute precision so their readbacks match the platform's stored representation exactly; KV timestamps retain milliseconds.
