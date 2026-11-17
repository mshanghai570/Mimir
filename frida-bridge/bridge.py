#!/usr/bin/env python3
"""Optional Mimir host bridge. Requires: python3 -m pip install frida-tools frida."""
import json
import sys


def reply(payload):
    print(json.dumps(payload), flush=True)


def get_device(frida, device_id):
    for device in frida.enumerate_devices():
        if device.id == device_id:
            return device
    raise RuntimeError(f"Frida device not found: {device_id}")


def main(command, payload):
    try:
        import frida
    except ImportError as exc:
        return {"success": False, "error": "Frida runtime missing. Install frida-tools on the Mac host.", "detail": str(exc)}

    try:
        if command == "list_devices":
            devices = []
            for device in frida.enumerate_devices():
                if device.type not in ("usb", "local", "remote"):
                    continue
                devices.append({
                    "id": device.id,
                    "name": device.name,
                    "type": device.type,
                    "platform": "ios" if device.type == "usb" else "macos",
                    "os": "unknown",
                    "arch": "unknown",
                    "status": "connected",
                    "battery": "unknown",
                    "serverVersion": "unknown",
                    "transport": "Frida USB" if device.type == "usb" else "Frida local",
                })
            return {"success": True, "mode": "real", "devices": devices}

        device = get_device(frida, payload.get("deviceId", ""))
        if command == "list_processes":
            processes = []
            for process in device.enumerate_processes():
                processes.append({
                    "pid": process.pid,
                    "name": process.name,
                    "bundleId": process.name,
                    "arch": "unknown",
                    "state": "running",
                })
            return {"success": True, "mode": "real", "processes": processes}

        if command == "spawn":
            pid = device.spawn([payload["bundleId"]])
            return {"success": True, "mode": "real", "pid": pid}

        if command == "run_script":
            session = device.attach(int(payload["pid"]))
            messages = []
            script = session.create_script(payload["script"])
            script.on("message", lambda message, data: messages.append(message))
            script.load()
            return {"success": True, "mode": "real", "sessionId": f"frida_{payload['pid']}", "messages": messages}

        return {"success": False, "error": f"Unknown bridge command: {command}"}
    except Exception as exc:
        return {"success": False, "error": str(exc)}


if __name__ == "__main__":
    if len(sys.argv) != 2:
        reply({"success": False, "error": "Usage: bridge.py <command>"})
        raise SystemExit(2)
    try:
        payload = json.loads(sys.stdin.read() or "{}")
        reply(main(sys.argv[1], payload))
    except Exception as exc:
        reply({"success": False, "error": str(exc)})
        raise SystemExit(1)
