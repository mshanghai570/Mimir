# Mimir Binary Ninja Plugin

This directory contains the installable plugin package. Copy `mimir_plugin/` into the Binary Ninja plugins directory for your platform.

The plugin works with Binary Ninja 3.5+ and registers these commands:

- Analyze a function with the AI backend.
- Patch a function to return true on ARM64.
- Invert a conditional branch or insert a NOP at an address.

The plugin uses the live Binary Ninja `BinaryView`. AI analysis calls the optional Mimir companion backend at `http://localhost:3000/api`; start that backend from the repository root with `npm install` followed by `npm run dev`. Local search and patch commands do not need the backend.

Open the **AI Provider Settings** button in the Mimir sidebar to configure the provider type, provider URL, model, API key, and Mimir backend endpoint. The plugin saves these values in Binary Ninja settings and uses them for later AI requests.

The same sidebar also includes **Multi-Agent Team** and **Frida Bridge**. Multi-Agent Team dispatches Decompiler, Security Auditor, and Frida Specialist roles through the companion server, with a separate model field for each role. Frida Bridge lists devices, lists processes, and runs scripts through the real host bridge when `MIMIR_FRIDA_MODE=real`; otherwise its responses are explicitly marked as simulation.

Do not copy only one file: `plugin.json`, `__init__.py`, and `mimir_binja.py` must remain together in the `mimir_plugin` folder.
