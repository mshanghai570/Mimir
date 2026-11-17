# Mimir Full Agent Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Mimir behave like a real conversational Binary Ninja co-pilot, preserve provider/model configuration, run configurable multi-agent jobs, and replace simulated Frida actions with a real optional host bridge.

**Architecture:** Keep Binary Ninja patch execution local and deterministic. Route natural-language chat through a server chat endpoint that returns both user-facing text and structured action/progress events. Store provider profiles in the companion server’s local encrypted-at-rest file or OS-protected secret store; browser state keeps only non-secret metadata. Add multi-agent orchestration as a server job endpoint with bounded parallel calls and per-agent progress. Add Frida as an optional macOS host adapter using the installed `frida` CLI/Python package; simulation remains explicit fallback.

**Tech Stack:** Existing React/TypeScript UI, Express/tsx companion server, Python Binary Ninja plugin, native `fetch`, existing provider adapters, optional Frida host dependency.

**Spec:** User request in conversation: conversational replies, visible work/status, load available models, save providers permanently, configurable multi-model/provider agent teams, and USB iPhone Frida attach/app instrumentation.

## Global Constraints

- Keep existing Binary Ninja local patch validation and undo behavior.
- Never claim simulated Frida data is real.
- Never expose provider API keys to browser localStorage or exported plugin bundles.
- Use existing dependencies unless a real Frida adapter requires an optional host dependency.
- Keep all provider URLs behind current HTTP(S), token, and private-network validation.
- Real device operations require explicit user action and target selection.
- Existing prototype mode stays usable when no Frida runtime is installed.

## Review Focus

- Chat request that needs no action must receive a normal conversational answer.
- Chat request that requests a patch must show plan, target, validation, and result.
- Model discovery must not save a provider with a stale or fabricated model list.
- Provider secrets must not appear in browser storage, logs, exports, or error messages.
- Multi-agent partial failure must preserve successful outputs and show failed roles.
- Missing Frida installation, no USB device, and unsupported iOS transport must fail clearly, not fall back silently.

---

### Task 1: Conversational chat and transparent execution

**Files:**
- Modify: `src/components/MimirFloatingChat.tsx`
- Modify: `src/components/DisassemblyWorkspace.tsx`
- Modify: `src/utils/agentIntent.ts`
- Modify: `src/services/api.ts`
- Modify: `server.ts`
- Test: `tests/test_plugin_logic.py` or a new server/API test fixture

**Interfaces:**
- Produce `POST /api/ai/chat` response fields: `message`, optional `events[]`, optional `action`, optional `requiresConfirmation`.
- Add chat event shape: `{ type: 'thinking'|'tool'|'action'|'result'|'error', text: string, metadata?: Record<string,string> }`.

- [ ] Add tests for conversational response, patch-intent response, and provider error response.
- [ ] Add server response events for provider selection, context extraction, intent classification, local action dispatch, and completion.
- [ ] Update chat UI to render events as a compact live activity timeline, then render the final answer as normal chat.
- [ ] Keep deterministic local patch execution for explicit patch intents; require confirmation for destructive or ambiguous actions.
- [ ] Run `npm test` and `npm run build`.

### Task 2: Durable provider profiles and model loading

**Files:**
- Modify: `server.ts`
- Modify: `src/services/api.ts`
- Modify: `src/components/SettingsStudio.tsx`
- Modify: `src/App.tsx`
- Modify: `src/types/index.ts`
- Create: `server/providerStore.ts` or equivalent focused module
- Modify: `.env.example`
- Test: server provider-store tests

**Interfaces:**
- Provider profile: `{ id, name, type, url, selectedModel, availableModels, systemPrompt, isActive, secretRef }`.
- Server routes: `GET /api/providers`, `POST /api/providers`, `PUT /api/providers/:id`, `DELETE /api/providers/:id`, `POST /api/providers/:id/models`.

- [ ] Add provider-store tests for create, update, delete, restart persistence, and secret omission from JSON responses.
- [ ] Move provider persistence from browser `localStorage` to the companion server store; browser receives metadata and masked key status only.
- [ ] Keep API keys in environment-backed or OS-protected server storage; reject plaintext secret writes when no secure store is available.
- [ ] Make “Load Models” work for new and saved providers; show last refresh, source, and errors.
- [ ] Let users select and save a model per provider without re-entering URL or key.
- [ ] Run tests/build and inspect browser storage for absence of raw keys.

### Task 3: Real configurable multi-agent jobs

**Files:**
- Modify: `server.ts`
- Modify: `src/services/api.ts`
- Modify: `src/components/MultiAgentBoard.tsx`
- Modify: `src/types/index.ts`
- Modify: `src/App.tsx`
- Test: server orchestration tests

**Interfaces:**
- Job request: `{ objective, context, agents: [{ role, providerId, model, enabledSkills, temperature }] }`.
- Job event: `{ jobId, agentId, role, status, modelUsed?, text?, error? }`.
- Routes: `POST /api/ai/jobs`, `GET /api/ai/jobs/:id`, `POST /api/ai/jobs/:id/cancel`.

- [ ] Test mixed providers/models, bounded parallelism, partial failure, cancellation, and final synthesis.
- [ ] Replace UI-only `Promise.all` dispatch with server job orchestration and streamed/polled progress.
- [ ] Add role-level provider/model selectors, enable/disable controls, and a final synthesis step.
- [ ] Show each agent’s live status, model, elapsed time, output, and errors.
- [ ] Keep provider keys server-side; job payloads contain provider IDs, never raw keys.
- [ ] Run tests/build.

### Task 4: Optional real Frida host adapter

**Files:**
- Create: `frida-bridge/README.md`
- Create: `frida-bridge/bridge.py` or a small host adapter using installed Frida bindings
- Modify: `server.ts`
- Modify: `src/services/api.ts`
- Modify: `src/components/FridaBridge.tsx`
- Modify: `.env.example`
- Test: adapter command/transport tests with a fake Frida runner

**Interfaces:**
- Adapter commands: `list_devices`, `list_processes`, `spawn`, `attach`, `load_script`, `detach`.
- Server routes remain stable; response adds `mode: 'real'|'simulation'`, `capabilities`, and actionable errors.

- [ ] Test missing runtime, no USB device, fake device listing, attach failure, and successful fake script load.
- [ ] Detect Frida runtime on the Mac host; never fabricate a real device.
- [ ] Use USB device enumeration and app process listing from the adapter.
- [ ] Require explicit attach/launch confirmation before loading hooks.
- [ ] Preserve simulation mode only when user selects it or real runtime is unavailable.
- [ ] Document Mac setup: Frida tools, iPhone developer/signing constraints, trust pairing, and app entitlements.
- [ ] Run adapter tests, `npm test`, and `npm run build`.

### Task 5: Release verification and documentation

**Files:**
- Modify: `README.md`
- Modify: `docs/binaryninja-compatibility.md`
- Create: `docs/provider-storage.md`
- Create: `docs/frida-macos-setup.md`

- [ ] Document chat event semantics, provider storage, multi-agent jobs, and real-vs-simulated Frida.
- [ ] Add a Binary Ninja 6.0.10601 smoke checklist.
- [ ] Run all automated checks.
- [ ] Verify no API key appears in `localStorage`, Git diff, plugin export, logs, or error responses.
- [ ] Commit each task separately, then push the final verified branch.

## Deferred

- Automatic iPhone jailbreak, signing, or entitlement bypass.
- Arbitrary code execution inside Binary Ninja from model output.
- Cloud-hosted provider secret storage.
- Full ACP transport implementation beyond the existing configuration UI.
