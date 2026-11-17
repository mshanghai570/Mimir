import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI } from '@google/genai';
import { ProviderStore } from './server/providerStore';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const ACCESS_TOKEN = process.env.MIMIR_ACCESS_TOKEN?.trim() || '';
const ALLOW_PRIVATE_OUTBOUND = process.env.MIMIR_ALLOW_PRIVATE_OUTBOUND === 'true';
const providerStore = new ProviderStore();

app.use(express.json({ limit: '15mb' }));
if (!['127.0.0.1', '::1', 'localhost'].includes(HOST) && !ACCESS_TOKEN) {
  throw new Error('Refusing non-loopback HOST without MIMIR_ACCESS_TOKEN');
}
app.use('/api', (req, res, next) => {
  if (req.path === '/health' || !ACCESS_TOKEN) return next();
  const supplied = req.get('authorization')?.replace(/^Bearer\s+/i, '') || '';
  if (supplied !== ACCESS_TOKEN) {
    return res.status(401).json({ success: false, error: 'Mimir access token required.' });
  }
  return next();
});

function validateOutboundUrl(raw: string): string {
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('Only HTTP(S) provider and skill URLs are allowed.');
  }
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateHost =
    hostname === 'localhost' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    /^127\./.test(hostname) ||
    /^10\./.test(hostname) ||
    /^192\.168\./.test(hostname) ||
    /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname) ||
    /^169\.254\./.test(hostname);
  if (privateHost && !['127.0.0.1', '::1', 'localhost'].includes(HOST) && !ALLOW_PRIVATE_OUTBOUND) {
    throw new Error('Private outbound URLs are disabled when the server is exposed beyond localhost.');
  }
  return parsed.toString().replace(/\/$/, '');
}

// Initialize Google GenAI client if GEMINI_API_KEY is present
function getGeminiClient(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

let ai: GoogleGenAI | null = getGeminiClient();

function normalizeOpenAIEndpoint(url: string, suffix: 'models' | 'chat/completions'): string {
  const targetBase = url.trim().replace(/\/+$/, '');
  if (
    targetBase.endsWith('/v1') ||
    targetBase.endsWith('/api') ||
    targetBase.includes('/v1/') ||
    targetBase.endsWith('/openai/v1')
  ) {
    return `${targetBase}/${suffix}`;
  }
  return `${targetBase}/v1/${suffix}`;
}

async function callWithRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const status = err?.status || err?.code;
      const isRetryable =
        status === 429 ||
        status === 503 ||
        status === 502 ||
        err?.name === 'AbortError' ||
        /timeout|rate limit|temporarily/i.test(err?.message || '');

      if (!isRetryable || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 450 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

function parseProviderError(err: any): { status: number; message: string } {
  const rawMessage = err?.message || 'Upstream AI provider error';
  const status = typeof err?.status === 'number' ? err.status : 500;

  if (status === 403 || /PERMISSION_DENIED|API_KEY_INVALID/i.test(rawMessage)) {
    return {
      status: 403,
      message: 'API key rejected or missing permissions. Verify your key in Settings > Secrets or provider configuration.',
    };
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota/i.test(rawMessage)) {
    return {
      status: 429,
      message: 'Rate limit or quota exceeded for selected model. Switch to gemini-4-hydrogen or verify billing tier.',
    };
  }
  if (status === 404 || /NOT_FOUND/i.test(rawMessage)) {
    return {
      status: 404,
      message: `Requested model was not found (${rawMessage}). Select a valid model in Settings.`,
    };
  }
  return { status: status >= 400 && status < 600 ? status : 500, message: rawMessage };
}

app.get('/api/providers', (_req, res) => {
  try {
    return res.json({ success: true, providers: providerStore.publicList() });
  } catch (error: any) {
    return res.status(500).json({ success: false, providers: [], error: error.message || 'Provider store unavailable' });
  }
});

app.put('/api/providers/:id', (req, res) => {
  try {
    const body = req.body || {};
    const id = String(req.params.id);
    if (body.id && body.id !== id) return res.status(400).json({ success: false, error: 'Provider ID mismatch.' });
    if (!body.name || !body.type) return res.status(400).json({ success: false, error: 'Provider name and type are required.' });
    const provider = providerStore.upsert({
      id,
      name: String(body.name).trim(),
      type: String(body.type),
      url: String(body.url || '').trim(),
      apiKey: typeof body.apiKey === 'string' ? body.apiKey : '',
      availableModels: Array.isArray(body.availableModels) ? body.availableModels : [],
      selectedModel: String(body.selectedModel || ''),
      systemPrompt: String(body.systemPrompt || ''),
      isActive: body.isActive !== false,
      lastFetchedAt: body.lastFetchedAt ? String(body.lastFetchedAt) : undefined,
    });
    return res.json({ success: true, provider });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Provider save failed' });
  }
});

app.delete('/api/providers/:id', (req, res) => {
  try {
    return res.json({ success: true, removed: providerStore.remove(String(req.params.id)) });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message || 'Provider delete failed' });
  }
});

// Health check endpoint
app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
    timestamp: new Date().toISOString(),
  });
});

// ==========================================
// 1. AI Providers & Model Discovery Endpoint
// ==========================================
app.post('/api/ai/models', async (req, res) => {
  try {
    const { url, apiKey, providerType, providerId } = req.body;
    const storedProvider = providerId ? providerStore.get(String(providerId)) : undefined;
    const effectiveUrl = storedProvider?.url || url;
    const effectiveApiKey = storedProvider?.apiKey || apiKey;
    const effectiveProviderType = storedProvider?.type || providerType;

    if (effectiveProviderType === 'gemini' || (!effectiveUrl && !effectiveProviderType)) {
      const geminiModels = [
        { id: 'gemini-4-hydrogen', name: 'Gemini 4 Hydrogen (Agentic & Fast)', provider: 'Google Gemini', contextWindow: 1048576 },
        { id: 'gemini-4-argon', name: 'Gemini 4 Argon (Advanced Code & RE Reasoning)', provider: 'Google Gemini', contextWindow: 2097152 },
        { id: 'gemini-4-carbon', name: 'Gemini 4 Carbon (Deep Binary Security Audit)', provider: 'Google Gemini', contextWindow: 2097152 },
        { id: 'gemini-3.1-flash-lite', name: 'Gemini 3.1 Flash Lite (Ultra Low Latency)', provider: 'Google Gemini', contextWindow: 524288 },
      ];
      return res.json({ success: true, models: geminiModels });
    }

    if (!effectiveUrl) {
      return res.status(400).json({ success: false, error: 'Provider URL is required' });
    }

    const targetBase = validateOutboundUrl(effectiveUrl.trim());
    const modelsEndpoint = normalizeOpenAIEndpoint(targetBase, 'models');

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (effectiveApiKey) {
      headers['Authorization'] = `Bearer ${effectiveApiKey.trim()}`;
    }

    let fetchResponse: Response | null = null;
    try {
      fetchResponse = await fetch(modelsEndpoint, { headers, signal: AbortSignal.timeout(9000) });
    } catch {
      try {
        if (targetBase.includes('11434') || targetBase.includes('ollama')) {
          const ollamaRes = await fetch(`${targetBase.replace(/\/v1$/, '')}/api/tags`, { signal: AbortSignal.timeout(6000) });
          if (ollamaRes.ok) {
            const ollamaData = (await ollamaRes.json()) as { models?: Array<{ name: string; size?: number }> };
            const models = (ollamaData.models || []).map((m) => ({
              id: m.name,
              name: `${m.name} (Ollama Local)`,
              provider: 'Ollama',
              contextWindow: 32768,
            }));
            return res.json({ success: true, models });
          }
        }
      } catch {
        // Ignore and fall through to standard catalog
      }
    }

    if (fetchResponse && fetchResponse.ok) {
      const data = (await fetchResponse.json()) as { data?: Array<{ id: string; owned_by?: string }> };
      if (Array.isArray(data.data)) {
        const models = data.data.map((m) => ({
          id: m.id,
          name: m.id,
          provider: m.owned_by || 'OpenAI Compatible',
          contextWindow: 128000,
        }));
        return res.json({ success: true, models });
      }
    }

    const fallbackList = [
      { id: 'gpt-4o', name: 'gpt-4o', provider: 'OpenAI Compatible' },
      { id: 'gpt-4o-mini', name: 'gpt-4o-mini', provider: 'OpenAI Compatible' },
      { id: 'claude-3-7-sonnet', name: 'claude-3-7-sonnet', provider: 'Anthropic / ACP' },
      { id: 'deepseek-chat', name: 'deepseek-chat (V3)', provider: 'DeepSeek' },
      { id: 'deepseek-reasoner', name: 'deepseek-reasoner (R1)', provider: 'DeepSeek' },
      { id: 'qwen2.5-coder-32b', name: 'qwen2.5-coder-32b', provider: 'Local / Ollama' },
    ];
    return res.json({
      success: true,
      models: fallbackList,
      note: 'Endpoint reachable or restricted; loaded standard compatible model catalog.',
    });
  } catch (error: any) {
    console.error('Error fetching models:', error);
    return res.status(500).json({ success: false, error: error.message || 'Failed to connect to provider endpoint' });
  }
});

// ==========================================
// 2. Universal AI Chat / Inference Endpoint
// ==========================================
app.post('/api/ai/chat', async (req, res) => {
  try {
    const { providerId, providerType, providerUrl, apiKey, model, messages, systemPrompt, temperature } = req.body;
    const storedProvider = providerId ? providerStore.get(String(providerId)) : undefined;
    const effectiveProviderType = storedProvider?.type || providerType;
    const effectiveProviderUrl = storedProvider?.url || providerUrl;
    const effectiveApiKey = storedProvider?.apiKey || apiKey;

    // Route 1: Google Gemini via @google/genai server-side SDK
    if (effectiveProviderType === 'gemini' || model?.startsWith('gemini') || (!effectiveProviderUrl && process.env.GEMINI_API_KEY)) {
      if (!ai) ai = getGeminiClient();
      if (!ai) {
        return res.status(400).json({
          success: false,
          error: 'Gemini API Key is not configured in Settings > Secrets. Configure GEMINI_API_KEY or select an OpenAI-compatible provider.',
        });
      }

      const selectedModel = model || 'gemini-4-hydrogen';
      const structuredContents =
        Array.isArray(messages) && messages.length > 0
          ? messages.map((m: { role: string; content: string }) => ({
              role: m.role === 'assistant' || m.role === 'model' ? 'model' : 'user',
              parts: [{ text: m.content }],
            }))
          : [{ role: 'user', parts: [{ text: 'Analyze binary' }] }];

      const genResponse = await callWithRetry(() =>
        ai!.models.generateContent({
          model: selectedModel,
          contents: structuredContents,
          config: {
            systemInstruction:
              systemPrompt ||
              'You are Mimir, an elite Binary Ninja and Frida reverse engineering agent specialized in binary disassembly, HLIL decompiler analysis, ARM64/x86_64 safe patching, and mobile dynamic instrumentation.',
          },
        })
      );

      return res.json({
        success: true,
        message: {
          role: 'assistant',
          content: genResponse.text || 'No response generated.',
        },
      });
    }

    // Route 2: OpenAI-Compatible Endpoint
    if (!effectiveProviderUrl) {
      return res.status(400).json({ success: false, error: 'Provider URL is missing for non-Gemini provider.' });
    }

    const chatEndpoint = normalizeOpenAIEndpoint(validateOutboundUrl(effectiveProviderUrl), 'chat/completions');
    const outboundMessages = [];
    if (systemPrompt) {
      outboundMessages.push({ role: 'system', content: systemPrompt });
    }
    if (Array.isArray(messages)) {
      outboundMessages.push(...messages);
    }

    const payload = {
      model: model || 'gpt-4o',
      messages: outboundMessages,
      temperature: typeof temperature === 'number' ? temperature : 0.2,
      max_tokens: 3000,
    };

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveApiKey) {
      headers['Authorization'] = `Bearer ${effectiveApiKey.trim()}`;
    }

    const aiRes = await callWithRetry(() =>
      fetch(chatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(60000),
      })
    );

    if (!aiRes.ok) {
      const errText = await aiRes.text();
      return res.status(aiRes.status).json({
        success: false,
        error: `Provider error (${aiRes.status}): ${errText.slice(0, 500)}`,
      });
    }

    const json = (await aiRes.json()) as any;
    const reply = json.choices?.[0]?.message?.content || 'No text output returned by provider.';

    return res.json({
      success: true,
      message: {
        role: 'assistant',
        content: reply,
      },
      usage: json.usage,
    });
  } catch (error: any) {
    console.error('Chat API Error:', error);
    const parsed = parseProviderError(error);
    return res.status(parsed.status).json({ success: false, error: parsed.message });
  }
});

// ==========================================
// 3. Multi-Agent Task Dispatcher
// ==========================================
app.post('/api/ai/dispatch-role', async (req, res) => {
  try {
    const { role, agentConfig, objective, context } = req.body;
    const storedProvider = agentConfig?.providerId ? providerStore.get(String(agentConfig.providerId)) : undefined;
    const effectiveAgentConfig = storedProvider
      ? { ...agentConfig, providerType: storedProvider.type, providerUrl: storedProvider.url, apiKey: storedProvider.apiKey }
      : agentConfig;
    const safeRole = typeof role === 'string' ? role : 'decompiler';
    const safeContext = context || {};

    let roleSystem = '';
    let roleInstructions = '';

    switch (safeRole) {
      case 'decompiler':
        roleSystem =
          'You are the Lead Decompiler & Reverse Engineering Architect for Binary Ninja. Your goal is to analyze High-Level Intermediate Language (HLIL) and assembly, identify data structures, recover algorithm semantics, and document function interfaces.';
        roleInstructions =
          'Analyze the decompiled code and disassembly. Identify the purpose of the function, parameter types, state mutations, and key cryptographic or validation logic.';
        break;
      case 'patcher':
        roleSystem =
          'You are the Smart Binary Patcher Agent for Binary Ninja. Your goal is to synthesize safe, surgical ARM64 / x86_64 machine code patches, invert conditional branches, bypass checks, and verify instruction alignments and Mach-O code signatures.';
        roleInstructions =
          'Examine the target verification check. Provide exact original and patched instruction encodings (little-endian hex), describe the patch strategy, and provide Mach-O file offset & codesign commands.';
        break;
      case 'frida_tracer':
        roleSystem =
          'You are the Dynamic Frida Instrumentation Specialist. Your goal is to generate real-time Frida hooks for iOS and Android processes, trace function calls, inspect Objective-C/Swift method signatures, intercept arguments, and extract runtime keys.';
        roleInstructions =
          'Write a ready-to-inject Frida JavaScript script with Interceptor.attach onEnter/onLeave handlers, clean pointer/register formatting, and attach instructions.';
        break;
      case 'auditor':
        roleSystem =
          'You are the Binary Safety & Vulnerability Auditor. Your goal is to inspect binary functions for memory corruption, buffer overflows, format string bugs, insecure crypto primitives, and authorization logic flaws.';
        roleInstructions =
          'Audit the binary slice for vulnerabilities, unsafe API usage, and authorization bypass vectors. Provide severity ratings and concrete remediation advice.';
        break;
      case 'swift_demangler':
        roleSystem =
          'You are the Swift & Objective-C Metadata Demangler. You resolve Swift 5 mangled symbols, protocols, witness tables, class hierarchies, and Objective-C selector tables for Mach-O binaries.';
        roleInstructions =
          'Demangle any Swift symbols found in the disassembly slice. Map out class hierarchies, calling conventions (swiftcall/cdecl), and protocol conformance.';
        break;
      case 'acp_agent':
        roleSystem =
          'You are an autonomous Agent Client Protocol (ACP) agent. You execute structured reverse engineering sub-tasks, coordinate tool calls with the Binary Ninja host, and return structured atomic steps.';
        roleInstructions =
          'Process the objective using ACP standards, providing atomic execution steps, Binary Ninja API calls, and verification invariants.';
        break;
      default:
        roleSystem = 'You are an expert Binary Ninja and Frida reverse engineering agent.';
        roleInstructions = 'Complete the assigned reverse engineering objective.';
    }

    // Merge global prompt, role-specific prompt directive, and enabled agent skills
    const systemParts = [roleSystem];
    if (effectiveAgentConfig?.globalPrompt) {
      systemParts.push(`[GLOBAL ORCHESTRATOR DIRECTIVES]\n${effectiveAgentConfig.globalPrompt}`);
    }
    if (effectiveAgentConfig?.customPrompt) {
      systemParts.push(`[ROLE SPECIFIC DIRECTIVE]\n${effectiveAgentConfig.customPrompt}`);
    }
    if (Array.isArray(effectiveAgentConfig?.skills) && effectiveAgentConfig.skills.length > 0) {
      systemParts.push(`[ACTIVE SKILLS & TOOLS]\n${effectiveAgentConfig.skills.map((s: string) => `- ${s}`).join('\n')}`);
    }
    const composedSystemInstruction = systemParts.join('\n\n');

    const prompt = `[ROLE: ${safeRole.toUpperCase()}]
${roleInstructions}

[OBJECTIVE]
${objective || 'Analyze selected function'}

[BINARY CONTEXT]
Binary Name: ${safeContext.binaryName || 'libSecureCryptoCore.dylib'}
Architecture: ${safeContext.arch || 'ARM64 (Mach-O)'}
Selected Function: ${safeContext.functionName || 'verifyLicense'}
Address: ${safeContext.address || '0x100003fa0'}

[HLIL DECOMPILATION]
${safeContext.hlil || '// No HLIL provided'}

[ASSEMBLY SLICE]
${safeContext.assembly || '// No assembly provided'}

Provide a concise, rigorous technical analysis and actionable output for your assigned role.`;

    const isGeminiRoute =
      effectiveAgentConfig?.providerType === 'gemini' ||
      effectiveAgentConfig?.model?.startsWith('gemini') ||
      !effectiveAgentConfig?.providerUrl;

    if (isGeminiRoute) {
      if (!ai) ai = getGeminiClient();
      if (!ai) {
        return res.status(400).json({
          success: false,
          role: safeRole,
          output: '',
          error:
            'GEMINI_API_KEY is not configured in Settings > Secrets. Add a Gemini key or assign an OpenAI-compatible/Ollama provider to this role.',
        });
      }

      const selectedModel = effectiveAgentConfig?.model || 'gemini-4-hydrogen';
      const response = await callWithRetry(() =>
        ai!.models.generateContent({
          model: selectedModel,
          contents: prompt,
          config: { systemInstruction: composedSystemInstruction },
        })
      );

      return res.json({
        success: true,
        role: safeRole,
        output: response.text || 'No response generated by Gemini.',
        modelUsed: selectedModel,
      });
    }

    // Route to configured OpenAI-compatible provider
    const chatEndpoint = normalizeOpenAIEndpoint(validateOutboundUrl(effectiveAgentConfig.providerUrl), 'chat/completions');
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (effectiveAgentConfig.apiKey) {
      headers['Authorization'] = `Bearer ${effectiveAgentConfig.apiKey.trim()}`;
    }

    const aiRes = await callWithRetry(() =>
      fetch(chatEndpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: effectiveAgentConfig.model || 'gpt-4o',
          messages: [
            { role: 'system', content: composedSystemInstruction },
            { role: 'user', content: prompt },
          ],
          temperature: typeof effectiveAgentConfig.temperature === 'number' ? effectiveAgentConfig.temperature : 0.2,
          max_tokens: 3000,
        }),
        signal: AbortSignal.timeout(60000),
      })
    );

    if (!aiRes.ok) {
      const errBody = await aiRes.text();
      return res.status(aiRes.status).json({
        success: false,
        role: safeRole,
        output: '',
        error: `Provider (${agentConfig.providerUrl}) returned ${aiRes.status}: ${errBody.slice(0, 300)}`,
      });
    }

    const data = (await aiRes.json()) as any;
    const content = data.choices?.[0]?.message?.content;
    if (!content) {
      return res.status(502).json({
        success: false,
        role: safeRole,
        output: '',
        error: 'Upstream provider returned an empty completion response.',
      });
    }

    return res.json({
      success: true,
      role: safeRole,
      output: content,
      modelUsed: agentConfig.model || 'OpenAI Compatible',
    });
  } catch (error: any) {
    console.error('Dispatch error:', error);
    const parsed = parseProviderError(error);
    return res.status(parsed.status).json({
      success: false,
      role: req.body?.role || 'decompiler',
      output: '',
      error: parsed.message,
    });
  }
});

// ==========================================
// 4. Skills Importer (skills.md / GitHub)
// ==========================================
app.post('/api/skills/fetch', async (req, res) => {
  try {
    const { source } = req.body;
    if (!source) {
      return res.status(400).json({ success: false, error: 'Skill source URL or content is required' });
    }

    let content = source;

    if (source.startsWith('http://') || source.startsWith('https://')) {
      let fetchUrl = source;
      if (fetchUrl.includes('github.com') && !fetchUrl.includes('raw.githubusercontent.com')) {
        fetchUrl = fetchUrl
          .replace('github.com', 'raw.githubusercontent.com')
          .replace('/blob/', '/');
      }

      const resp = await fetch(validateOutboundUrl(fetchUrl), { signal: AbortSignal.timeout(8000) });
      if (!resp.ok) {
        return res.status(resp.status).json({ success: false, error: `Failed to fetch skill from URL: ${resp.statusText}` });
      }
      content = await resp.text();
    }

    const titleMatch = content.match(/^#\s+(.+)$/m) || content.match(/name:\s*["']?([^"'\n]+)["']?/);
    const skillName = titleMatch ? titleMatch[1].trim() : 'Imported Reverse Engineering Skill';

    const descMatch = content.match(/description:\s*>?-?\s*([^\n#]+)/) || content.match(/##\s+Overview\s*\n+([^\n#]+)/i);
    const skillDescription = descMatch ? descMatch[1].trim() : 'Custom skill loaded from external repository or markdown.';

    const tools: string[] = [];
    const toolRegex = /(?:###|##|`)\s*(?:Tool|function|method):\s*([a-zA-Z0-9_-]+)/gi;
    let match;
    while ((match = toolRegex.exec(content)) !== null) {
      tools.push(match[1]);
    }

    return res.json({
      success: true,
      skill: {
        id: `skill_${Date.now()}`,
        name: skillName,
        description: skillDescription,
        source: source.startsWith('http') ? source : 'Uploaded File / Custom',
        tools: tools.length > 0 ? tools : ['binja_disasm', 'patch_opcode', 'frida_hook'],
        rawMarkdown: content,
        isBuiltin: false,
        enabled: true,
        category: 'macho_analysis',
      },
    });
  } catch (error: any) {
    console.error('Skill fetch error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 5. Frida Device & Process Management
// ==========================================
const mockDevices = [
  {
    id: 'usb_ios_00008110-001248E90123801E',
    name: '[SIMULATED] iPhone 15 Pro (A2848)',
    type: 'usb',
    platform: 'ios',
    os: 'iOS 17.4.1 (Darwin 23.4.0)',
    arch: 'arm64e',
    status: 'simulated',
    battery: '88%',
    serverVersion: '16.5.6',
    transport: 'usbmuxd USB-C 10Gbps',
  },
  {
    id: 'usb_android_9A181FFAZ0014B',
    name: '[SIMULATED] Google Pixel 8 Pro',
    type: 'usb',
    platform: 'android',
    os: 'Android 14 (API 34, Linux 6.1)',
    arch: 'aarch64',
    status: 'simulated',
    battery: '94%',
    serverVersion: '16.5.6',
    transport: 'adb USB 3.2',
  },
  {
    id: 'local_darwin_host',
    name: '[SIMULATED] Local Host (MacBook Pro M3 Max)',
    type: 'local',
    platform: 'macos',
    os: 'macOS 14.5 Sonoma (23F79)',
    arch: 'arm64',
    status: 'simulated',
    battery: '100% AC',
    serverVersion: '16.5.6',
    transport: 'XPC / In-Process Mach Port',
  },
];

const mockProcesses: Record<string, Array<{ pid: number; name: string; bundleId: string; arch: string; state: string }>> = {
  'usb_ios_00008110-001248E90123801E': [
    { pid: 1482, name: 'SecureBankAuth', bundleId: 'com.fintech.securebank', arch: 'arm64e', state: 'running' },
    { pid: 2190, name: 'SignalApp', bundleId: 'org.whispersystems.signal', arch: 'arm64e', state: 'running' },
    { pid: 840, name: 'MobileSafari', bundleId: 'com.apple.mobilesafari', arch: 'arm64e', state: 'background' },
    { pid: 104, name: 'SpringBoard', bundleId: 'com.apple.springboard', arch: 'arm64e', state: 'system' },
    { pid: 3201, name: 'CryptoWalletX', bundleId: 'com.web3.cryptowalletx', arch: 'arm64e', state: 'running' },
  ],
  'usb_android_9A181FFAZ0014B': [
    { pid: 8940, name: 'SecureKeyPass', bundleId: 'com.security.authenticator', arch: 'aarch64', state: 'running' },
    { pid: 12040, name: 'Telegram', bundleId: 'org.telegram.messenger', arch: 'aarch64', state: 'running' },
    { pid: 489, name: 'system_server', bundleId: 'android.system.server', arch: 'aarch64', state: 'system' },
    { pid: 15420, name: 'EnterpriseVPN', bundleId: 'com.enterprise.vpnclient', arch: 'aarch64', state: 'running' },
  ],
  'local_darwin_host': [
    { pid: 4890, name: 'Binary Ninja', bundleId: 'com.vector35.binaryninja', arch: 'arm64', state: 'running' },
    { pid: 6712, name: 'SecureCoreDaemon', bundleId: 'com.apple.security.agent', arch: 'arm64', state: 'running' },
    { pid: 9140, name: 'Terminal', bundleId: 'com.apple.Terminal', arch: 'arm64', state: 'running' },
  ],
};

app.get('/api/frida/devices', (_req, res) => {
  return res.json({ success: true, devices: mockDevices });
});

app.post('/api/frida/processes', (req, res) => {
  const { deviceId } = req.body;
  const list = mockProcesses[deviceId] || mockProcesses['local_darwin_host'];
  return res.json({ success: true, processes: list });
});

app.post('/api/frida/spawn', (req, res) => {
  const { deviceId, bundleId } = req.body;
  if (!bundleId || typeof bundleId !== 'string') {
    return res.status(400).json({ success: false, error: 'Bundle ID is required to spawn application.' });
  }
  const cleanBundle = bundleId.trim();
  const device = mockDevices.find((d) => d.id === deviceId) || mockDevices[0];
  const spawnedPid = Math.floor(20000 + Math.random() * 10000);
  const newProc = {
    pid: spawnedPid,
    name: cleanBundle.split('.').pop() || cleanBundle,
    bundleId: cleanBundle,
    arch: device.arch,
    state: 'suspended',
  };

  if (!mockProcesses[device.id]) {
    mockProcesses[device.id] = [];
  }
  mockProcesses[device.id] = [newProc, ...mockProcesses[device.id].filter((p) => p.bundleId !== cleanBundle)];

  return res.json({
    success: true,
    process: newProc,
    logs: [
      {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: `[SIMULATED Frida] Spawned ${cleanBundle} (PID ${spawnedPid}) on ${device.name}; no process was started.`,
      },
      {
        timestamp: new Date(Date.now() + 60).toISOString(),
        level: 'success',
        message: `[SIMULATED Frida] Ready state only; no device or process was instrumented.`,
      },
    ],
  });
});

app.post('/api/frida/run-script', (req, res) => {
  const { deviceId, pid, script, scriptType } = req.body;
  const scriptSource = typeof script === 'string' ? script : '';

  // Basic script brace validation
  const openBraces = (scriptSource.match(/\{/g) || []).length;
  const closeBraces = (scriptSource.match(/\}/g) || []).length;
  if (openBraces !== closeBraces) {
    return res.status(400).json({
      success: false,
      logs: [
        {
          timestamp: new Date().toISOString(),
          level: 'error',
          message: `[Frida] Script compilation failed: Unbalanced braces (${openBraces} '{' vs ${closeBraces} '}').`,
        },
      ],
      error: 'Unbalanced braces in Frida script',
    });
  }

  const now = Date.now();
  const device = mockDevices.find((d) => d.id === deviceId);
  const proc = (mockProcesses[deviceId] || []).find((p) => p.pid === pid);
  const hookCount = (scriptSource.match(/Interceptor\.attach/g) || []).length || 1;
  const classMatch = scriptSource.match(/targetClass\s*=\s*["']([^"']+)["']/);
  const methodMatch = scriptSource.match(/targetMethod\s*=\s*["']([^"']+)["']/);
  const exportMatches = Array.from(scriptSource.matchAll(/findExportByName\([^,]+,\s*["']([^"']+)["']\)/g)).map((m) => m[1]);

  const logs: Array<{ timestamp: string; level: string; message: string }> = [
    {
      timestamp: new Date(now).toISOString(),
      level: 'info',
      message: `[SIMULATED Frida] Attached state for ${proc ? `${proc.name} (PID ${pid})` : `PID ${pid}`} on ${device?.name || deviceId}`,
    },
    {
      timestamp: new Date(now + 75).toISOString(),
      level: 'info',
      message: `[SIMULATED Frida] Parsed GumJS input (${scriptType || 'custom'}, ${scriptSource.split('\n').length} lines); no agent installed.`,
    },
    {
      timestamp: new Date(now + 150).toISOString(),
      level: 'success',
      message: `[SIMULATED Frida] ${hookCount} hook(s) would target ${device?.arch || 'arm64e'}; no target address space changed.`,
    },
  ];

  if (scriptType === 'jailbreak_bypass' || scriptSource.includes('ptrace')) {
    logs.push(
      {
        timestamp: new Date(now + 280).toISOString(),
        level: 'event',
        message: `[Hook] access("/Applications/Cydia.app", F_OK) intercepted -> Spoofing ENOENT (-1)`,
      },
      {
        timestamp: new Date(now + 360).toISOString(),
        level: 'patch',
        message: `[Hook] ptrace(PT_DENY_ATTACH, 0, 0, 0) neutralized -> Returning 0x0 (Debugger permitted)`,
      }
    );
  } else if (scriptType === 'ssl_pinning' || scriptSource.includes('SecTrustEvaluate')) {
    logs.push(
      {
        timestamp: new Date(now + 290).toISOString(),
        level: 'event',
        message: `[Hook] SecTrustEvaluateWithError(trust=0x16b0a1200) intercepted`,
      },
      {
        timestamp: new Date(now + 340).toISOString(),
        level: 'patch',
        message: `[Hook] Overriding trust evaluation status -> errSecSuccess (0x1). TLS pinning bypassed.`,
      }
    );
  } else if (scriptType === 'arm64_trace' || scriptSource.includes('this.context.x0')) {
    logs.push(
      {
        timestamp: new Date(now + 290).toISOString(),
        level: 'event',
        message: `[Trace] Hit offset 0x3fa0 | x0=0x1048a2010 x1=0x16fdff2c0 sp=0x16fdff280`,
      },
      {
        timestamp: new Date(now + 350).toISOString(),
        level: 'patch',
        message: `[Trace] Leave 0x3fa0 -> return x0=0x1 (elapsed 42µs)`,
      }
    );
  } else {
    const targetDesc =
      classMatch && methodMatch
        ? `${classMatch[1]} ${methodMatch[1]}`
        : exportMatches.length > 0
        ? exportMatches.join(', ')
        : 'target symbol';
    logs.push(
      {
        timestamp: new Date(now + 300).toISOString(),
        level: 'event',
        message: `[Hook] Intercepted ${targetDesc} | x0=0x16b420800 lr=0x1000058b4`,
      },
      {
        timestamp: new Date(now + 380).toISOString(),
        level: 'patch',
        message: `[Hook] onLeave executed for ${targetDesc} -> Return value overridden to 0x1 (TRUE)`,
      }
    );
  }

  return res.json({
    success: true,
    sessionId: `frida_sess_${now}`,
    logs,
  });
});

// ==========================================
// 6. Binary Ninja Plugin Bundle Exporter
// ==========================================
app.get('/api/plugin/export', (req, res) => {
  const rawEndpoint = typeof req.query.endpoint === 'string' ? req.query.endpoint.trim() : '';
  const safeEndpoint =
    rawEndpoint && /^https?:\/\/[a-zA-Z0-9._:/-]+$/.test(rawEndpoint)
      ? rawEndpoint.replace(/\/+$/, '')
      : `http://localhost:${PORT}/api`;

  const pluginJson = JSON.stringify(
    {
      pluginmetadataversion: 2,
      name: 'Mimir AI Orchestrator',
      author: 'Mimir Security',
      license: {
        name: 'MIT',
        text: 'MIT License',
      },
      platforms: ['Darwin', 'Linux', 'Windows'],
      installinstructions: {
        Darwin: 'Copy the mimir_plugin folder into ~/Library/Application Support/Binary Ninja/plugins/',
        Linux: 'Copy the mimir_plugin folder into ~/.binaryninja/plugins/',
        Windows: 'Copy the mimir_plugin folder into %APPDATA%\\Binary Ninja\\plugins\\',
      },
      dependencies: {},
      version: '2.5.0',
      minimumbinaryninjaversion: 3500,
      description:
        'Autonomous Binary Ninja AI reverse engineering plugin with HLIL semantic search, ARM64 smart patching, multi-agent role dispatch, and Frida hook generation.',
    },
    null,
    2
  );

  const pluginDir = path.resolve(__dirname, 'plugin', 'mimir_plugin');
  const initPyCode = readFileSync(path.join(pluginDir, '__init__.py'), 'utf8');
  const pythonPluginCode = readFileSync(path.join(pluginDir, 'mimir_binja.py'), 'utf8').replace(
    /DEFAULT_SERVER_ENDPOINT = "[^"\n]*"/,
    `DEFAULT_SERVER_ENDPOINT = ${JSON.stringify(safeEndpoint)}`,
  );
  const swiftBridgeCode = `//
// MimirCompanion.swift
// macOS native helper, Mach-O VA->Offset translator, codesigner & Mimir IPC Bridge
//

import Foundation
import MachO

public enum MimirPatchError: Error, LocalizedError {
    case invalidBinary
    case segmentNotFound
    case unalignedArm64Address(UInt64)
    case codesignFailed(Int32)

    public var errorDescription: String? {
        switch self {
        case .invalidBinary: return "Not a valid 64-bit Mach-O binary."
        case .segmentNotFound: return "Could not locate __TEXT segment to translate virtual address."
        case .unalignedArm64Address(let addr): return String(format: "Address 0x%llX is not 4-byte ARM64 aligned.", addr)
        case .codesignFailed(let code): return "codesign exited with status \\(code)."
        }
    }
}

public final class MimirBridge {
    public static let shared = MimirBridge()
    private let sessionEndpoint = URL(string: "${safeEndpoint}")!

    /// Translates a 64-bit Mach-O virtual address (e.g. 0x100003fd0) into a physical file offset.
    public func virtualAddressToFileOffset(binaryData: Data, virtualAddress: UInt64) throws -> UInt64 {
        guard binaryData.count >= MemoryLayout<mach_header_64>.size else {
            throw MimirPatchError.invalidBinary
        }

        return try binaryData.withUnsafeBytes { rawBuffer -> UInt64 in
            guard let basePtr = rawBuffer.baseAddress else { throw MimirPatchError.invalidBinary }
            let header = basePtr.assumingMemoryBound(to: mach_header_64.self).pointee
            guard header.magic == MH_MAGIC_64 else {
                throw MimirPatchError.invalidBinary
            }

            var cmdOffset = MemoryLayout<mach_header_64>.size
            for _ in 0..<header.ncmds {
                guard cmdOffset + MemoryLayout<load_command>.size <= binaryData.count else { break }
                let lc = basePtr.advanced(by: cmdOffset).assumingMemoryBound(to: load_command.self).pointee
                if lc.cmd == LC_SEGMENT_64 {
                    let seg = basePtr.advanced(by: cmdOffset).assumingMemoryBound(to: segment_command_64.self).pointee
                    if virtualAddress >= seg.vmaddr && virtualAddress < (seg.vmaddr + seg.vmsize) {
                        return (virtualAddress - seg.vmaddr) + seg.fileoff
                    }
                }
                cmdOffset += Int(lc.cmdsize)
            }
            throw MimirPatchError.segmentNotFound
        }
    }

    public func dispatchMachOPatch(binaryPath: String, virtualAddress: UInt64, patchBytes: [UInt8]) throws {
        guard virtualAddress % 4 == 0, patchBytes.count % 4 == 0 else {
            throw MimirPatchError.unalignedArm64Address(virtualAddress)
        }

        let fileURL = URL(fileURLWithPath: binaryPath)
        let data = try Data(contentsOf: fileURL)
        let fileOffset = try virtualAddressToFileOffset(binaryData: data, virtualAddress: virtualAddress)

        // Create automatic backup prior to patching
        let backupURL = URL(fileURLWithPath: binaryPath + ".mimir.bak")
        if !FileManager.default.fileExists(atPath: backupURL.path) {
            try data.write(to: backupURL)
        }

        let fileHandle = try FileHandle(forUpdating: fileURL)
        try fileHandle.seek(toOffset: fileOffset)
        fileHandle.write(Data(patchBytes))
        try fileHandle.close()

        // Re-sign Mach-O binary for macOS Gatekeeper & ARM64e
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/codesign")
        process.arguments = ["--force", "--deep", "-s", "-", binaryPath]
        try process.run()
        process.waitUntilExit()

        if process.terminationStatus != 0 {
            throw MimirPatchError.codesignFailed(process.terminationStatus)
        }
    }

    public func queryAgent(role: String, objective: String, functionName: String, address: String, hlil: String) async throws -> String {
        var request = URLRequest(url: sessionEndpoint.appendingPathComponent("ai/dispatch-role"))
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let payload: [String: Any] = [
            "role": role,
            "agentConfig": ["providerType": "gemini", "model": "gemini-4-hydrogen"],
            "objective": objective,
            "context": [
                "binaryName": "MachOTarget",
                "arch": "ARM64",
                "functionName": functionName,
                "address": address,
                "hlil": hlil,
            ],
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)

        let (data, _) = try await URLSession.shared.data(for: request)
        if let json = try JSONSerialization.jsonObject(with: data) as? [String: Any],
           let output = json["output"] as? String {
            return output
        }
        return "No response from Mimir backend."
    }
}
`;

  return res.json({
    success: true,
    files: [
      { filename: 'mimir_binja.py', content: pythonPluginCode, type: 'python' },
      { filename: '__init__.py', content: initPyCode, type: 'python' },
      { filename: 'plugin.json', content: pluginJson, type: 'json' },
      { filename: 'MimirCompanion.swift', content: swiftBridgeCode, type: 'swift' },
    ],
  });
});

// ==========================================
// Vite Middleware / Static Serving
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer } = await import('vite');
    const vite = await createServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`Mimir Binary Ninja & Frida Studio running on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
