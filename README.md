# bayareacats

bundle exec jekyll serve --incremental

## Airtable impact stats

Impact numbers and charts on the homepage are generated from Airtable, then rendered statically by Jekyll from `_data/impact_stats.json`.

- The headline stats use the Airtable `Analysis` interface dashboard elements.
- The yearly stacked chart is grouped from Cats table fields `Appt/Trap Year` and `Cat Type`.

To update locally:

```sh
AIRTABLE_TOKEN=pat_xxx node scripts/update-impact-stats.mjs
```

By default the script runs `npx -y @airtable/mcp-cli`. If you already have the CLI installed, you can use it directly:

```sh
AIRTABLE_TOKEN=pat_xxx AIRTABLE_MCP_BIN=airtable-mcp node scripts/update-impact-stats.mjs
```

In GitHub, add an `AIRTABLE_TOKEN` repository secret. The `Update impact stats` workflow can be run manually and is also scheduled daily.
