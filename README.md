# bayareacats

bundle exec jekyll serve --incremental

## Airtable impact stats

Impact numbers and charts on the homepage are generated from Airtable, then rendered statically by Jekyll from `_data/impact_stats.json`.

- The headline stats use the Airtable `Analysis` interface dashboard elements.
- The yearly stacked chart is grouped from Cats table fields `Appt/Trap Year` and `Cat Type`.
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
