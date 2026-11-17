import React, { useState, useEffect, useMemo } from 'react';
import {
  FridaDevice,
  FridaProcess,
  FridaLogItem,
} from '../types';
import {
  Smartphone,
  Play,
  Square,
  Search,
  CheckCircle2,
  Filter,
  Trash2,
  Download,
  Copy,
  Check,
  Activity,
} from 'lucide-react';
import { api } from '../services/api';

interface FridaBridgeProps {
  initialHookTarget?: string;
}

const SCRIPT_TEMPLATES: Record<string, string> = {
  swift_objc: `// [Frida Script] Swift & Objective-C Dynamic Method Interceptor
// Compatible with iOS 16/17 (arm64e) and macOS (Apple Silicon)

console.log("[*] Initializing Swift/ObjC Interceptor on target task...");

if (ObjC.available) {
    try {
        var targetClass = "LicenseManager";
        var targetMethod = "- verifyLicenseWith:";

        var cls = ObjC.classes[targetClass];
        var hook = cls ? cls[targetMethod] : null;
        if (hook) {
            Interceptor.attach(hook.implementation, {
                onEnter: function (args) {
                    var keyArg = args[2] ? new ObjC.Object(args[2]).toString() : "null";
                    send({
                        level: "event",
                        message: "Intercepted " + targetClass + " " + targetMethod + " | Arg: " + keyArg
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
    console.log("[!] Objective-C runtime not found. Falling back to native symbol hooking.");
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
                retval.replace(ptr("-1"));
            }
        }
    });
}

var ptracePtr = Module.findExportByName(null, "ptrace");
if (ptracePtr) {
    Interceptor.attach(ptracePtr, {
        onEnter: function (args) {
            if (args[0].toInt32() === 31) {
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
            onEnter: function () {
                send({ level: "event", message: "SecTrustEvaluateWithError called! Forcing trust evaluation to TRUE" });
            },
            onLeave: function (retval) {
                retval.replace(ptr("0x1"));
            }
        });
    }
}
console.log("[+] SSL Pinning bypass successfully activated.");`,

  arm64_trace: `// [Frida Script] Low-Level ARM64 Register & Memory Tracer
// Disassembles instructions dynamically at runtime

var targetAddr = Module.findBaseAddress("libSecureCryptoCore.dylib");
if (targetAddr) {
    var hookOffset = targetAddr.add(0x3fa0);
    Interceptor.attach(hookOffset, {
        onEnter: function () {
            send({
                level: "event",
                message: "Hit 0x3fa0 | x0=" + this.context.x0 + " x1=" + this.context.x1 + " sp=" + this.context.sp
            });
        },
        onLeave: function () {
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

function customizeTemplateForTarget(baseScript: string, hookTarget?: string): string {
  if (!hookTarget) return baseScript;
  // Support Objective-C signature like "-[ClassName method:]" or Swift "Module.ClassName.method(...)"
  const objcMatch = hookTarget.match(/([+-])\[(\w+)\s+([^\]]+)\]/);
  if (objcMatch) {
    const [, sign, clsName, sel] = objcMatch;
    return baseScript
      .replace('LicenseManager', clsName)
      .replace('- verifyLicenseWith:', `${sign} ${sel}`);
  }
  const parts = hookTarget.split('(')[0].split('.').filter(Boolean);
  const clsName = parts.length >= 2 ? parts[parts.length - 2] : parts[0];
  const methodName = parts.length >= 2 ? parts[parts.length - 1] : '';
  let updated = baseScript.replace('LicenseManager', clsName || 'LicenseManager');
  if (methodName) {
    updated = updated.replace('- verifyLicenseWith:', `- ${methodName}:`);
  }
  return updated;
}

export const FridaBridge: React.FC<FridaBridgeProps> = ({ initialHookTarget }) => {
  const [devices, setDevices] = useState<FridaDevice[]>([]);
  const [fridaMode, setFridaMode] = useState<'real' | 'simulation'>('simulation');
  const [selectedDevice, setSelectedDevice] = useState<FridaDevice | null>(null);
  const [processes, setProcesses] = useState<FridaProcess[]>([]);
  const [selectedProcess, setSelectedProcess] = useState<FridaProcess | null>(null);
  const [processSearch, setProcessSearch] = useState('');
  const [isLoadingProcesses, setIsLoadingProcesses] = useState(false);

  // Spawn State
  const [spawnBundleId, setSpawnBundleId] = useState('');
  const [isSpawning, setIsSpawning] = useState(false);

  // Script Studio State
  const [scriptType, setScriptType] = useState<'swift_objc' | 'jailbreak_bypass' | 'ssl_pinning' | 'arm64_trace'>('swift_objc');
  const [customScript, setCustomScript] = useState<string>('');
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [logs, setLogs] = useState<FridaLogItem[]>([]);
  const [logFilter, setLogFilter] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);

  useEffect(() => {
    async function initDevices() {
      const res = await api.getFridaDevices();
      if (res.mode) setFridaMode(res.mode);
      if (res.success && res.devices.length > 0) {
        setDevices(res.devices);
        setSelectedDevice(res.devices[0]);
      }
    }
    initDevices();
  }, []);

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

  useEffect(() => {
    let script = SCRIPT_TEMPLATES[scriptType] || SCRIPT_TEMPLATES.swift_objc;
    if (scriptType === 'swift_objc' && initialHookTarget) {
      script = customizeTemplateForTarget(script, initialHookTarget);
    }
    setCustomScript(script);
  }, [scriptType, initialHookTarget]);

  const handleStartSession = async () => {
    if (!selectedDevice || !selectedProcess) return;
    setIsSessionActive(true);

    const initialLog: FridaLogItem = {
      id: `log_${Date.now()}`,
      timestamp: new Date().toLocaleTimeString(),
      level: 'info',
      message: `[SIMULATED] Frida session preview for PID ${selectedProcess.pid} (${selectedProcess.name}) on ${selectedDevice.name} via ${selectedDevice.transport}...`,
    };
    setLogs((prev) => [initialLog, ...prev]);

    try {
      const res = await api.executeFridaScript({
        deviceId: selectedDevice.id,
        pid: selectedProcess.pid,
        script: customScript,
        scriptType,
      });

      if (res.logs && res.logs.length > 0) {
        const mappedLogs = res.logs.map((l, i) => ({
          id: `log_${Date.now()}_${i}`,
          timestamp: new Date(l.timestamp).toLocaleTimeString(),
          level: l.level as FridaLogItem['level'],
          message: l.message,
        }));
        setLogs((prev) => [...mappedLogs, ...prev]);
      }
      if (!res.success) {
        setIsSessionActive(false);
      }
    } catch (err: any) {
      setIsSessionActive(false);
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
        message: `[SIMULATED] Frida session preview stopped for PID ${selectedProcess?.pid || 0}. No hooks were installed.`,
      },
      ...prev,
    ]);
  };

  const handleSpawnApp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!selectedDevice || !spawnBundleId.trim() || isSpawning) return;
    setIsSpawning(true);

    try {
      const res = await api.spawnFridaApp(selectedDevice.id, spawnBundleId.trim());
      if (res.success && res.process) {
        setProcesses((prev) => [res.process!, ...prev.filter((p) => p.pid !== res.process!.pid)]);
        setSelectedProcess(res.process);
        setSpawnBundleId('');
      }
      if (res.logs) {
        const mapped = res.logs.map((l, idx) => ({
          id: `spawn_${Date.now()}_${idx}`,
          timestamp: new Date(l.timestamp).toLocaleTimeString(),
          level: l.level as FridaLogItem['level'],
          message: l.message,
        }));
        setLogs((prev) => [...mapped, ...prev]);
      }
    } finally {
      setIsSpawning(false);
    }
  };

  const handleDownloadScript = () => {
    const blob = new Blob([customScript], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `mimir_${scriptType}.js`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const filteredProcesses = useMemo(() => {
    const q = processSearch.toLowerCase();
    return processes.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.bundleId.toLowerCase().includes(q) ||
        String(p.pid).includes(q)
    );
  }, [processes, processSearch]);

  const filteredLogs = useMemo(() => {
    const q = logFilter.toLowerCase();
    return logs.filter((l) => l.message.toLowerCase().includes(q));
  }, [logs, logFilter]);

  return (
    <div className="flex flex-col h-[calc(100vh-53px)] bg-[#090d14] text-slate-200">
      {/* Phone Connection & Hardware Banner */}
      <div className="px-6 py-3 bg-[#0d121c] border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-semibold text-white">Target Device:</span>
            <span className={`rounded border px-2 py-0.5 text-[10px] font-bold tracking-wider ${fridaMode === 'real' ? 'border-emerald-500/50 bg-emerald-950/50 text-emerald-300' : 'border-amber-500/50 bg-amber-950/50 text-amber-300'}`}>
              {fridaMode === 'real' ? 'REAL FRIDA' : 'SIMULATION MODE'}
            </span>
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
                <span>Simulated via {selectedDevice.transport}</span>
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

        <div className="flex items-center gap-2">
          {isSessionActive ? (
            <button
              onClick={handleStopSession}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/60 border border-rose-800/80 rounded hover:bg-rose-900/80 transition-colors"
            >
              <Square className="w-3.5 h-3.5 fill-rose-300" />
              <span>Stop Preview</span>
            </button>
          ) : (
            <button
              onClick={handleStartSession}
              disabled={!selectedProcess}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-cyan-400 hover:bg-cyan-300 rounded transition-colors disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-slate-950" />
              <span>Preview Script Run</span>
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

          {/* Controlled Quick Spawn Box */}
          <form onSubmit={handleSpawnApp} className="p-3 border-t border-slate-800 bg-[#090d14] text-xs">
            <span className="text-slate-400 text-[11px] block mb-1.5">Spawn Fresh Application</span>
            <div className="flex items-center gap-1.5">
              <input
                type="text"
                value={spawnBundleId}
                onChange={(e) => setSpawnBundleId(e.target.value)}
                placeholder="com.target.bundleId"
                className="flex-1 bg-slate-900 border border-slate-800 rounded px-2.5 py-1 text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
              />
              <button
                type="submit"
                disabled={isSpawning || !spawnBundleId.trim()}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-medium text-xs whitespace-nowrap disabled:opacity-50"
              >
                {isSpawning ? 'Spawning...' : 'Spawn'}
              </button>
            </div>
          </form>
        </div>

        {/* Column 2: Script Studio & Hook Presets */}
        <div className="flex-1 flex flex-col bg-[#070a10] border-r border-slate-800/80 overflow-hidden">
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

            <div className="flex items-center gap-2">
              <button
                onClick={handleDownloadScript}
                className="flex items-center gap-1 px-2.5 py-1 text-slate-300 hover:text-white bg-slate-800/70 rounded border border-slate-700 text-xs"
              >
                <Download className="w-3 h-3" />
                <span>.js</span>
              </button>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(customScript);
                  setCopiedScript(true);
                  setTimeout(() => setCopiedScript(false), 1800);
                }}
                className="flex items-center gap-1 px-2.5 py-1 text-slate-400 hover:text-white bg-slate-800/70 rounded border border-slate-700 text-xs"
              >
                {copiedScript ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                <span>{copiedScript ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

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
          <div className="p-3 bg-[#0d121c] border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="font-semibold text-white">Live Telemetry Stream</span>
              {isSessionActive && <span className="text-[10px] text-emerald-400 font-mono">Active</span>}
            </div>

            <button
              onClick={() => setLogs([])}
              className="p-1 text-slate-400 hover:text-rose-300 transition-colors"
              title="Clear console"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

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
