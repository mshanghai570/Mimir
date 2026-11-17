import { InstructionLine, PatchRecord } from '../types';

export type PatchStrategy =
  | 'nop_sled'
  | 'invert_branch'
  | 'force_return_true'
  | 'force_return_false'
  | 'custom_hex';

export interface SynthesizedPatch {
  patchedBytes: string;
  patchedMnemonic: string;
  patchedOperands: string;
  strategyDescription: string;
  isValidHex: boolean;
  is4ByteAligned: boolean;
  isMultipleOf4: boolean;
  byteCount: number;
}

const DEFAULT_MACHO_TEXT_BASE = 0x100000000;

/**
 * Converts a Mach-O 64-bit virtual address (e.g. 0x100003fd0) to a raw file offset.
 */
export function vaToMachOFileOffset(address: string, textBase = DEFAULT_MACHO_TEXT_BASE): string {
  const clean = address.trim().replace(/^0x/i, '');
  const parsed = Number.parseInt(clean, 16);
  if (Number.isNaN(parsed)) return '0x0';
  const offset = parsed >= textBase ? parsed - textBase : parsed;
  return `0x${offset.toString(16)}`;
}

/**
 * Validates and normalizes space-separated hex bytes (e.g. "1F 20 03 D5").
 */
export function normalizeHexBytes(raw: string): { normalized: string; bytes: number[]; isValid: boolean } {
  const compact = raw.replace(/0x/gi, '').replace(/[^0-9a-fA-F]/g, '');
  if (compact.length === 0 || compact.length % 2 !== 0) {
    return { normalized: raw.trim().toUpperCase(), bytes: [], isValid: false };
  }
  const bytes: number[] = [];
  const pairs: string[] = [];
  for (let i = 0; i < compact.length; i += 2) {
    const pair = compact.slice(i, i + 2).toUpperCase();
    pairs.push(pair);
    bytes.push(Number.parseInt(pair, 16));
  }
  return { normalized: pairs.join(' '), bytes, isValid: true };
}

/**
 * Parses space-separated little-endian 4-byte ARM64 hex string into byte array.
 */
function parseArm64Bytes(rawBytes: string): number[] | null {
  const { bytes, isValid } = normalizeHexBytes(rawBytes);
  if (!isValid || bytes.length < 4) return null;
  return bytes.slice(0, 4);
}

function formatBytes(bytes: number[]): string {
  return bytes.map((b) => b.toString(16).padStart(2, '0').toUpperCase()).join(' ');
}

const INVERTED_COND_MAP: Record<string, string> = {
  'B.EQ': 'B.NE',
  'B.NE': 'B.EQ',
  'B.CS': 'B.CC',
  'B.CC': 'B.CS',
  'B.HS': 'B.LO',
  'B.LO': 'B.HS',
  'B.MI': 'B.PL',
  'B.PL': 'B.MI',
  'B.VS': 'B.VC',
  'B.VC': 'B.VS',
  'B.HI': 'B.LS',
  'B.LS': 'B.HI',
  'B.GE': 'B.LT',
  'B.LT': 'B.GE',
  'B.GT': 'B.LE',
  'B.LE': 'B.GT',
  'CBZ': 'CBNZ',
  'CBNZ': 'CBZ',
  'TBZ': 'TBNZ',
  'TBNZ': 'TBZ',
};

/**
 * Synthesizes an accurate ARM64 patch with real little-endian bit-flipping for branches.
 */
export function synthesizeArm64Patch(
  targetInst: InstructionLine,
  strategy: PatchStrategy,
  customHex = '1F 20 03 D5'
): SynthesizedPatch {
  let patchedBytes = '';
  let patchedMnemonic = '';
  let patchedOperands = '';
  let strategyDescription = '';
  let isValidHex = true;

  const mnem = targetInst.mnemonic.toUpperCase();

  switch (strategy) {
    case 'nop_sled': {
      patchedBytes = '1F 20 03 D5';
      patchedMnemonic = 'NOP';
      patchedOperands = '';
      strategyDescription =
        'Replaces the instruction with an ARM64 NOP (0xD503201F). Execution falls straight through into the next block.';
      break;
    }
    case 'invert_branch': {
      const origBytes = parseArm64Bytes(targetInst.rawBytes);
      const invertedMnem = INVERTED_COND_MAP[mnem];

      if (mnem.startsWith('B.') && invertedMnem && origBytes && (origBytes[3] & 0xfe) === 0x54) {
        // ARM64 B.cond encoding: bits[3:0] are condition code; bit 0 inverts the condition
        const next = [...origBytes];
        next[0] = next[0] ^ 0x01;
        patchedBytes = formatBytes(next);
        patchedMnemonic = invertedMnem;
        patchedOperands = targetInst.operands;
        strategyDescription = `Inverts ${mnem} to ${invertedMnem} by flipping condition bit 0 while preserving the exact 19-bit branch offset.`;
      } else if ((mnem === 'CBZ' || mnem === 'CBNZ') && invertedMnem && origBytes) {
        // ARM64 CBZ/CBNZ encoding: bit 24 (byte[3] bit 0) toggles CBZ (0) <-> CBNZ (1)
        const next = [...origBytes];
        next[3] = next[3] ^ 0x01;
        patchedBytes = formatBytes(next);
        patchedMnemonic = invertedMnem;
        patchedOperands = targetInst.operands;
        strategyDescription = `Inverts ${mnem} to ${invertedMnem} by toggling bit 24 while preserving target register and branch displacement.`;
      } else if ((mnem === 'TBZ' || mnem === 'TBNZ') && invertedMnem && origBytes) {
        const next = [...origBytes];
        next[3] = next[3] ^ 0x01;
        patchedBytes = formatBytes(next);
        patchedMnemonic = invertedMnem;
        patchedOperands = targetInst.operands;
        strategyDescription = `Inverts ${mnem} to ${invertedMnem} by toggling bit 24.`;
      } else {
        patchedBytes = '1F 20 03 D5';
        patchedMnemonic = 'NOP';
        patchedOperands = '';
        strategyDescription =
          'Selected instruction is not a conditional branch; safely falling back to ARM64 NOP.';
      }
      break;
    }
    case 'force_return_true': {
      patchedBytes = '20 00 80 D2 C0 03 5F D6';
      patchedMnemonic = 'MOV X0, #1; RET';
      patchedOperands = '';
      strategyDescription =
        'Synthesizes MOV X0, #1 (0xD2800020) followed by RET (0xD65F03C0) (8 bytes). Immediately returns boolean true (1).';
      break;
    }
    case 'force_return_false': {
      patchedBytes = '00 00 80 D2 C0 03 5F D6';
      patchedMnemonic = 'MOV X0, #0; RET';
      patchedOperands = '';
      strategyDescription =
        'Synthesizes MOV X0, #0 (0xD2800000) followed by RET (0xD65F03C0) (8 bytes). Immediately returns boolean false (0).';
      break;
    }
    case 'custom_hex': {
      const parsed = normalizeHexBytes(customHex);
      patchedBytes = parsed.normalized;
      isValidHex = parsed.isValid;
      patchedMnemonic = 'CUSTOM';
      patchedOperands = parsed.isValid ? `${parsed.bytes.length}B Raw Patch` : 'Invalid Hex Sequence';
      strategyDescription = 'Direct little-endian machine-code byte substitution in __TEXT,__text segment.';
      break;
    }
  }

  const cleanAddr = targetInst.address.replace(/^0x/i, '');
  const addrNum = Number.parseInt(cleanAddr, 16);
  const is4ByteAligned = !Number.isNaN(addrNum) && addrNum % 4 === 0;
  const byteCount = patchedBytes ? patchedBytes.split(/\s+/).filter(Boolean).length : 0;
  const isMultipleOf4 = byteCount > 0 && byteCount % 4 === 0;

  return {
    patchedBytes,
    patchedMnemonic,
    patchedOperands,
    strategyDescription,
    isValidHex,
    is4ByteAligned,
    isMultipleOf4,
    byteCount,
  };
}

/**
 * Helper to create a PatchRecord cleanly.
 */
export function buildPatchRecord(params: {
  binaryName: string;
  functionName: string;
  instruction: InstructionLine;
  strategy: PatchStrategy;
  customHex?: string;
}): PatchRecord {
  const synth = synthesizeArm64Patch(params.instruction, params.strategy, params.customHex);
  return {
    id: `patch_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    binaryName: params.binaryName,
    functionName: params.functionName,
    address: params.instruction.address,
    originalBytes: params.instruction.rawBytes,
    patchedBytes: synth.patchedBytes,
    originalMnemonic: `${params.instruction.mnemonic} ${params.instruction.operands}`.trim(),
    patchedMnemonic: `${synth.patchedMnemonic} ${synth.patchedOperands}`.trim(),
    strategy: params.strategy,
    verifiedArm64: synth.isValidHex && synth.is4ByteAligned && synth.isMultipleOf4,
    appliedAt: new Date().toLocaleTimeString(),
  };
}
