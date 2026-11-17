# Binary Ninja compatibility

## Current status

The plugin metadata declares Binary Ninja 3.5+:

```json
"minimumbinaryninjaversion": 3500
```

That value is an installation floor, not proof that every UI and API path works on later releases. Binary Ninja `6.0.10601` has not been run in this sandbox. Treat 6.0.10601 as **unverified** until the checklist below passes on a real installation.

## Host smoke test

Run this from the repository root using the Python interpreter shipped with the target Binary Ninja installation, or run the equivalent commands in Binary Ninja’s Python console:

```python
from pathlib import Path
import sys

root = Path.cwd()
sys.path.insert(0, str(root))

import binaryninja
print("Binary Ninja core:", getattr(binaryninja, "core_version", "unknown"))

from plugin.mimir_plugin import mimir_binja
mimir_binja.register_settings()
print("Mimir settings registration: OK")
print("Mimir parser:", mimir_binja.parse_patch_request("invert the branch at 0x100003FA0"))
```

Then restart Binary Ninja and verify the following manually:

1. No plugin-load exception appears in the Binary Ninja log.
2. The Mimir sidebar icon appears and opens.
3. **AI Provider Settings** opens, saves, and reloads its values.
4. The floating chat tracks the active `BinaryView` and current function.
5. A plain-language patch request asks for clarification when strategy is missing.
6. An explicit ARM64 NOP or branch-inversion request reports success or a safe error.
7. A failed patch writes no bytes.
8. Binary Ninja undo reverses a successful patch.
9. Reloading the plugin does not crash or duplicate the sidebar.

## Evidence rule

Record the exact Binary Ninja version, operating system, architecture, plugin commit, and pass/fail result for each item. Do not label a release as compatible with a Binary Ninja version based only on `plugin.json`, Python compilation, or the web dashboard build.
