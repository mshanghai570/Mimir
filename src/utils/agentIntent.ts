import {
  BinarySample,
  DisassemblyFunction,
  InstructionLine,
  PatchRecord,
  AIProvider,
  AgentRoleConfig,
  AgentSkill,
} from '../types';
import { buildPatchRecord, PatchStrategy } from './arm64';
import { api } from '../services/api';

export interface IntentExecutionContext {
  binaries: BinarySample[];
  selectedBinary: BinarySample;
  selectedFunction: DisassemblyFunction;
  providers: AIProvider[];
  roles: AgentRoleConfig[];
  skills?: AgentSkill[];
  globalPrompt?: string;
  onSelectBinary?: (b: BinarySample) => void;
  onSelectFunction: (f: DisassemblyFunction) => void;
  onSelectInstruction?: (inst: InstructionLine) => void;
  onSetSearchFilter?: (term: string) => void;
  onApplyPatch?: (patch: PatchRecord) => void;
  onNavigateToFrida: (hookTarget?: string) => void;
  chatHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  onProgress?: (text: string) => void;
}

export interface IntentExecutionResult {
  roleTitle: string;
  text: string;
  isError?: boolean;
  actionTaken?: {
    type: 'navigated_function' | 'applied_patch' | 'configured_frida' | 'switched_binary' | 'listed_items';
    targetName?: string;
    targetAddress?: string;
    details?: string;
  };
  primaryMatch?: DisassemblyFunction;
  patchedInstruction?: InstructionLine;
}

function resolveSearchKeyword(lowerQuery: string): string {
  if (lowerQuery.includes('purchase') || lowerQuery.includes('store') || lowerQuery.includes('buy') || lowerQuery.includes('iap')) {
    return 'purchase';
  }
  if (lowerQuery.includes('receipt')) return 'receipt';
  if (lowerQuery.includes('license') || lowerQuery.includes('verify') || lowerQuery.includes('auth')) return 'license';
  if (lowerQuery.includes('device') || lowerQuery.includes('jailbreak') || lowerQuery.includes('safe')) return 'device';
  if (lowerQuery.includes('crypto') || lowerQuery.includes('enclave') || lowerQuery.includes('sha')) return 'crypto';
  if (lowerQuery.includes('biometric') || lowerQuery.includes('faceid') || lowerQuery.includes('lacontext')) return 'biometric';

  const cleaned = lowerQuery
    .replace(/(?:find|search|show|locate|where|is|are|list|the|related|functions?|routines?|methods?|please|\?|\.)/g, '')
    .trim();
  return cleaned || 'license';
}

export function resolveActiveSkillsText(roleConfig: AgentRoleConfig, skills?: AgentSkill[]): string[] {
  if (!skills || skills.length === 0) return [];
  return skills
    .filter((s) => s.enabled && (roleConfig.enabledSkills.includes(s.id) || !s.isBuiltin))
    .map((s) => `${s.name}: ${s.description} [Tools: ${s.tools.join(', ')}]`);
}

export async function executeNaturalLanguageIntent(
  rawQuery: string,
  ctx: IntentExecutionContext
): Promise<IntentExecutionResult> {
  const query = rawQuery.trim();
  const lower = query.toLowerCase();
  const progress = ctx.onProgress || (() => undefined);

  // 1. Semantic Function Search & Discovery across current binary (or all binaries if needed)
  const isSearch =
    lower.includes('find') ||
    lower.includes('search') ||
    lower.includes('where is') ||
    lower.includes('where are') ||
    lower.includes('locate') ||
    lower.includes('list function');

  if (
    isSearch &&
    (lower.includes('function') ||
      lower.includes('routine') ||
      lower.includes('method') ||
      lower.includes('purchase') ||
      lower.includes('store') ||
      lower.includes('receipt') ||
      lower.includes('license') ||
      lower.includes('crypto') ||
      lower.includes('jailbreak') ||
      lower.includes('auth') ||
      lower.includes('biometric'))
  ) {
    progress('Searching loaded binary functions and strings.');
    const keyword = resolveSearchKeyword(lower);

    const matchInBinary = (bin: BinarySample) =>
      bin.functions.filter((f) => {
        const corpus = `${f.name} ${f.demangledName || ''} ${f.strings.join(' ')} ${f.hlil}`.toLowerCase();
        if (keyword === 'purchase') {
          return corpus.includes('purchase') || corpus.includes('store') || corpus.includes('receipt') || corpus.includes('skpayment');
        }
        if (keyword === 'biometric') {
          return corpus.includes('biometric') || corpus.includes('lacontext') || corpus.includes('faceid');
        }
        return corpus.includes(keyword);
      });

    let targetBin = ctx.selectedBinary;
    let matches = matchInBinary(targetBin);

    if (matches.length === 0) {
      for (const bin of ctx.binaries) {
        const candidateMatches = matchInBinary(bin);
        if (candidateMatches.length > 0) {
          targetBin = bin;
          matches = candidateMatches;
          ctx.onSelectBinary?.(bin);
          break;
        }
      }
    }

    if (matches.length > 0) {
      const primary = matches[0];
      ctx.onSelectFunction(primary);
      if (primary.instructions[0]) ctx.onSelectInstruction?.(primary.instructions[0]);
      ctx.onSetSearchFilter?.(keyword);

      const listSummary = matches
        .map((m, idx) => `${idx + 1}. **\`${m.demangledName || m.name}\`**\n   Address: \`${m.address}\` · Size: ${m.size} bytes`)
        .join('\n\n');

      return {
        roleTitle: 'Lead Decompiler',
        text: `Discovered **${matches.length} function${matches.length > 1 ? 's' : ''}** associated with **"${keyword}"** in \`${targetBin.filename}\`:\n\n${listSummary}\n\nWorkspace focused on **\`${primary.demangledName || primary.name}\`** at \`${primary.address}\`.`,
        primaryMatch: primary,
        actionTaken: {
          type: 'navigated_function',
          targetName: primary.demangledName || primary.name,
          targetAddress: primary.address,
          details: `Focused ${primary.demangledName || primary.name} (${primary.address})`,
        },
      };
    }
  }

  // 2. Natural Language Smart Patching
  const isPatch =
    lower.includes('patch this function') ||
    lower.includes('patch function') ||
    lower.startsWith('/patch') ||
    lower.startsWith('/modify') ||
    (lower.includes('patch') &&
      (lower.includes('return true') ||
        lower.includes('return false') ||
        lower.includes('return 1') ||
        lower.includes('return 0') ||
        lower.includes('nop') ||
        lower.includes('invert')));

  if (isPatch) {
    progress('Preparing a deterministic patch plan for the selected function.');
    let targetFunc = ctx.selectedFunction;
    for (const f of ctx.selectedBinary.functions) {
      const demangledRoot = f.demangledName?.toLowerCase().split('(')[0] || '';
      if (lower.includes(f.name.toLowerCase()) || (demangledRoot && lower.includes(demangledRoot))) {
        targetFunc = f;
        break;
      }
    }

    const targetInst =
      targetFunc.instructions.find((i) => i.mnemonic.startsWith('B.') || i.mnemonic === 'CBZ' || i.mnemonic === 'CBNZ') ||
      targetFunc.instructions[Math.max(0, targetFunc.instructions.length - 3)] ||
      targetFunc.instructions[0];

    let strategy: PatchStrategy = 'invert_branch';
    if (lower.includes('return true') || lower.includes('return 1')) {
      strategy = 'force_return_true';
    } else if (lower.includes('return false') || lower.includes('return 0')) {
      strategy = 'force_return_false';
    } else if (lower.includes('nop')) {
      strategy = 'nop_sled';
    }

    const patch = buildPatchRecord({
      binaryName: ctx.selectedBinary.filename,
      functionName: targetFunc.demangledName || targetFunc.name,
      instruction: targetInst,
      strategy,
    });

    ctx.onApplyPatch?.(patch);
    ctx.onSelectFunction(targetFunc);
    ctx.onSelectInstruction?.(targetInst);

    return {
      roleTitle: 'Smart Binary Patcher',
      patchedInstruction: targetInst,
      text: `Synthesized and applied an ARM64 patch to **\`${targetFunc.demangledName || targetFunc.name}\`** at \`${targetInst.address}\`:\n\n\`\`\`arm64\n; Before: ${targetInst.rawBytes}\n${patch.originalMnemonic}\n\n; After:  ${patch.patchedBytes}\n${patch.patchedMnemonic}\n\`\`\`\n\n• **Strategy**: \`${patch.strategy.toUpperCase()}\`\n• **Safety**: 4-byte ARM64 alignment verified. Session disassembly updated.`,
      actionTaken: {
        type: 'applied_patch',
        targetName: targetFunc.demangledName || targetFunc.name,
        targetAddress: targetInst.address,
        details: `Patched ${targetInst.address} -> ${patch.patchedMnemonic}`,
      },
    };
  }

  // 3. Dynamic Frida Instrumentation
  if (lower.startsWith('/trace') || lower.includes('frida') || lower.includes('hook') || lower.includes('trace')) {
    progress('Preparing a Frida hook preview and opening the Frida workspace.');
    const funcName = ctx.selectedFunction.demangledName || ctx.selectedFunction.name;
    ctx.onNavigateToFrida(funcName);

    return {
      roleTitle: 'Dynamic Frida Tracer',
      text: `Prepared a real-time Frida instrumentation hook for **\`${funcName}\`** at \`${ctx.selectedFunction.address}\`.\n\n\`\`\`javascript\nInterceptor.attach(Module.findExportByName(null, "${ctx.selectedFunction.name}") || ptr("${ctx.selectedFunction.address}"), {\n  onEnter(args) {\n    console.log("[*] Intercepted ${ctx.selectedFunction.name}");\n  },\n  onLeave(retval) {\n    retval.replace(ptr("0x1"));\n  }\n});\n\`\`\`\n\nNavigated to the Frida Bridge tab to attach to your connected target.`,
      actionTaken: {
        type: 'configured_frida',
        targetName: funcName,
        targetAddress: ctx.selectedFunction.address,
        details: `Prepared Frida hook for ${funcName}`,
      },
    };
  }

  // 4. Multi-Agent AI Reasoning via Backend
  let targetRole: AgentRoleConfig['id'] = 'decompiler';
  if (lower.includes('vulnerability') || lower.includes('audit') || lower.includes('exploit')) {
    targetRole = 'auditor';
  } else if (lower.includes('demangle') || lower.includes('swift') || lower.includes('witness')) {
    targetRole = 'swift_demangler';
  } else if (lower.includes('patch')) {
    targetRole = 'patcher';
  }

  const roleConfig = ctx.roles.find((r) => r.id === targetRole) || ctx.roles[0];
  const assignedProvider = ctx.providers.find((p) => p.id === roleConfig.assignedProviderId) || ctx.providers[0];
  const activeSkills = resolveActiveSkillsText(roleConfig, ctx.skills);

  if (!assignedProvider) {
    return {
      roleTitle: 'Mimir',
      text: 'No AI provider is configured. Open Settings, add a provider, load its models, then try again.',
      isError: true,
    };
  }

  const selectedModel = roleConfig.assignedModel || assignedProvider.selectedModel;
  progress(`Sending your request to ${assignedProvider.name} using ${selectedModel}.`);

  if (!query.startsWith('/')) {
    const chatRes = await api.sendChat({
      providerId: assignedProvider.id,
      providerType: assignedProvider.type,
      providerUrl: assignedProvider.url,
      apiKey: assignedProvider.apiKey,
      model: selectedModel,
      messages: [
        ...(ctx.chatHistory || []).slice(-12),
        { role: 'user', content: query },
      ],
      systemPrompt: [
        ctx.globalPrompt,
        `You are ${roleConfig.title}, Mimir's conversational reverse-engineering agent.`,
        `Selected binary: ${ctx.selectedBinary.filename}; function: ${ctx.selectedFunction.demangledName || ctx.selectedFunction.name}; address: ${ctx.selectedFunction.address}.`,
        `HLIL:\n${ctx.selectedFunction.hlil}`,
      ].filter(Boolean).join('\n\n'),
      temperature: roleConfig.temperature,
    });

    if (chatRes.success && chatRes.message?.content) {
      progress('Received provider response.');
      return {
        roleTitle: `${roleConfig.title} (${selectedModel})`,
        text: chatRes.message.content,
      };
    }
    return {
      roleTitle: roleConfig.title,
      text: chatRes.error || 'The selected provider returned no response.',
      isError: true,
    };
  }

  const res = await api.dispatchRole({
    role: targetRole,
    agentConfig: {
      providerId: assignedProvider.id,
      providerType: assignedProvider?.type,
      providerUrl: assignedProvider?.url,
      apiKey: assignedProvider?.apiKey,
      model: roleConfig.assignedModel,
      customPrompt: roleConfig.customPrompt,
      globalPrompt: ctx.globalPrompt,
      temperature: roleConfig.temperature,
      skills: activeSkills,
    },
    objective: query,
    context: {
      binaryName: ctx.selectedBinary.filename,
      arch: ctx.selectedBinary.arch,
      functionName: ctx.selectedFunction.demangledName || ctx.selectedFunction.name,
      address: ctx.selectedFunction.address,
      hlil: ctx.selectedFunction.hlil,
      assembly: ctx.selectedFunction.instructions
        .map((i) => `${i.address}: ${i.rawBytes.padEnd(12)} ${i.mnemonic} ${i.operands}`)
        .join('\n'),
    },
  });

  if (res.success && res.output) {
    return {
      roleTitle: `${roleConfig.title} (${res.modelUsed || roleConfig.assignedModel})`,
      text: res.output,
    };
  }

  return {
    roleTitle: roleConfig.title,
    text: res.error || 'Failed to complete reverse engineering request. Check AI Provider settings.',
    isError: true,
  };
}
