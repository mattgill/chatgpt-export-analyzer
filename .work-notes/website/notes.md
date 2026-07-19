# website notes

## Planning workflow preferences

- Execution-readiness review for this project should be performed by a
  **Luna-grade reviewer**. Do not use the lightweight/Haiku-grade default from
  the generic gameplan workflow. If the available agent interface cannot select
  a model grade explicitly, state that limitation and apply the Luna-level bar:
  inspect every referenced path and command, challenge cross-task dependencies,
  and require enough specificity for a fresh Terra coding session.

## 2026-07-19 12:40 EDT — gameplan

**Decisions:**
- Build a static React/TypeScript/Vite app; process ZIP data entirely in a Web
  Worker and deploy under a GitHub Pages-compatible project path.
- Persist one privacy-minimized derived report in IndexedDB; never persist or
  transmit ZIP bytes or message bodies.
- Phase 1 ships the visual report, Phase 2 adds reasoning-overhead controls, and
  downloads remain deferred for follow-up discussion.
- Keep Python as a parity oracle through both phases, then replace it with a
  permanent TypeScript golden test and retire the Python implementation.

**Risks:** Browser memory/CPU at the 100 MiB target, ZIP/parser abuse, export
schema drift, sensitive conversation titles in local persistence, and worker/WASM
asset loading under a GitHub Pages subpath. The plan includes explicit limits,
privacy checks, three-browser tests, and a measured performance gate.

**Sanity check overrides:** none.
