# Real Frida mode on macOS

Mimir stays in simulation mode by default. Real mode runs the optional host bridge on the Mac where the companion server runs. The sandbox cannot test USB pairing or iPhone instrumentation.

Install the Frida Python bindings on the Mac:

```bash
python3 -m pip install frida frida-tools
```

Confirm the phone is trusted, connected by USB, and visible:

```bash
frida-ls-devices
```

Start Mimir with real mode enabled:

```bash
MIMIR_FRIDA_MODE=real npm run dev
```

Mimir then uses `frida-bridge/bridge.py` for device listing, process listing, app spawn, and script loading. The UI displays `REAL FRIDA` only when the server is running in this mode. If the runtime is missing or the device is unavailable, the request fails with an actionable error. Mimir does not silently replace a failed real operation with simulated data.

iOS limitations depend on the device, Frida server availability, app signing, entitlements, and whether the target app can be spawned or attached. Do not treat a successful script load as authorization to bypass protections on software you do not own or have permission to test.
