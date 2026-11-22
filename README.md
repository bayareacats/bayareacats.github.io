# bayareacats

bundle exec jekyll serve --incremental

## Airtable impact stats

Impact numbers and charts on the homepage are generated from Airtable, then rendered statically by Jekyll from `_data/impact_stats.json`.

- The headline stats use the Airtable `Analysis` interface dashboard elements.
- The yearly stacked chart is grouped from Cats table fields `Appt/Trap Year` and `Cat Type`.
- The spay/neuter page's weekly total sums `Cats (Count)` for Airtable appointments marked `Scheduled` or `Completed` that include the `Spay / Neuter` service during the most recently completed Sunday–Saturday week in Pacific time. The scheduled workflow refreshes it every Sunday.
- The adoption count comes from Shelterluv events, counting animals whose latest event is `Outcome.Adoption`.

To update locally:

```sh
AIRTABLE_TOKEN=pat_xxx SHELTERLUV_API_KEY=key_xxx node scripts/update-impact-stats.mjs
```

By default the script runs `npx -y @airtable/mcp-cli`. If you already have the CLI installed, you can use it directly:

```sh
AIRTABLE_TOKEN=pat_xxx SHELTERLUV_API_KEY=key_xxx AIRTABLE_MCP_BIN=airtable-mcp node scripts/update-impact-stats.mjs
```

In GitHub, add `AIRTABLE_TOKEN` and `SHELTERLUV_API_KEY` repository secrets. The `Update impact stats` workflow can be run manually and is also scheduled daily.

## Wishlist Angel Tree

`/angel-tree` shows adoptable cats as ornaments on a drawn tree. Clicking one opens the cat's full photo and one wish from `_data/angel_tree_gifts.yml` (cats cycle through that list), with a button to that wishlist. Add or remove wishes there to match the Chewy and Amazon lists.

A small floating tree in the bottom right of every page links to the angel tree. Visitors can close it (it stays closed for 3 days). Turn it off site-wide with `angel_tree_helper: false` in `_config.yml`.

Ornaments come from `_data/angel_tree.json`, built from Shelterluv's publishable animals: the 8 longest residents with photos, by earliest intake date (set `ANGEL_TREE_COUNT` to change how many):

```sh
SHELTERLUV_API_KEY=key_xxx node scripts/update-angel-tree.mjs
```

The `Update angel tree` workflow refreshes the ornaments every morning and can be run manually from the Actions tab.
