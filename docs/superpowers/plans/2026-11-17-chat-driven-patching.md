# Chat-Driven Patching Implementation Plan

> **For agentic workers:** Implement natively in this session after plan approval.

**Goal:** Make Mimir understand plain-language patch requests, ask for missing patch details, and execute only validated edits at valid Binary Ninja instruction boundaries.

**Architecture:** Keep the existing Binary Ninja plugin and companion backend. Add a deterministic local intent parser for explicit addresses and common patch verbs, with the chat agent used for explanation/analysis rather than silently choosing a patch. Route incomplete patch requests to a clarification dialog. Harden ARM64 reads and writes around instruction length, mapped bytes, patch size, and undo actions.

**Tech Stack:** Python Binary Ninja API, PySide6, existing TypeScript/Express backend, pytest-style pure Python tests where possible.

**Spec:** User report: smart patch must ask what patch to apply; plain-language chat must understand addresses and requested actions; invalid 4-byte reads must produce a useful error; behavior should move toward Rikugan-style conversational reverse-engineering workflows.

## Global Constraints

- Do not silently default a generic “patch” request to return true.
- Never write bytes when the selected address cannot provide the required instruction bytes.
- Preserve Binary Ninja undo support.
- Keep the generated plugin template and standalone plugin behavior identical.
- Do not claim live Frida functionality; current Frida backend remains simulated.

## Review Focus

- “Patch this function at 0x...” without a strategy asks for clarification instead of guessing.
- “Patch 0x... to return false / NOP / invert the branch” selects the requested action.
- Hex addresses with `0x`, uppercase digits, and surrounding punctuation parse correctly.
- Reads shorter than four bytes produce an actionable error and no write.
- ARM64 multi-instruction return patches check that the target range is writable before writing.

---

### Task 1: Intent extraction and clarification UI

**Files:**
- Modify: `plugin/mimir_plugin/mimir_binja.py`
- Modify: `server.ts` generated plugin template

**Interfaces:**
- Add pure helper `parse_patch_request(text: str) -> dict` returning `is_patch`, optional `address`, optional `strategy`, and `needs_clarification`.
- Add a patch clarification dialog that collects strategy and optional address before calling `generate_patch`.

- [ ] Add tests or static fixtures for explicit strategies and incomplete requests.
- [ ] Route chat patch messages through the parser.
- [ ] Show the clarification dialog when strategy/address is missing.
- [ ] Keep ordinary analysis requests on the AI dispatch path.

### Task 2: Safe ARM64 patch execution

**Files:**
- Modify: `plugin/mimir_plugin/mimir_binja.py`
- Modify: `server.ts` generated plugin template

**Interfaces:**
- Harden `synthesize_arm64_patch` and `generate_patch` without changing their public call shape.

- [ ] Read exactly one instruction through Binary Ninja’s instruction-length API.
- [ ] Reject short/unmapped reads before any write.
- [ ] For multi-instruction return patches, validate the complete patch range and preserve remaining bytes.
- [ ] Reject non-branch invert requests instead of silently falling back to NOP unless the user explicitly chose NOP.
- [ ] Return actionable summaries/errors to the chat UI.

### Task 3: Regression verification and packaging

**Files:**
- Modify: `README.md` if behavior/setup documentation changes.
- Output: `/home/ubuntu/upload/mimir-fixed.zip`

- [ ] Run Python compilation for the standalone plugin.
- [ ] Run `npm run lint` and `npm run build`.
- [ ] Verify generated exporter output contains the same parser and safety guards.
- [ ] Rebuild a clean archive without `__pycache__` or `dist` artifacts.
- [ ] Report the Binary Ninja runtime limitation: host-level execution still requires the user’s Binary Ninja installation.
