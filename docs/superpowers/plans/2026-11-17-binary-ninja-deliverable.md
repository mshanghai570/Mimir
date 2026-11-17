# Binary Ninja Deliverable Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the project archive directly installable as a Binary Ninja plugin while retaining the React/Express AI Studio app as an optional companion backend.

**Architecture:** Add the generated Binary Ninja package under `plugin/mimir_plugin/` with `plugin.json`, `__init__.py`, and `mimir_binja.py`. Clarify in the documentation that the web app is not required for local plugin loading but is required for AI calls. Align the declared `esbuild` version with Vite’s peer requirement so a normal install works.

**Tech Stack:** Binary Ninja Python API, Python syntax compilation, React/Vite/Express, npm.

**Spec:** User request to fix the submitted archive so it is a real Binary Ninja plugin deliverable.

## Global Constraints

- The plugin must load from the standard Binary Ninja plugin directory.
- AI requests may use the companion backend at `http://localhost:3000/api`.
- The existing web app behavior should remain unchanged.
- Do not add a new runtime dependency to the plugin package.

## Review Focus

- Archive contains the plugin files before the web app is run.
- Plugin metadata and package layout match Binary Ninja installation instructions.
- Generated Python remains syntactically valid.
- Normal npm dependency installation does not hit the existing Vite/esbuild peer conflict.
- Documentation distinguishes real Binary Ninja integration from mocked web-app data.

---

### Task 1: Add the standalone plugin package

**Files:**
- Create: `plugin/mimir_plugin/plugin.json`
- Create: `plugin/mimir_plugin/__init__.py`
- Create: `plugin/mimir_plugin/mimir_binja.py`

- [ ] Copy the verified generated plugin bundle into the package directory.
- [ ] Run `python3 -m py_compile plugin/mimir_plugin/mimir_binja.py plugin/mimir_plugin/__init__.py`.

### Task 2: Clarify deliverable and installation documentation

**Files:**
- Modify: `README.md`
- Create: `plugin/README.md`

- [ ] Explain that the archive is a hybrid web app plus standalone plugin.
- [ ] Provide platform-specific plugin installation paths and backend startup instructions.
- [ ] State which web-app features are demonstrations/mock data and which plugin features operate on the live BinaryView.

### Task 3: Fix install reproducibility

**Files:**
- Modify: `package.json`

- [ ] Change `esbuild` from `^0.25.0` to a Vite-8-compatible `^0.28.2` range.
- [ ] Run `npm install --no-audit --no-fund`, `npm run lint`, and `npm run build`.

### Task 4: Produce and verify the corrected archive

**Files:**
- Create: `/home/ubuntu/upload/mimir-fixed.zip`

- [ ] Verify the archive contains the plugin package and web app.
- [ ] Verify plugin Python syntax, metadata JSON, TypeScript lint, and Vite build.
