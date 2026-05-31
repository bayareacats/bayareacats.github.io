# bayareacats

bundle exec jekyll serve --incremental

## Updating the adoption count

The Donate page reads the public adoption number from `_data/impact.yml`.
Update it from Shelterluv before building or deploying:

```sh
SHELTERLUV_API_KEY="your-api-key" node scripts/update-adoption-count.mjs
```

Optional settings:

- `SHELTERLUV_ADOPTION_COUNT_OFFSET`: add earlier adoptions that are not in Shelterluv.
- `SHELTERLUV_SPECIES`: defaults to `Cat`.
- `SHELTERLUV_API_KEY_HEADER`: defaults to `X-API-Key`.
- `SHELTERLUV_API_KEY_QUERY_PARAM`: use only if Shelterluv tells you the key belongs in a query string.
- `SHELTERLUV_FIXTURE`: path to a local JSON response for testing without calling the API.

Do not put the Shelterluv API key in browser JavaScript or commit it to this repo.

The GitHub Actions workflow in `.github/workflows/update-adoption-count.yml`
runs this automatically once the repository has a `SHELTERLUV_API_KEY` secret.
If needed, set `SHELTERLUV_ADOPTION_COUNT_OFFSET` as a repository variable for
adoptions that happened before Shelterluv tracking.
