# dev-fix-pr-ci

## Why

The Pages deployment workflow exercised the browser test suite only after changes had landed on `main`. A deterministic Playwright strict-mode failure in the upload/report fixture therefore surfaced as a failed deployment job rather than stopping the pull request. The test searched for a table cell titled `Browser fixture`, although the fixture intentionally produces two such cells.

## What Was Built

This branch adds a pull-request CI workflow that checks out the proposed change with Node 22, restores the npm cache, installs the locked dependency set, installs Playwright browsers and their system dependencies, runs the repository checks, and runs the browser suite. The workflow has read-only repository permissions and is deliberately separate from the Pages deployment workflow, so validation completes before merge without granting deployment capabilities to pull-request jobs.

The upload/report browser test now records the matching `Browser fixture` cells, verifies that the fixture renders both expected rows, and asserts visibility on the first row. The same assertions run both immediately after processing the uploaded export and after reloading the report, preserving coverage of the local-state restoration path while avoiding Playwright's invalid assumption that the label is unique.

## Key Decisions

The PR workflow uses the existing Node 22 toolchain and the project scripts (`npm run check` and `npm run test:browser`) instead of duplicating their underlying commands. Installing Playwright with `--with-deps` makes the browser job self-contained on a fresh GitHub-hosted runner.

The test does not select a row by an incidental position alone: it first asserts the duplicate count. This documents that duplicate conversation titles are expected fixture behavior, while `.first()` supplies a single target for the visibility check required by Playwright's strict locator semantics.
