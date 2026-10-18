# Fork isolation

This repository is `bctnry/paseo-pontifex`, a fork of `getpaseo/paseo`. Upstream sync PRs merge
`getpaseo/paseo:main` into this fork.

Treat upstream code as code and upstream infrastructure as not ours. When resolving a sync
conflict, keep an upstream implementation only when it does not point at an upstream account,
project, domain, release, or bot. Never restore an upstream deployment target just because the
upstream side of the conflict contains it.

## Rules

1. Deploy, release, packaging, Docker, Nix, and release-note workflows are manual-only. Do not add
   `push`, tag, or `release` triggers while resolving a conflict. CI runs on pull requests and
   manual dispatch.
2. Deployment identifiers come from repository variables or the repository context, never from a
   literal upstream value.
3. Publishing goes to this fork:
   - Electron: `publish.owner: bctnry`, `publish.repo: paseo-pontifex`.
   - GitHub Releases: `github.repository`, or `--repo bctnry/paseo-pontifex`.
   - Docker: `ghcr.io/<repository owner>/paseo`.
4. Cloudflare deploys use the account from `CLOUDFLARE_ACCOUNT_ID` and worker names prefixed
   `paseo-pontifex-`. Do not add custom-domain routes for `paseo.sh`.
5. EAS uses `EAS_OWNER`, `EAS_PROJECT_ID`, and optional `EAS_SLUG`. Do not restore the upstream
   project ID, owner, App Store ID, or TestFlight group.
6. Nix automation uses `GITHUB_TOKEN` and `github-actions[bot]`, never the upstream bot app.

## Files to check in every sync

| File                                                   | Keep                                                                      |
| ------------------------------------------------------ | ------------------------------------------------------------------------- |
| `.github/workflows/*.yml`                              | Manual-only deploy/release flows; no tag triggers                         |
| `.github/workflows/deploy-*.yml`                       | `vars.CLOUDFLARE_ACCOUNT_ID`; no literal account IDs or `paseo.sh` routes |
| `packages/app/app.config.js`                           | EAS values from `EAS_OWNER`, `EAS_PROJECT_ID`, `EAS_SLUG`                 |
| `packages/app/eas.json`                                | No upstream `ascAppId`                                                    |
| `packages/app/.eas/workflows/*.yml`                    | Manual-only; external TestFlight group `Paseo Pontifex Beta`              |
| `packages/desktop/electron-builder.yml`                | Publish owner `bctnry`, repo `paseo-pontifex`                             |
| `packages/relay/wrangler.toml`                         | No upstream account ID, routes, or relay upstream                         |
| `packages/website/wrangler.toml`                       | No upstream account ID, routes, or KV namespace                           |
| `.github/workflows/nix-update-hash.yml`                | `GITHUB_TOKEN` and `github-actions[bot]`                                  |
| `docs/release.md`, `docs/android.md`, `docs/docker.md` | Manual dispatch instructions and this fork's targets                      |

## Upstream values that must not come back

- Cloudflare account `10ed39a1dbf316e30abd0c409bed40d6`
- Cloudflare KV namespace `cb4d8779806544e9b673142a80c1eb5f`
- Worker names `paseo-relay` and `paseo-website`; Pages project `paseo-app`
- Routes `paseo.sh`, `www.paseo.sh`, `plugins.paseo.sh`, and `relay.paseo.sh`
- EAS project `0e7f65ce-0367-46c8-a238-2b65963d235a`, owner `getpaseo`, and App Store ID `6758887924`
- TestFlight group `Paseo Beta`
- Electron publish target `getpaseo/paseo`
- Relay upstream `https://paseo-relay-next.fly.dev`
- Bot secrets `PASEO_BOT_APP_ID` and `PASEO_BOT_APP_PRIVATE_KEY`

## Repository configuration

Variables:

- `CLOUDFLARE_ACCOUNT_ID` — required by `deploy-app`, `deploy-website`, and `deploy-relay`.
- `CLOUDFLARE_PAGES_PROJECT` — optional; defaults to `paseo-pontifex-app`.
- `PASEO_RELAY_UPSTREAM` — optional relay cutover upstream.
- `EAS_OWNER` and `EAS_PROJECT_ID` — required by `android-apk-release` and the EAS workflows.
- `EAS_SLUG` — optional; defaults to `paseo-pontifex`.

Secrets:

- `CLOUDFLARE_API_TOKEN`
- `EXPO_TOKEN`
- Apple signing secrets for desktop releases
- AI provider keys for the CI tests that use them

If a required variable is unset, the workflow fails at its preflight. That is intentional. Do not
add a fallback to an upstream account.

## Verification

Before finishing a sync resolution, run:

```bash
node --test scripts/ci-workflow.test.mjs
rg -n '10ed39a1|0e7f65ce|6758887924|cb4d8779|paseo-relay-next\.fly\.dev|relay\.paseo\.sh' \
  .github packages/app/app.config.js packages/app/eas.json packages/app/.eas \
  packages/desktop/electron-builder.yml packages/relay/wrangler.toml packages/website/wrangler.toml
```

The grep should return nothing in those paths. Do not push a tag to test a workflow. Dispatch the
specific workflow with the tag input instead.
