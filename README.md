# Mimir: Binary Ninja Plugin + AI Studio Companion

<p align="center">
  <img src="assets/mimir-emblem.png" alt="Mimir geometric cyber-guardian mascot" width="420">
</p>

Mimir’s visual mark is a weathered guardian emblem with a faceted analysis eye, circuit-like geometry, and a retro signal-print palette.

This repository contains two related pieces:

1. `plugin/mimir_plugin/` is the directly installable Binary Ninja plugin. It registers Binary Ninja commands, reads the active `BinaryView`, extracts HLIL/LLIL and disassembly, adds analysis comments, and performs undoable ARM64 patch operations.
2. The React/Vite/Express application is an optional companion backend and control panel. The plugin sends AI requests to this backend at `http://localhost:3000/api` by default.

The original Google AI Studio export created the web application first and generated plugin files only at runtime. This corrected layout includes the plugin files in the archive, so the plugin can be installed without running the web app.

## Install the Binary Ninja plugin

Copy the complete `plugin/mimir_plugin` directory into Binary Ninja’s plugin directory:

- macOS: `~/Library/Application Support/Binary Ninja/plugins/mimir_plugin/`
- Linux: `~/.binaryninja/plugins/mimir_plugin/`
- Windows: `%APPDATA%\\Binary Ninja\\plugins\\mimir_plugin\\`

The directory must contain `plugin.json`, `__init__.py`, and `mimir_binja.py`. Restart Binary Ninja after copying the files. The plugin metadata declares Binary Ninja 3.5+ as the minimum version.

## Run the optional AI backend

The plugin’s local patching and Binary Ninja UI commands do not require the web app. AI analysis does require the companion backend:

```bash
npm install
npm run dev
```

Set `GEMINI_API_KEY` in `.env.local` or the server environment when using Gemini. The backend listens on port 3000 by default. If it runs elsewhere, update the Binary Ninja setting `mimir.serverEndpoint`.

After opening the Mimir sidebar in Binary Ninja, use **AI Provider Settings** to select Gemini or an OpenAI-compatible provider, enter the provider URL, model, API key, and companion backend endpoint. These values are stored in Binary Ninja settings and are used by subsequent AI requests.

## Run the web UI

The browser UI is useful as a companion dashboard, but it is not the Binary Ninja integration itself:

```bash
npm run dev
```

The web UI includes sample/mock binary data for its disassembly screens. The generated Binary Ninja plugin, not those screens, operates on the live Binary Ninja `BinaryView`. The Frida controls in the current web UI are also simulated and should not be treated as a live device bridge.

## Verification

The project is intended to pass:

```bash
npm install
npm run lint
npm run build
python3 -m py_compile plugin/mimir_plugin/mimir_binja.py plugin/mimir_plugin/__init__.py
```
