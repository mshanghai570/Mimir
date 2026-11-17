# Mimir Hardening and Slimming Implementation Plan

**Goal:** Reduce real security and maintenance risk without removing current prototype features.

**Architecture:** Keep the local companion server localhost-only by default. Require an explicit access token for non-loopback binding. Make the exporter read the canonical plugin package instead of maintaining a second Python copy. Keep simulated Frida behavior, but label it visibly.

**Tech Stack:** TypeScript, Express, React/Vite, Python Binary Ninja plugin, existing unittest suite.

**Spec:** Approved audit findings from the 2026-11-17 repository review.

## Global Constraints

- Preserve current Binary Ninja plugin behavior and package layout.
- Preserve prototype web dashboard behavior.
- Do not claim live Frida or Binary Ninja 6.0.10601 support.
- Do not add dependencies for small helpers.
- Keep default server endpoint `http://localhost:3000/api`.

## Review Focus

- Default server exposure: bind only to loopback.
- LAN opt-in: refuse non-loopback binding without an access token.
- Patch failures: return an error and avoid leaving an open undo transaction.
- Export drift: exported Python must match `plugin/mimir_plugin/mimir_binja.py`.
- Simulation honesty: every Frida device/session response must say simulation.
- Slimming: remove only unused images/dependencies; retain visible features.

## Tasks

- [ ] Add host/token guard and API auth middleware in `server.ts`.
- [ ] Add safe patch-write exception handling in the canonical plugin and exporter output path.
- [ ] Replace embedded Python exporter source with canonical-file reads and endpoint substitution.
- [ ] Mark simulated Frida UI/routes clearly.
- [ ] Remove unused graph image and unused `motion` dependency.
- [ ] Add regression assertions for security/exporter behavior.
- [ ] Run tests, build, plugin compilation, export check, and diff review.
