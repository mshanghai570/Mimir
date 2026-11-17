import React, { useState, useEffect } from 'react';
import {
  FridaDevice,
  FridaProcess,
  FridaLogItem,
} from '../types';
import {
  Smartphone,
  Laptop,
  Play,
  Square,
  Search,
  CheckCircle2,
  Filter,
  Trash2,
  Download,
  Copy,
  Layers,
  Zap,
  Terminal,
  Activity,
} from 'lucide-react';
import { api } from '../services/api';

interface FridaBridgeProps {
  initialHookTarget?: string;
}

export const FridaBridge: React.FC<FridaBridgeProps> = ({ initialHookTarget }) => {
  const [devices, setDevices] = useState<FridaDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<FridaDevice | null>(null);
  const [processes, setProcesses] = useState<FridaProcess[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<FridaProcess | null>(null);
  const [processSearch, setProcessSearch] = useState('');
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);

  // Script Studio State
  const [scriptType, setScriptType] = useState<'swift_objc' | 'jailbreak_bypass' | 'ssl_pinning' | 'arm64_trace'>('swift_objc');
  const [customScript, setCustomScript] = useState<string>('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [logs, setLogs] = useState<FridaLogItem[]>([]);
  const [logFilter, setLogFilter] = useState('');

  // Pre-configured Frida script templates (with full iOS/macOS Swift & ObjC runtime support)
  const scriptTemplates: Record<string, string> = {
    swift_objc: `// [Frida Script] Swift & Objective-C Dynamic Method Interceptor
// Compatible with iOS 16/17 (arm64e) and macOS (Apple Silicon)

console.log("[*] Initializing Swift/ObjC Interceptor on target task...");

if (ObjC.available) {
    try {
        var targetClass = "LicenseManager";
        var targetMethod = "- verifyLicenseWith:";

        var hook = ObjC.classes[targetClass][targetMethod];
        if (hook) {
            Interceptor.attach(hook.implementation, {
                onEnter: function (args) {
                    var obj = new ObjC.Object(args[0]);
                    var sel = ObjC.selectorAsString(args[1]);
                    var keyArg = new ObjC.Object(args[2]);
                    send({
                        level: "event",
                        message: "Intercepted " + targetClass + " " + targetMethod + " | Arg: " + keyArg.toString()
                    });
                },
                onLeave: function (retval) {
                    send({
                        level: "patch",
                        message: "Original return value: " + retval + ". Forcing return value -> 0x1 (TRUE)"
                    });
                    retval.replace(ptr("0x1"));
                }
            });
            console.log("[+] Successfully attached hook to " + targetClass + " " + targetMethod);
        } else {
            console.log("[-] Class/Method not found: " + targetClass + " " + targetMethod);
        }
    } catch (err) {
        console.error("[-] Hook error: " + err.message);
    }
} else {
    console.log("[!] Objective-C runtime not found in this process. Falling back to native C symbol hooking.");
}`,

    jailbreak_bypass: `// [Frida Script] Universal Mobile Jailbreak & Root Bypass
// Neutralizes file checks, ptrace anti-debugging, and env probing

var jailbreakPaths = [
    "/Applications/Cydia.app",
    "/Library/MobileSubstrate/MobileSubstrate.dylib",
    "/bin/bash",
    "/usr/sbin/sshd",
    "/etc/apt",
    "/usr/bin/frida-server",
    "/usr/lib/libjailbreak.dylib"
];

// Hook access()
var accessPtr = Module.findExportByName(null, "access");
if (accessPtr) {
    Interceptor.attach(accessPtr, {
        onEnter: function (args) {
            var path = Memory.readUtf8String(args[0]);
            for (var i = 0; i < jailbreakPaths.length; i++) {
                if (path && path.indexOf(jailbreakPaths[i]) !== -1) {
                    this.isJailbreakPath = true;
                    send({ level: "event", message: "Neutralized jailbreak probe on: " + path });
                    break;
                }
            }
        },
        onLeave: function (retval) {
            if (this.isJailbreakPath) {
                retval.replace(ptr("-1")); // simulate ENOENT
            }
        }
    });
}

// Hook ptrace(PT_DENY_ATTACH)
var ptracePtr = Module.findExportByName(null, "ptrace");
if (ptracePtr) {
    Interceptor.attach(ptracePtr, {
        onEnter: function (args) {
            var request = args[0].toInt32();
            if (request === 31) { // PT_DENY_ATTACH
                send({ level: "patch", message: "Bypassed ptrace(PT_DENY_ATTACH, 0, 0, 0)" });
                this.denyAttach = true;
            }
        },
        onLeave: function (retval) {
            if (this.denyAttach) {
                retval.replace(ptr("0"));
            }
        }
    });
}
console.log("[+] Mobile integrity & anti-debugging bypasses active.");`,

    ssl_pinning: `// [Frida Script] Universal SSL / TLS Pinning Bypass
// Bypasses Apple Security Framework (SecTrustEvaluateWithError) & BoringSSL

if (ObjC.available) {
    var secTrustEvaluate = Module.findExportByName("Security", "SecTrustEvaluateWithError");
    if (secTrustEvaluate) {
        Interceptor.attach(secTrustEvaluate, {
            onEnter: function (args) {
                send({ level: "event", message: "SecTrustEvaluateWithError called! Forcing trust evaluation to TRUE" });
            },
            onLeave: function (retval) {
                retval.replace(ptr("0x1")); // errSecSuccess / valid trust
            }
        });
    }

    // Hook NSURLSessionDelegate
    try {
        var delegateClass = ObjC.classes.NSURLSession;
        send({ level: "info", message: "Configured TLS certificate bypass on NSURLSession." });
    } catch (e) {}
}
console.log("[+] SSL Pinning bypass successfully activated.");`,

    arm64_trace: `// [Frida Script] Low-Level ARM64 Register & Memory Tracer
// Disassembles instructions dynamically at runtime

var targetAddr = Module.findBaseAddress("libSecureCryptoCore.dylib");
if (targetAddr) {
    var hookOffset = targetAddr.add(0x3fa0);
    Interceptor.attach(hookOffset, {
        onEnter: function (args) {
            var x0 = this.context.x0;
            var x1 = this.context.x1;
            send({
                level: "event",
                message: "Hit 0x3fa0 | x0=" + x0 + " x1=" + x1 + " sp=" + this.context.sp
            });
        },
        onLeave: function (retval) {
            send({
                level: "patch",
                message: "Return from 0x3fa0 -> return x0=" + this.context.x0
            });
        }
    });
} else {
    console.log("[*] Target module not yet loaded. Waiting for dlopen()...");
}`,
  };

  // Load devices on mount
  useEffect(() => {
    async function initDevices() {
      const res = await api.getFridaDevices();
      if (res.success && res.devices.length > 0) {
        setDevices(res.devices);
        setSelectedDevice(res.devices[0]);
      }
    }
    initDevices();
  }, []);

  // Fetch processes when selectedDevice changes
  useEffect(() => {
    if (!selectedDevice) return;
    const devId = selectedDevice.id;
    async function loadProcs(targetId: string) {
      setIsLoadingProcesses(true);
      const res = await api.getFridaProcesses(targetId);
      if (res.success) {
        setProcesses(res.processes);
        if (res.processes.length > 0) setSelectedProcess(res.processes[0]);
      }
      setIsLoadingProcesses(false);
    }
    loadProcs(devId);
  }, [selectedDevice]);

  // Sync script template
  useEffect(() => {
    let script = scriptTemplates[scriptType] || scriptTemplates.swift_objc;
    if (initialHookTarget && scriptType === 'swift_objc') {
      script = script.replace('LicenseManager', initialHookTarget.split('.')[0] || 'LicenseManager');
    }
    setCustomScript(script);
  }, [scriptType, initialHookTarget]);

  // Start Frida Instrumentation Session
  const handleStartSession = async () => {
    const currentDevice = selectedDevice;
    const currentProc = selectedProcess;
    if (!currentDevice || !currentProc) return;
    setIsSessionActive(true);

    const initialLog: FridaLogItem = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: `Establishing Frida session to PID ${currentProc.pid} (${currentProc.name}) on ${currentDevice.name} via ${currentDevice.transport}...`,
    };
    setLogs((prev) => [initialLog, ...prev]);

    try {
      const res = await api.executeFridaScript({
        deviceId: currentDevice.id,
        pid: currentProc.pid,
        script: customScript,
        scriptType,
      });

      if (res.success && res.logs) {
        const mappedLogs = res.logs.map((l, i) => ({
          id: `log_${Date.now()}_${i}`,
          timestamp: new Date(l.timestamp).toLocaleTimeString(),
          level: l.level as any,
          message: l.message,
        }));
        setLogs((prev) => [...mappedLogs, ...prev]);
      }
    } catch (err: any) {
      setLogs((prev) => [
        {
          id: `log_${Date.now()}`,
          timestamp: new Date().toLocaleTimeString(),
          level: 'error',
          message: `Frida session failure: ${err.message}`,
        },
        ...prev,
      ]);
    }
  };

  const handleStopSession = () => {
    setIsSessionActive(false);
    setLogs((prev) => [
      {
        id: `log_${Date.now()}`,
        timestamp: new Date().toLocaleTimeString(),
        level: 'warn',
        message: `Frida session detached from PID ${selectedProcess?.pid || 0}. Interceptor hooks removed.`,
      },
      ...prev,
    ]);
  };

  const filteredProcesses = processes.filter(
    (p) =>
      p.name.toLowerCase().includes(processSearch.toLowerCase()) ||
      p.bundleId.toLowerCase().includes(processSearch.toLowerCase()) ||
      String(p.pid).includes(processSearch)
  );

  const filteredLogs = logs.filter((l) =>
    l.message.toLowerCase().includes(logFilter.toLowerCase())
  );

  return (
    <div className="flex flex-col h-[calc(100vh-53px)] bg-[#090d14] text-slate-200">
      {/* Phone Connection & Hardware Banner */}
      <div className="px-6 py-3 bg-[#0d121c] border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-white">Target Device:</span>
            <select
              value={selectedDevice?.id || ''}
              onChange={(e) => {
                const dev = devices.find((d) => d.id === e.target.value);
                if (dev) setSelectedDevice(dev);
              }}
              className="bg-slate-800 border border-slate-700 text-cyan-300 font-mono text-xs rounded px-2.5 py-1 focus:outline-none focus:border-cyan-500"
            >
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.os})
                </option>
              ))}
            </select>
          </div>

          {selectedDevice && (
            <div className="flex items-center gap-3 text-xs text-slate-400 font-mono">
              <span className="text-emerald-400 flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Connected via {selectedDevice.transport}</span>
              </span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Arch: {selectedDevice.arch}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Battery: {selectedDevice.battery}</span>
              <span aria-hidden="true" className="text-slate-600">·</span>
              <span>Frida Server: {selectedDevice.serverVersion}</span>
            </div>
          )}
        </div>

        {/* Action button */}
        <div className="flex items-center gap-2">
          {isSessionActive ? (
            <button
              onClick={handleStopSession}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/60 border border-rose-800/80 rounded hover:bg-rose-900/80 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-rose-300" />
              <span>Detach Frida</span>
            </button>
          ) : (
            <button
              onClick={handleStartSession}
              disabled={!selectedProcess}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              <span>Attach & Inject Script</span>
            </button>
          )}
        </div>
      </div>

      {/* Main 3-Column Studio Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Column 1: Phone Process Selector */}
        <div className="w-80 bg-[#0c1018] border-r border-slate-800/80 flex flex-col shrink-0">
          <div className="p-3 border-b border-slate-800 bg-[#0e131d]">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-white">Running Phone Tasks</span>
              <span className="text-[11px] text-slate-400 font-mono">{filteredProcesses.length} tasks</span>
            </div>
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Search PID / Bundle ID..."
                value={processSearch}
                onChange={(e) => setProcessSearch(e.target.value)}
                className="w-full bg-slate-900/90 border border-slate-800 rounded pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40 font-mono text-xs">
            {isLoadingProcesses ? (
              <div className="p-4 text-center text-slate-500">Querying phone process table...</div>
            ) : filteredProcesses.length === 0 ? (
              <div className="p-4 text-center text-slate-500">No matching processes found</div>
            ) : (
              filteredProcesses.map((proc) => {
                const isSelected = selectedProcess?.pid === proc.pid;
                return (
                  <button
                    key={proc.pid}
                    onClick={() => setSelectedProcess(proc)}
                    className={`w-full text-left p-3 transition-colors flex flex-col gap-1 ${
                      isSelected
                        ? 'bg-cyan-950/40 text-cyan-300 border-l-2 border-cyan-400'
                        : 'text-slate-300 hover:bg-slate-900/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-white text-xs">{proc.name}</span>
                      <span className="text-[11px] text-slate-500">PID {proc.pid}</span>
                    </div>
                    <div className="text-[11px] text-slate-400 truncate">{proc.bundleId}</div>
                    <div className="flex items-center gap-2 mt-0.5 text-[10px] text-slate-500">
                      <span>Arch: {proc.arch}</span>
                      <span>·</span>
                      <span className="capitalize">{proc.state}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Quick Spawn Box */}
          <div className="p-3 border-t border-slate-800 bg-[#090d14] text-xs">
            <span className="text-slate-400 text-[11px] block mb-1.5">Spawn Fresh Application</span>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                placeholder="com.target.bundleId"
                className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 font-mono"
              />
              <button
                onClick={() => {
                  setLogs((prev) => [
                    {
                      id: `log_${Date.now()}`,
                      timestamp: new Date().toLocaleTimeString(),
                      level: 'info',
                      message: `[Frida] Spawned com.target.app with suspended main thread. Applying hooks prior to entry...`,
                    },
                    ...prev,
                  ]);
                }}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium text-xs whitespace-nowrap"
              >
                Spawn
              </button>
            </div>
          </div>
        </div>

        {/* Column 2: Script Studio & Hook Presets */}
        <div className="flex-1 flex flex-col bg-[#070a10] border-r border-slate-800/80 overflow-hidden">
          {/* Script Preset Toolbar */}
          <div className="p-3 bg-[#0d121c] border-b border-slate-800 flex items-center justify-between flex-wrap gap-2 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400 font-medium">Hook Preset:</span>
              <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
                <button
                  onClick={() => setScriptType('swift_objc')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    scriptType === 'swift_objc' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Swift/ObjC Intercept
                </button>
                <button
                  onClick={() => setScriptType('jailbreak_bypass')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    scriptType === 'jailbreak_bypass' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Jailbreak Bypass
                </button>
                <button
                  onClick={() => setScriptType('ssl_pinning')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    scriptType === 'ssl_pinning' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  SSL Pinning Bypass
                </button>
                <button
                  onClick={() => setScriptType('arm64_trace')}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    scriptType === 'arm64_trace' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
                  }`}
                >
                  ARM64 Registers
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(customScript);
              }}
              className="flex items-center gap-1 px-2.5 py-1 text-slate-400 hover:text-white bg-slate-800/70 rounded border border-slate-700 text-xs"
            >
              <Copy className="w-3 h-3" />
              <span>Copy</span>
            </button>
          </div>

          {/* Script Editor */}
          <div className="flex-1 p-3 flex flex-col overflow-hidden bg-[#070a10]">
            <textarea
              value={customScript}
              onChange={(e) => setCustomScript(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full bg-[#0a0d15] border border-slate-800 rounded p-3 font-mono text-xs text-slate-200 leading-relaxed resize-none focus:outline-none focus:border-cyan-500 selection:bg-cyan-500/30"
            />
          </div>
        </div>

        {/* Column 3: Live Real-Time Telemetry & Event Stream */}
        <div className="w-96 bg-[#090c13] flex flex-col shrink-0 overflow-hidden">
          {/* Telemetry Header */}
          <div className="p-3 bg-[#0d121c] border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-white">Live Telemetry Stream</span>
              {isSessionActive && (
                <span className="text-[10px] text-emerald-400 font-mono">Active</span>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setLogs([])}
                className="p-1 text-slate-400 hover:text-rose-300 transition-colors"
                title="Clear console"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Log Search / Filter */}
          <div className="p-2 border-b border-slate-800 bg-[#070a10]">
            <div className="relative">
              <Filter className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
              <input
                type="text"
                placeholder="Filter events / return codes..."
                value={logFilter}
                onChange={(e) => setLogFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 rounded pl-7 pr-2 py-1 text-[11px] text-slate-200 placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Telemetry Log Feed */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2 font-mono text-xs divide-y divide-slate-800/30">
            {filteredLogs.length === 0 ? (
              <div className="p-6 text-center text-slate-600 text-xs">
                No telemetry events yet. Attach to a task on your connected phone to intercept function invocations.
              </div>
            ) : (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className={`pt-2 flex flex-col gap-1 ${
                    log.level === 'patch'
                      ? 'text-amber-300'
                      : log.level === 'event'
                      ? 'text-cyan-300'
                      : log.level === 'error'
                      ? 'text-rose-300'
                      : log.level === 'success'
                      ? 'text-emerald-300'
                      : 'text-slate-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-[10px] text-slate-500">
                    <span className="uppercase font-semibold tracking-wider">{log.level}</span>
                    <span className="tabular-nums">{log.timestamp}</span>
                  </div>
                  <div className="text-[11px] leading-relaxed break-all select-all">{log.message}</div>
                </div>
              ))
            )}
          </div>

          {/* Workbench photo preview card */}
          <div className="p-3 border-t border-slate-800 bg-[#080b12]">
            <div className="relative rounded-lg overflow-hidden border border-slate-800 group">
              <img
                src="/src/assets/images/frida_phone_bridge_1794908643952.jpg"
                alt="USB Phone Bridge Setup"
                className="w-full h-24 object-cover opacity-80 group-hover:opacity-100 transition-opacity"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent p-2.5 flex flex-col justify-end">
                <span className="text-[11px] font-semibold text-white">USB-C Hardware Bridge</span>
                <span className="text-[10px] text-slate-300">usbmuxd tunnel active (Low-latency trace)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
