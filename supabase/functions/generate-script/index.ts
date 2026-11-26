// Supabase Edge Function: generate-script
// Unified Structured Outputs handler for Content Creator (generate + refine),
// 30-Day Challenge weekly batches (weekly), and personalized Warmups (warmup).

import { serve } from "https://deno.land/std@0.177.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"
import {
    OPENAI_MODEL,
    SCRIPT_JSON_SCHEMA,
    WEEKLY_SCRIPTS_JSON_SCHEMA,
    WARMUP_SCRIPTS_JSON_SCHEMA,
    LENGTH_CONFIG,
    GenerateRequest,
    RawScriptOutput,
    RawWeeklyScriptsOutput,
    RawWarmupScriptsOutput,
    normalizeTemplate,
    normalizeTone,
    normalizeLength,
    normalizePlatform,
    validateRequest,
    buildSystemPrompt,
    buildGenerateUserPrompt,
    buildLengthExpansionPrompt,
    buildRefineUserPrompt,
    buildWeeklyChallengeSystemPrompt,
    buildWeeklyChallengeUserPrompt,
    buildWarmupUserPrompt,
    countWords,
    joinBodyBeats,
    sanitizeAndEnrich,
    sanitizeWeeklyScripts,
    sanitizeWarmupScripts,
    redactSecrets,
} from "./pipeline.ts"

const OPENAI_TIMEOUT_MS = 45_000
const CACHE_TTL_MS = 5 * 60 * 1000

const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

function getCorsHeaders(req: Request): Record<string, string> {
    const origin = req.headers.get('Origin') ?? ''
    const allowAll = allowedOrigins.includes('*')
    const isAllowed = allowAll || (origin !== '' && allowedOrigins.includes(origin))
    return {
        'Access-Control-Allow-Origin': isAllowed ? (origin || '*') : (allowedOrigins[0] || '*'),
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
    }
}

let cachedWorkingKey: string | null = null
let cacheTimestamp = 0

async function getCandidateApiKeys(): Promise<string[]> {
    const now = Date.now()
    if (cachedWorkingKey && (now - cacheTimestamp) < CACHE_TTL_MS) {
        return [cachedWorkingKey]
    }

    const candidates: string[] = []

    // Priority 1: app_config table (currently managed by Admin Dashboard & Flutter)
    try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
        if (supabaseUrl && supabaseServiceKey) {
            const supabase = createClient(supabaseUrl, supabaseServiceKey)
            const { data, error } = await supabase
                .from('app_config')
                .select('value')
                .eq('key', 'openai_api_key')
                .single()

            if (!error && data?.value) {
                const val = String(data.value).trim()
                if (val && !candidates.includes(val)) candidates.push(val)
            }
        }
    } catch (dbErr) {
        console.warn('app_config lookup warning:', dbErr instanceof Error ? dbErr.message : dbErr)
    }

    // Priority 2: OPENAI_API_KEY Edge Function secret
    const envKey = Deno.env.get('OPENAI_API_KEY')?.trim()
    if (envKey && !candidates.includes(envKey)) {
        candidates.push(envKey)
    }

    return candidates
}

class UpstreamError extends Error {
    status: number
    constructor(status: number, message: string) {
        super(message)
        this.status = status
    }
}

async function callOpenAiSingleKey<T>(
    apiKey: string,
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: Record<string, unknown>,
    temperature: number,
    maxTokens: number,
    isNonEmpty: (parsed: T) => boolean,
): Promise<T> {
    const maxAttempts = 2
    let lastError: Error | null = null

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        const controller = new AbortController()
        const timer = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS)

        try {
            const resp = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                signal: controller.signal,
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: OPENAI_MODEL,
                    temperature,
                    max_tokens: maxTokens,
                    response_format: {
                        type: 'json_schema',
                        json_schema: jsonSchema,
                    },
                    messages: [
                        { role: 'system', content: systemPrompt },
                        { role: 'user', content: userPrompt },
                    ],
                }),
            })

            clearTimeout(timer)

            if (!resp.ok) {
                const errBody = await resp.json().catch(() => ({}))
                const rawMsg = errBody?.error?.message || `HTTP ${resp.status}`
                const safeMsg = redactSecrets(rawMsg)
                if ((resp.status === 429 || resp.status >= 500) && attempt < maxAttempts) {
                    await new Promise((r) => setTimeout(r, 700))
                    continue
                }
                throw new UpstreamError(resp.status, `OpenAI API error (${resp.status}): ${safeMsg}`)
            }

            const data = await resp.json()
            const content = data?.choices?.[0]?.message?.content
            if (!content || typeof content !== 'string') {
                throw new Error('Empty completion from OpenAI')
            }

            const parsed = JSON.parse(content) as T
            if (!isNonEmpty(parsed)) {
                if (attempt < maxAttempts) continue
                throw new Error('Generated script content was empty')
            }
            return parsed
        } catch (err) {
            clearTimeout(timer)
            lastError = err instanceof Error ? err : new Error(String(err))
            const retryable = lastError.name === 'AbortError' || lastError instanceof SyntaxError
            if (retryable && attempt < maxAttempts) {
                await new Promise((r) => setTimeout(r, 500))
                continue
            }
            throw lastError
        }
    }

    throw lastError ?? new Error('Script generation failed')
}

async function callOpenAiWithKeyFailover<T>(
    apiKeys: string[],
    systemPrompt: string,
    userPrompt: string,
    jsonSchema: Record<string, unknown>,
    temperature: number,
    maxTokens: number,
    isNonEmpty: (parsed: T) => boolean,
): Promise<T> {
    let lastError: Error | null = null
    for (const key of apiKeys) {
        try {
            const output = await callOpenAiSingleKey<T>(
                key,
                systemPrompt,
                userPrompt,
                jsonSchema,
                temperature,
                maxTokens,
                isNonEmpty,
            )
            cachedWorkingKey = key
            cacheTimestamp = Date.now()
            return output
        } catch (err) {
            lastError = err instanceof Error ? err : new Error(String(err))
            if (err instanceof UpstreamError && (err.status === 401 || err.status === 403)) {
                cachedWorkingKey = null
                cacheTimestamp = 0
                continue
            }
            throw err
        }
    }
    throw lastError ?? new UpstreamError(502, 'All configured OpenAI keys rejected authentication')
}

serve(async (req) => {
    const corsHeaders = getCorsHeaders(req)

    if (req.method === 'OPTIONS') {
        return new Response(null, { headers: corsHeaders })
    }

    if (req.method !== 'POST') {
        return new Response(
            JSON.stringify({ error: 'Method not allowed' }),
            { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }

    try {
        const authHeader = req.headers.get('Authorization')?.trim()
        const apiKeyHeader = req.headers.get('apikey')?.trim()
        if (!authHeader && !apiKeyHeader) {
            return new Response(
                JSON.stringify({ error: 'Unauthorized' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        let body: GenerateRequest
        try {
            body = await req.json()
        } catch {
            return new Response(
                JSON.stringify({ error: 'Invalid JSON request body' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const validationError = validateRequest(body)
        if (validationError) {
            return new Response(
                JSON.stringify({ error: validationError }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const apiKeys = await getCandidateApiKeys()
        if (apiKeys.length === 0) {
            return new Response(
                JSON.stringify({ error: 'Server configuration error: OpenAI API key is missing.' }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const action = body.action ?? 'generate'

        // --- Action 1: 30-Day Challenge Weekly Batch ---
        if (action === 'weekly') {
            const sysPrompt = buildWeeklyChallengeSystemPrompt()
            const usrPrompt = buildWeeklyChallengeUserPrompt(body)
            const rawWeekly = await callOpenAiWithKeyFailover<RawWeeklyScriptsOutput>(
                apiKeys,
                sysPrompt,
                usrPrompt,
                WEEKLY_SCRIPTS_JSON_SCHEMA,
                0.8,
                6500,
                (p) => Array.isArray(p.scripts) && p.scripts.length > 0,
            )
            const payload = sanitizeWeeklyScripts(rawWeekly, body)
            return new Response(
                JSON.stringify(payload),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // --- Action 2: Personalized Warmup Scripts ---
        if (action === 'warmup') {
            const sysPrompt = buildWeeklyChallengeSystemPrompt()
            const usrPrompt = buildWarmupUserPrompt(body)
            const rawWarmups = await callOpenAiWithKeyFailover<RawWarmupScriptsOutput>(
                apiKeys,
                sysPrompt,
                usrPrompt,
                WARMUP_SCRIPTS_JSON_SCHEMA,
                0.8,
                2200,
                (p) => Array.isArray(p.scripts) && p.scripts.length > 0,
            )
            const payload = sanitizeWarmupScripts(rawWarmups, body)
            return new Response(
                JSON.stringify(payload),
                { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // --- Action 3 & 4: Content Creator Generate & Refine ---
        const normalized = {
            template: normalizeTemplate(body.template),
            tone: normalizeTone(body.tone),
            length: normalizeLength(body.length),
            platform: normalizePlatform(body.platform),
            markdownMode: body.markdownMode !== false,
        }

        const systemPrompt = buildSystemPrompt(normalized.markdownMode)
        const userPrompt = action === 'refine'
            ? buildRefineUserPrompt(body)
            : buildGenerateUserPrompt(body)

        const temperature = action === 'refine'
            ? (body.refineInstruction === 'punchier_hook' ? 0.85 : 0.55)
            : 0.78

        const maxTokens = normalized.length === 'long' ? 2800 : 2200

        let rawScript = await callOpenAiWithKeyFailover<RawScriptOutput>(
            apiKeys,
            systemPrompt,
            userPrompt,
            SCRIPT_JSON_SCHEMA,
            temperature,
            maxTokens,
            (p) => Boolean(p.part1?.trim() || (Array.isArray(p.bodyBeats) && p.bodyBeats.length > 0)),
        )

        // Single automatic length-repair pass when medium/long generation undershoots < 85% of min target
        if (action === 'generate' && (normalized.length === 'medium' || normalized.length === 'long')) {
            const cfg = LENGTH_CONFIG[normalized.length]
            const draftWords = countWords(
                `${rawScript.part1 ?? ''} ${joinBodyBeats(rawScript.bodyBeats, normalized.markdownMode)} ${rawScript.part3 ?? ''}`
            )
            if (draftWords < Math.round(cfg.min * 0.85)) {
                try {
                    const expandPrompt = buildLengthExpansionPrompt(rawScript, body, normalized.length, draftWords)
                    const expanded = await callOpenAiWithKeyFailover<RawScriptOutput>(
                        apiKeys,
                        systemPrompt,
                        expandPrompt,
                        SCRIPT_JSON_SCHEMA,
                        0.72,
                        2800,
                        (p) => Boolean(p.part1?.trim() && Array.isArray(p.bodyBeats) && p.bodyBeats.length > 0),
                    )
                    const expandedWords = countWords(
                        `${expanded.part1 ?? ''} ${joinBodyBeats(expanded.bodyBeats, normalized.markdownMode)} ${expanded.part3 ?? ''}`
                    )
                    if (expandedWords > draftWords) {
                        rawScript = expanded
                    }
                } catch (expandErr) {
                    console.warn('Length expansion pass skipped:', expandErr instanceof Error ? expandErr.message : expandErr)
                }
            }
        }

        const responsePayload = sanitizeAndEnrich(rawScript, body, normalized)

        return new Response(
            JSON.stringify(responsePayload),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    } catch (error) {
        const rawMsg = error instanceof Error ? error.message : 'Unknown internal error'
        let message = redactSecrets(rawMsg)
        const status = error instanceof UpstreamError ? 502 : 500

        if (error instanceof UpstreamError && (error.status === 401 || error.status === 403)) {
            message = 'AI service authentication error (upstream 401). Please update the OpenAI API key in Supabase secrets.'
        } else if (error instanceof UpstreamError && error.status === 429) {
            message = 'AI service is temporarily busy. Please wait a few seconds and try again.'
        }

        console.error('generate-script error:', message)
        return new Response(
            JSON.stringify({ error: message }),
            { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
