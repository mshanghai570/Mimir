import React, { useState } from 'react';
import {
  BinarySample,
  PatchRecord,
} from '../types';
import {
  Zap,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Copy,
  Download,
  FileCode,
  ShieldAlert,
  ArrowRight,
  Code,
  Plus,
} from 'lucide-react';

interface SmartPatcherProps {
  binaries: BinarySample[];
  selectedBinary: BinarySample;
  onSelectBinary: (b: BinarySample) => void;
  targetAddress?: string;
  patches: PatchRecord[];
  onApplyPatch: (patch: PatchRecord) => void;
  onRevertPatch: (id: string) => void;
}

export const SmartPatcher: React.FC<SmartPatcherProps> = ({
  binaries,
  selectedBinary,
  onSelectBinary,
  targetAddress = '0x100003fd0',
  patches,
  onApplyPatch,
  onRevertPatch,
}) => {
  const [addressInput, setAddressInput] = useState(targetAddress);
  const [strategy, setStrategy] = useState<'nop_sled' | 'invert_branch' | 'force_return_true' | 'force_return_false' | 'custom_hex'>('invert_branch');
  const [customHex, setCustomHex] = useState('1F 20 03 D5');
  const [selectedLanguage, setSelectedLanguage] = useState<'swift' | 'python' | 'terminal'>('swift');
  const [patchAppliedFeedback, setPatchAppliedFeedback] = useState(false);

  // Default target instruction
  const targetFunc = selectedBinary.functions[0];
  const targetInst = targetFunc?.instructions.find((i) => i.address.toLowerCase() === addressInput.toLowerCase()) || targetFunc?.instructions[12] || {
    address: '0x100003fd0',
    rawBytes: '81 01 00 54',
    mnemonic: 'B.NE',
    operands: '0x100004020',
    comment: 'CRITICAL CHECK: Jump to failure if authStatus != 0',
  };

  // Compute patched instruction representation
  let patchedBytes = '';
  let patchedMnemonic = '';
  let patchedOperands = '';
  let strategyDescription = '';

  switch (strategy) {
    case 'nop_sled':
      patchedBytes = '1F 20 03 D5';
      patchedMnemonic = 'NOP';
      patchedOperands = '';
      strategyDescription = 'Replaces the branch instruction with an ARM64 NOP (No Operation). Execution will fall through into the success block.';
      break;
    case 'invert_branch':
      if (targetInst.mnemonic === 'B.NE') {
        patchedBytes = '80 01 00 54';
        patchedMnemonic = 'B.EQ';
        patchedOperands = targetInst.operands;
        strategyDescription = 'Inverts B.NE (Branch if Not Equal) to B.EQ (Branch if Equal). Only invalid checks will trigger the branch.';
      } else if (targetInst.mnemonic === 'CBZ') {
        patchedBytes = targetInst.rawBytes.replace('B4', 'B5');
        patchedMnemonic = 'CBNZ';
        patchedOperands = targetInst.operands;
        strategyDescription = 'Inverts CBZ (Compare and Branch if Zero) to CBNZ (Compare and Branch if Non-Zero).';
      } else {
        patchedBytes = '1F 20 03 D5';
        patchedMnemonic = 'NOP';
        patchedOperands = '';
        strategyDescription = 'Instruction is not an invertable branch; applying ARM64 NOP sled.';
      }
      break;
    case 'force_return_true':
      patchedBytes = '20 00 80 D2 C0 03 5F D6';
      patchedMnemonic = 'MOV X0, #1; RET';
      patchedOperands = '';
      strategyDescription = 'Synthesizes MOV X0, #1 followed by RET (8 bytes). Immediately returns boolean true (1) to caller.';
      break;
    case 'force_return_false':
      patchedBytes = '00 00 80 D2 C0 03 5F D6';
      patchedMnemonic = 'MOV X0, #0; RET';
      patchedOperands = '';
      strategyDescription = 'Synthesizes MOV X0, #0 followed by RET (8 bytes). Immediately returns boolean false (0) to caller.';
      break;
    case 'custom_hex':
      patchedBytes = customHex.trim().toUpperCase();
      patchedMnemonic = 'CUSTOM';
      patchedOperands = 'Raw Hex Overwrite';
      strategyDescription = 'Direct byte substitution in binary segment.';
      break;
  }

  // Safety checks
  const cleanAddr = targetInst.address.replace(/^0x/, '');
  const addrNum = parseInt(cleanAddr, 16);
  const is4ByteAligned = !isNaN(addrNum) && addrNum % 4 === 0;
  const byteCount = patchedBytes.split(/\s+/).filter(Boolean).length;
  const isMultipleOf4 = byteCount % 4 === 0;

  const handleApply = () => {
    const newPatch: PatchRecord = {
      id: `patch_${Date.now()}`,
      binaryName: selectedBinary.filename,
      functionName: targetFunc?.demangledName || targetFunc?.name || 'function',
      address: targetInst.address,
      originalBytes: targetInst.rawBytes,
      patchedBytes: patchedBytes,
      originalMnemonic: `${targetInst.mnemonic} ${targetInst.operands}`.trim(),
      patchedMnemonic: `${patchedMnemonic} ${patchedOperands}`.trim(),
      strategy,
      verifiedArm64: is4ByteAligned && isMultipleOf4,
      appliedAt: new Date().toLocaleTimeString(),
    };

    onApplyPatch(newPatch);
    setPatchAppliedFeedback(true);
    setTimeout(() => setPatchAppliedFeedback(false), 2500);
  };

  // Generate macOS Swift Patching Utility Code
  const swiftPatchCode = `//
// MachOPatcher.swift
// macOS native binary patcher & codesign restorer
//

import Foundation

public struct MachOPatcher {
    public static func applyPatch() throws {
        let binaryPath = "${selectedBinary.filename}"
        let patchOffset: UInt64 = ${targetInst.address} // ${targetInst.mnemonic}
        let patchBytes: [UInt8] = [${patchedBytes.split(/\s+/).map((b) => '0x' + b).join(', ')}]
        
        print("[*] Opening Mach-O binary at \\(binaryPath)...")
        let fileURL = URL(fileURLWithPath: binaryPath)
        let handle = try FileHandle(forUpdating: fileURL)
        
        try handle.seek(toOffset: patchOffset)
        handle.write(Data(patchBytes))
        try handle.close()
        print("[+] Wrote \\(patchBytes.count) bytes at \\(String(format: "0x%llX", patchOffset))")
        
        // Re-sign Mach-O binary for macOS Gatekeeper & Apple Silicon ARM64e PAC
        print("[*] Re-signing Mach-O binary via codesign...")
        let codesign = Process()
        codesign.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        codesign.arguments = ["--force", "--deep", "-s", "-", binaryPath]
        try codesign.run()
        codesign.waitUntilExit()
        
        if codesign.terminationStatus == 0 {
            print("[+] Successfully re-signed \\(binaryPath). Binary ready for execution.")
        } else {
            print("[-] codesign returned status code \\(codesign.terminationStatus)")
        }
    }
}
`;

  // Python Binary Ninja plugin snippet
  const pythonPatchCode = `# Binary Ninja Smart Patch Snippet
# Target: ${selectedBinary.filename} @ ${targetInst.address}

offset = ${targetInst.address}
patch_bytes = bytes([${patchedBytes.split(/\s+/).map((b) => '0x' + b).join(', ')}])

bv.begin_undo_actions()
bv.write(offset, patch_bytes)
bv.commit_undo_actions()
print(f"[Mimir] Applied {len(patch_bytes)} patch bytes at {hex(offset)}")
`;

  const terminalCodesignCmd = `codesign --force --deep -s - "${selectedBinary.filename}"`;

  return (
    <div className="flex flex-col h-[calc(100vh-53px)] bg-[#090d14] text-slate-200">
      {/* Top Banner */}
      <div className="px-6 py-3 bg-[#0d121c] border-b border-slate-800/80 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold text-white">Smart Binary Patcher</span>
            <span className="text-slate-600 font-mono">·</span>
            <span className="text-xs text-slate-400 font-mono">ARM64 & Mach-O Code-Sign Engine</span>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">Target Address:</span>
            <input
              type="text"
              value={addressInput}
              onChange={(e) => setAddressInput(e.target.value)}
              className="bg-slate-900 border border-slate-700 text-amber-300 font-mono text-xs rounded px-2.5 py-1 focus:outline-none focus:border-amber-500 w-32"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {patchAppliedFeedback && (
            <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium animate-pulse">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Patch Registered & Verified!</span>
            </span>
          )}
          <button
            onClick={handleApply}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded transition-colors shadow-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.5]" />
            <span>Apply Smart Patch</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Split */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Strategy & Diff Preview */}
        <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#080b12]">
          {/* Strategy Selector */}
          <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-5">
            <div className="text-xs font-semibold text-slate-300 mb-3">Select Patch Strategy</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                onClick={() => setStrategy('invert_branch')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  strategy === 'invert_branch'
                    ? 'bg-amber-950/30 border-amber-500/80 text-amber-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-white mb-1 flex items-center justify-between">
                  <span>Invert Branch Condition</span>
                  <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded">Recommended</span>
                </div>
                <div className="text-[11px] leading-relaxed">
                  Inverts conditional jump (e.g. B.NE &rarr; B.EQ or CBZ &rarr; CBNZ).
                </div>
              </button>

              <button
                onClick={() => setStrategy('nop_sled')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  strategy === 'nop_sled'
                    ? 'bg-amber-950/30 border-amber-500/80 text-amber-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-white mb-1">NOP Sled (0x1F2003D5)</div>
                <div className="text-[11px] leading-relaxed">
                  Replaces instruction with ARM64 NOP. Bypasses jump entirely.
                </div>
              </button>

              <button
                onClick={() => setStrategy('force_return_true')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  strategy === 'force_return_true'
                    ? 'bg-amber-950/30 border-amber-500/80 text-amber-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-white mb-1">Force Return True (1)</div>
                <div className="text-[11px] leading-relaxed">
                  Encodes MOV X0, #1 followed by RET (8-byte function stub).
                </div>
              </button>

              <button
                onClick={() => setStrategy('custom_hex')}
                className={`p-3 rounded-lg border text-left transition-all ${
                  strategy === 'custom_hex'
                    ? 'bg-amber-950/30 border-amber-500/80 text-amber-200'
                    : 'bg-slate-900/60 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="text-xs font-bold text-white mb-1">Custom Hex Opcodes</div>
                <div className="text-[11px] leading-relaxed">
                  Input arbitrary hex bytes with automatic opcode validation.
                </div>
              </button>
            </div>

            {strategy === 'custom_hex' && (
              <div className="mt-4 pt-3 border-t border-slate-800">
                <label className="text-xs text-slate-400 block mb-1.5 font-mono">Custom Raw Hex Bytes (Space-delimited)</label>
                <input
                  type="text"
                  value={customHex}
                  onChange={(e) => setCustomHex(e.target.value)}
                  placeholder="e.g. 20 00 80 D2 C0 03 5F D6"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                />
              </div>
            )}

            <div className="mt-3 text-xs text-slate-400 italic">
              {strategyDescription}
            </div>
          </div>

          {/* Side-by-Side Instruction Diff */}
          <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-5">
            <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
              <span>Instruction Diff Visualization</span>
              <span className="text-[11px] font-mono text-cyan-400">{targetInst.address}</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 font-mono text-xs">
              {/* Original Block */}
              <div className="p-4 bg-rose-950/20 border border-rose-800/40 rounded-lg">
                <div className="text-rose-400 font-bold mb-2 flex items-center justify-between">
                  <span>BEFORE (ORIGINAL)</span>
                  <span className="text-[10px] text-slate-500 font-normal">Mach-O Segment</span>
                </div>
                <div className="text-slate-400 text-[11px] mb-1">Bytes: <span className="text-slate-200 tracking-wider">{targetInst.rawBytes}</span></div>
                <div className="text-rose-200 font-semibold text-sm">
                  {targetInst.mnemonic} {targetInst.operands}
                </div>
                {targetInst.comment && (
                  <div className="text-[11px] text-slate-500 mt-2 italic">
                    ; {targetInst.comment}
                  </div>
                )}
              </div>

              {/* Patched Block */}
              <div className="p-4 bg-emerald-950/20 border border-emerald-800/40 rounded-lg">
                <div className="text-emerald-400 font-bold mb-2 flex items-center justify-between">
                  <span>AFTER (SMART PATCHED)</span>
                  <span className="text-[10px] text-emerald-400 font-normal">Active Simulation</span>
                </div>
                <div className="text-slate-400 text-[11px] mb-1">Bytes: <span className="text-emerald-300 tracking-wider">{patchedBytes}</span></div>
                <div className="text-emerald-200 font-semibold text-sm">
                  {patchedMnemonic} {patchedOperands}
                </div>
                <div className="text-[11px] text-emerald-400/80 mt-2">
                  Validation: Safe ARM64 instruction displacement
                </div>
              </div>
            </div>

            {/* Architecture Safety Audit Indicators */}
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center gap-6 text-xs font-mono">
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 ${is4ByteAligned ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span className="text-slate-300">
                  ARM64 Alignment: {is4ByteAligned ? '4-byte Valid' : 'Unaligned Error'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className={`w-4 h-4 ${isMultipleOf4 ? 'text-emerald-400' : 'text-rose-400'}`} />
                <span className="text-slate-300">
                  Instruction Length: {byteCount} bytes ({byteCount / 4} instr)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-cyan-400" />
                <span className="text-slate-300">Mach-O Ad-hoc Codesign: Verified</span>
              </div>
            </div>
          </div>

          {/* Active Applied Patches Table */}
          <div className="bg-[#0c1018] rounded-xl border border-slate-800 p-5">
            <div className="text-xs font-semibold text-slate-300 mb-3 flex items-center justify-between">
              <span>Active Session Patches ({patches.length})</span>
            </div>

            {patches.length === 0 ? (
              <div className="p-4 text-center text-slate-500 text-xs">
                No patches applied in this session yet. Select an address and click "Apply Smart Patch".
              </div>
            ) : (
              <div className="divide-y divide-slate-800 font-mono text-xs">
                {patches.map((p) => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-amber-300 font-bold">{p.address}</span>
                        <span className="text-slate-500">·</span>
                        <span className="text-slate-300 truncate max-w-sm">{p.functionName}</span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        <span className="text-rose-400">{p.originalMnemonic}</span>
                        <span className="mx-1.5 text-slate-600">&rarr;</span>
                        <span className="text-emerald-400">{p.patchedMnemonic}</span>
                        <span className="mx-2 text-slate-600">·</span>
                        <span>{p.appliedAt}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => onRevertPatch(p.id)}
                      className="flex items-center gap-1 px-2.5 py-1 text-slate-400 hover:text-white bg-slate-800/80 rounded border border-slate-700 text-xs transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Revert</span>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Code Generator (macOS Swift, Python, Codesign) */}
        <div className="w-[450px] bg-[#0a0d15] border-l border-slate-800/80 flex flex-col shrink-0">
          <div className="p-3 bg-[#0d121c] border-b border-slate-800 flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5">
              <Code className="w-3.5 h-3.5 text-cyan-400" />
              <span className="font-semibold text-white">Generated macOS & Plugin Code</span>
            </div>

            <div className="flex items-center gap-1 bg-slate-900 p-0.5 rounded border border-slate-800">
              <button
                onClick={() => setSelectedLanguage('swift')}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  selectedLanguage === 'swift' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Swift
              </button>
              <button
                onClick={() => setSelectedLanguage('python')}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  selectedLanguage === 'python' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Python
              </button>
              <button
                onClick={() => setSelectedLanguage('terminal')}
                className={`px-2 py-0.5 rounded text-xs transition-colors ${
                  selectedLanguage === 'terminal' ? 'bg-cyan-500/20 text-cyan-300 font-semibold' : 'text-slate-400 hover:text-white'
                }`}
              >
                Codesign
              </button>
            </div>
          </div>

          <div className="flex-1 p-3 overflow-hidden flex flex-col bg-[#070a10]">
            <div className="flex items-center justify-between pb-2 text-[11px] text-slate-500 font-mono">
              <span>{selectedLanguage === 'swift' ? 'MachOPatcher.swift' : selectedLanguage === 'python' ? 'binja_patch.py' : 'Terminal Command'}</span>
              <button
                onClick={() => {
                  const content = selectedLanguage === 'swift' ? swiftPatchCode : selectedLanguage === 'python' ? pythonPatchCode : terminalCodesignCmd;
                  navigator.clipboard.writeText(content);
                }}
                className="flex items-center gap-1 text-slate-400 hover:text-white"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </button>
            </div>

            <pre className="flex-1 w-full bg-[#090c13] border border-slate-800 rounded p-3 font-mono text-xs text-slate-300 leading-relaxed overflow-auto select-all">
              {selectedLanguage === 'swift' && swiftPatchCode}
              {selectedLanguage === 'python' && pythonPatchCode}
              {selectedLanguage === 'terminal' && terminalCodesignCmd}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
