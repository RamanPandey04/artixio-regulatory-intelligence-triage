# AI review log

## Decision / Suggestion
Initially, database scripts called Prisma from the `packages/db` workspace and assumed it would read the repository root `.env`.

## Why it was questionable
Prisma could not find `DATABASE_URL` when invoked in that workspace, so a fresh developer could not create or apply migrations using the documented root setup.

## Final correction
Root database scripts now load `.env` explicitly with `dotenv-cli` before invoking Prisma. The README uses those scripts for migration creation and seeding.

## Decision / Suggestion
The first Compose configuration published PostgreSQL on host port 5432.

## Why it was questionable
This machine already had a local PostgreSQL server on 5432. Docker reported a healthy container, but Prisma reached the other server and rejected the seed credentials.

## Final correction
The project now uses host port 5433 in Compose and `.env.example`, and the README documents it.

## Decision / Suggestion
The first API server default used port 3001 without checking the local environment.

## Why it was questionable
Another process already occupied port 3001, so `pnpm dev:api` failed during the live smoke test even though the API tests passed.

## Final correction
The API now defaults to port 3101, with `PORT` available for overrides; `.env.example` and README use the same port.

## Decision / Suggestion
The first frontend setup placed Vitest options in `vite.config.ts` and used Vitest's `defineConfig` alongside a Vite 6 React plugin.

## Why it was questionable
The installed Vitest config types resolved Vite 7 while the app plugin resolved Vite 6, so TypeScript rejected the plugin and the production build stopped before compilation.

## Final correction
The Vite build config and Vitest test config are separate. Each uses its own matching config types, and both are included in typecheck.

## Decision / Suggestion
The first authority filter sent the typed value directly to the API after a debounce.

## Why it was questionable
A trailing space would fail the API's authority-code validation and show a list error during ordinary typing.

## Final correction
The UI trims search and authority input before requesting results, while leaving the visible input under the user's control.

## Decision / Suggestion
The list kept previous table rows visible while a new filter request loaded, but left those rows interactive.

## Why it was questionable
Browser QA showed that a user could select a filter and then open a directive from the previous result before the new response arrived. The open directive did not belong to the selected filter.

## Final correction
Placeholder rows remain visible during refetching but cannot open the detail drawer until the matching response arrives. A focused frontend test covers that interval.

## Decision / Suggestion
The simulated seed encoded `2025` in every reference and used a labeling title for a malformed-text record whose action concerned supplier traceability.

## Why it was questionable
Half the feed has 2026 publication dates, so those references contradicted the dates. The mismatched title also made the source record confusing to review.

## Final correction
References now use the publication year. The malformed title and summary still contain deliberate control characters and extra whitespace, but match the action subject.
