// Pure, deterministic script pipeline helpers shared by the Supabase Edge Function
// and executable directly in Node/Deno unit tests (zero external network dependencies).

export const OPENAI_MODEL = 'gpt-4o-mini'
export const SPEAKING_WPM = 140

export interface ExistingScript {
    title?: string
    part1?: string
    part2?: string
    part3?: string
}

export interface PromptProfilePayload {
    systemPersona?: string
    coreIntent?: string
    speakerMindset?: string
    emotionalArc?: string
    forbiddenPatterns?: string
    closingBehavior?: string
    humanSpeechRules?: string
    audienceMirrorRules?: string
    culturalRules?: string
}

export interface GenerateRequest {
    action?: 'generate' | 'refine' | 'weekly' | 'warmup'
    template?: string
    topic?: string
    audience?: string
    coreMessage?: string
    message?: string
    tone?: string
    length?: string
    platform?: string
    ctaStyle?: string
    customPrompt?: string
    languageCode?: string
    languageText?: string
    scriptStyle?: 'spoken_natural' | 'romanized'
    markdownMode?: boolean
    refineInstruction?: string
    existingScript?: ExistingScript
    sessionToken?: string
    // Weekly / Warmup challenge fields
    weekNumber?: number
    startDay?: number
    endDay?: number
    firstName?: string
    age?: number
    location?: string
    goal?: string
    onboardingAnswers?: Record<string, unknown>
    promptProfile?: PromptProfilePayload
}

export interface RawScriptOutput {
    title: string
    part1: string
    bodyBeats: string[]
    part3: string
    hookAlternatives: string[]
}

export interface RawWeeklyScriptItem {
    dayNumber: number
    title: string
    part1: string
    part2: string
    part3: string
    focus: string
    duration: string
}

export interface RawWeeklyScriptsOutput {
    scripts: RawWeeklyScriptItem[]
}

export interface RawWarmupScriptItem {
    warmupIndex: number
    title: string
    part1: string
    part2: string
    part3: string
    focus: string
}

export interface RawWarmupScriptsOutput {
    scripts: RawWarmupScriptItem[]
}

export const TEMPLATE_ALIASES: Record<string, string> = {
    educational: 'educational',
    education: 'educational',
    explainer: 'educational',
    howto: 'howto',
    how_to: 'howto',
    tutorial: 'howto',
    story: 'story',
    storytelling: 'story',
    personal_story: 'story',
    tips: 'tips',
    listicle: 'tips',
    list: 'tips',
    review: 'review',
    productreview: 'review',
    product_review: 'review',
    dayinlife: 'dayinlife',
    day_in_life: 'dayinlife',
    vlog: 'dayinlife',
    mythbuster: 'mythbuster',
    myth_buster: 'mythbuster',
    myth: 'mythbuster',
    opinion: 'mythbuster',
    contrarian: 'mythbuster',
    custom: 'custom',
}

export const TONE_ALIASES: Record<string, string> = {
    casual: 'casual',
    friendly: 'casual',
    conversational: 'casual',
    professional: 'professional',
    authoritative: 'professional',
    educational: 'professional',
    energetic: 'energetic',
    hype: 'energetic',
    enthusiastic: 'energetic',
    inspiring: 'inspiring',
    inspirational: 'inspiring',
    motivational: 'inspiring',
    humorous: 'humorous',
    funny: 'humorous',
    witty: 'humorous',
    playful: 'humorous',
    calm: 'calm',
    empathetic: 'calm',
    reassuring: 'calm',
}

export const LENGTH_CONFIG: Record<string, {
    label: string
    min: number
    max: number
    p1: string
    p2: string
    p3: string
    beats: string
    wordsPerBeat: string
}> = {
    short: {
        label: '30-45 second short-form',
        min: 75,
        max: 115,
        p1: '15-25 words',
        p2: '45-68 words',
        p3: '15-22 words',
        beats: '2-3',
        wordsPerBeat: '18-26 words each',
    },
    medium: {
        label: '60-90 second video',
        min: 140,
        max: 215,
        p1: '20-35 words',
        p2: '100-150 words',
        p3: '20-30 words',
        beats: '3-4',
        wordsPerBeat: '30-42 words each',
    },
    long: {
        label: '2-3 minute deep-dive',
        min: 260,
        max: 370,
        p1: '25-40 words',
        p2: '210-290 words',
        p3: '25-40 words',
        beats: '5-6',
        wordsPerBeat: '40-55 words each',
    },
}

export const PLATFORM_GUIDANCE: Record<string, string> = {
    reels_shorts: 'Instagram Reels / YouTube Shorts (vertical video): ultra-punchy first 3 seconds, zero warm-up fluff, tight rhythmic sentences meant for high mobile retention.',
    youtube: 'YouTube long-form / talking head: open with clear viewer payoff and open loop, build structured clarity with relatable concrete examples, and earn a natural subscribe/watch-next close.',
    linkedin: 'LinkedIn founder/creator video: grounded practitioner insight, sharp industry observation without buzzwords, credible conversational authority.',
    general: 'Direct-to-camera social video or confidence practice: natural human cadence, easy to deliver in one breath per line.',
}

export const TEMPLATE_INSTRUCTIONS: Record<string, string> = {
    educational: 'Teach one clear concept. Hook with a surprising gap or sharp question, unpack the insight with one relatable analogy or concrete example, and finish with a crisp mental takeaway.',
    howto: 'Walk the viewer through a repeatable process. Hook with the desired outcome, break the method into 3-4 concrete sequential steps, and close with an immediate action trigger.',
    story: 'Tell a real-feeling first-person micro-story using active spoken delivery (avoid storybook "Once upon a time" clichés). Drop straight into the tension moment, show the turning point, and land the takeaway for the viewer.',
    tips: 'Open with a relatable mistake viewers make, deliver 3-5 tight high-signal tips (each grounded with why or how in natural creator speech), and close by telling the viewer which single tip to try first.',
    review: 'Give an honest, specific review. Keep part1 strictly as a 1-2 sentence hook with your upfront verdict (under 30 words); save ALL detailed pros, real-world tests, and caveats for bodyBeats; and end part3 with your clear who-should-buy/skip recommendation.',
    dayinlife: 'Anchor the viewer in a specific relatable moment of the day (rather than "Hey guys, come spend a day with me"). Move through 3 vivid checkpoints with quick honest commentary, and close with a grounded reflection.',
    mythbuster: 'Call out a widely repeated bad habit or myth right away, explain concisely why it backfires in practice, replace it with what actually works, and close with a challenge to test it.',
    custom: 'Follow the creator custom instructions faithfully while keeping the script punchy, conversational, and ready to read straight off a teleprompter.',
}

export const TONE_DESCRIPTIONS: Record<string, string> = {
    casual: 'warm, relaxed, spoken-like-to-one-friend',
    professional: 'clear, credible, practitioner-to-peer without stiffness or jargon',
    energetic: 'upbeat, decisive, high-momentum without shouting or hype clichés',
    inspiring: 'honest, encouraging, grounded in real struggle and forward motion',
    humorous: 'lighthearted, witty, self-aware observational humor that lands naturally on camera without cringe puns or forced stand-up jokes',
    calm: 'steady, reassuring, unhurried—designed to help a camera-shy speaker breathe easily',
}

export const CTA_INSTRUCTIONS: Record<string, string> = {
    auto: 'Choose the single most natural close for this video (question for comments, follow prompt, or direct takeaway).',
    follow: 'End with an earned, low-pressure reason to follow or subscribe for the next part.',
    comment: 'End with one specific, easy-to-answer question that sparks genuine viewer replies.',
    save_share: 'End by nudging viewers to save this for their next shoot or share it with a friend who needs it.',
    link: 'End by pointing naturally to the link or resource in bio/caption without sounding salesy.',
    reflection: 'End with a grounded single-line thought or mini-challenge rather than asking for metrics.',
}

export const LANGUAGE_NAME_BY_CODE: Record<string, { name: string; nativeScript: string; isBilingual?: boolean }> = {
    en: { name: 'English', nativeScript: 'English' },
    hi: { name: 'Hindi', nativeScript: 'Devanagari script (हिन्दी)' },
    hinglish: { name: 'Hinglish', nativeScript: 'Roman letters mixing conversational Hindi and English', isBilingual: true },
    ta: { name: 'Tamil', nativeScript: 'Tamil script (தமிழ்)' },
    te: { name: 'Telugu', nativeScript: 'Telugu script (తెలుగు)' },
    tanglish: { name: 'Tanglish', nativeScript: 'Roman letters mixing conversational Tamil and English', isBilingual: true },
    mr: { name: 'Marathi', nativeScript: 'Devanagari script (मराठी)' },
    bn: { name: 'Bengali', nativeScript: 'Bengali script (বাংলা)' },
    gu: { name: 'Gujarati', nativeScript: 'Gujarati script (ગુજરાતી)' },
    kn: { name: 'Kannada', nativeScript: 'Kannada script (ಕನ್ನಡ)' },
    ml: { name: 'Malayalam', nativeScript: 'Malayalam script (മലയാളം)' },
    pa: { name: 'Punjabi', nativeScript: 'Gurmukhi script (ਪੰਜਾਬੀ)' },
}

export const SCRIPT_JSON_SCHEMA = {
    name: 'video_script_response',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['title', 'part1', 'bodyBeats', 'part3', 'hookAlternatives'],
        properties: {
            title: { type: 'string' },
            part1: { type: 'string' },
            bodyBeats: {
                type: 'array',
                items: { type: 'string' },
            },
            part3: { type: 'string' },
            hookAlternatives: {
                type: 'array',
                items: { type: 'string' },
            },
        },
    },
}

export const WEEKLY_SCRIPTS_JSON_SCHEMA = {
    name: 'weekly_challenge_scripts_response',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['scripts'],
        properties: {
            scripts: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['dayNumber', 'title', 'part1', 'part2', 'part3', 'focus', 'duration'],
                    properties: {
                        dayNumber: { type: 'integer' },
                        title: { type: 'string' },
                        part1: { type: 'string' },
                        part2: { type: 'string' },
                        part3: { type: 'string' },
                        focus: { type: 'string' },
                        duration: { type: 'string' },
                    },
                },
            },
        },
    },
}

export const WARMUP_SCRIPTS_JSON_SCHEMA = {
    name: 'warmup_scripts_response',
    strict: true,
    schema: {
        type: 'object',
        additionalProperties: false,
        required: ['scripts'],
        properties: {
            scripts: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: ['warmupIndex', 'title', 'part1', 'part2', 'part3', 'focus'],
                    properties: {
                        warmupIndex: { type: 'integer' },
                        title: { type: 'string' },
                        part1: { type: 'string' },
                        part2: { type: 'string' },
                        part3: { type: 'string' },
                        focus: { type: 'string' },
                    },
                },
            },
        },
    },
}

export function redactSecrets(msg: string): string {
    return msg.replace(/sk-[A-Za-z0-9_*-]{8,}/g, '[redacted-key]')
}

export function normalizeTemplate(raw?: string): string {
    const key = (raw ?? 'educational').trim().toLowerCase().replace(/[\s-]+/g, '_')
    return TEMPLATE_ALIASES[key] ?? 'educational'
}

export function normalizeTone(raw?: string): string {
    const key = (raw ?? 'casual').trim().toLowerCase()
    return TONE_ALIASES[key] ?? 'casual'
}

export function normalizeLength(raw?: string): 'short' | 'medium' | 'long' {
    const val = (raw ?? 'medium').trim().toLowerCase()
    if (val === 'short' || val === 'medium' || val === 'long') return val
    if (val.includes('short') || val.includes('30') || val.includes('45')) return 'short'
    if (val.includes('long') || val.includes('2') || val.includes('3')) return 'long'
    return 'medium'
}

export function normalizePlatform(raw?: string): string {
    const val = (raw ?? 'reels_shorts').trim().toLowerCase()
    if (val in PLATFORM_GUIDANCE) return val
    if (val.includes('youtube')) return 'youtube'
    if (val.includes('linkedin')) return 'linkedin'
    if (val.includes('general')) return 'general'
    return 'reels_shorts'
}

export function getWordRangeForWeek(weekNumber: number): { min: number; max: number } {
    switch (weekNumber) {
        case 1:
            return { min: 175, max: 225 }
        case 2:
            return { min: 225, max: 275 }
        case 3:
            return { min: 275, max: 325 }
        case 4:
            return { min: 325, max: 375 }
        default:
            return { min: 375, max: 425 }
    }
}

export function validateRequest(body: GenerateRequest): string | null {
    const action = body.action ?? 'generate'

    if (action === 'weekly') {
        const week = Number(body.weekNumber ?? 1)
        if (!Number.isInteger(week) || week < 1 || week > 5) {
            return 'weekNumber must be an integer between 1 and 5.'
        }
        const startDay = body.startDay !== undefined ? Number(body.startDay) : (week - 1) * 7 + 1
        const endDay = body.endDay !== undefined ? Number(body.endDay) : Math.min(30, week * 7)
        if (!Number.isInteger(startDay) || !Number.isInteger(endDay) || startDay < 1 || endDay > 30 || endDay < startDay || (endDay - startDay) > 6) {
            return 'startDay and endDay must define a valid 1-7 day window within days 1-30.'
        }
        return null
    }

    if (action === 'warmup') {
        return null
    }

    if (action === 'refine') {
        if (!body.existingScript || (!body.existingScript.part1 && !body.existingScript.part2)) {
            return 'Existing script content is required for refinement.'
        }
        return null
    }

    const topic = (body.topic ?? '').trim()
    if (!topic || topic.length < 3) {
        return 'Please provide a topic (at least 3 characters).'
    }
    if (topic.length > 500) {
        return 'Topic is too long (maximum 500 characters).'
    }
    if (body.customPrompt && body.customPrompt.length > 1500) {
        return 'Custom instructions are too long (maximum 1500 characters).'
    }
    if ((body.coreMessage || body.message || '').length > 1000) {
        return 'Core takeaway text is too long (maximum 1000 characters).'
    }

    return null
}

export function resolveLanguageInstruction(req: GenerateRequest): string {
    const code = (req.languageCode ?? '').trim().toLowerCase()
    const customText = (req.languageText ?? '').trim()
    const isRomanized = req.scriptStyle === 'romanized'

    if (code === 'hinglish' || customText.toLowerCase().includes('hinglish')) {
        return 'Write ALL fields (including title and hookAlternatives) in natural everyday urban Hinglish using ROMAN (English) letters ONLY (e.g., "Dekho, simple si baat hai...", never Devanagari and NEVER stiff textbook Hindi like "sochiyega" or "avashyakta"). Mix conversational Hindi grammar with natural English creator words, and stay consistent in pronoun register throughout (use friendly "tum" OR respectful "aap"—never mix both in one script).'
    }
    if (code === 'tanglish' || customText.toLowerCase().includes('tanglish')) {
        return 'Write ALL fields (including title and hookAlternatives) in natural everyday spoken Tanglish using ROMAN (English) letters ONLY (mix conversational Tamil and natural English cleanly as real creators speak, keeping pronoun register consistent).'
    }

    const langMeta = LANGUAGE_NAME_BY_CODE[code]
    if (isRomanized && code && code !== 'en') {
        const langName = langMeta?.name || customText || code
        return `Write ALL fields (including title and hookAlternatives) in natural everyday spoken ${langName}, transliterated cleanly into easy-to-read ROMAN (English) letters for a teleprompter. Think directly in natural spoken ${langName} creator idioms (never literal English translation), stay 100% on topic, and keep pronouns consistent throughout.`
    }

    if (langMeta && code !== 'en') {
        return `Write ALL fields (title, part1, bodyBeats/part2, part3, and hookAlternatives) in natural everyday spoken ${langMeta.name} using ${langMeta.nativeScript}. Think directly in real ${langMeta.name} creator speech—NEVER translate English prompt templates literally or leave the title in English.`
    }

    if (customText && customText.toLowerCase() !== 'english' && code !== 'en') {
        return `Write ALL fields (including title and hookAlternatives) in ${customText}. Use natural everyday conversational phrasing spoken by real creators—never literal textbook translation or English titles.`
    }

    return 'Write ALL fields in natural spoken English using contractions.'
}

export function buildSystemPrompt(markdownMode: boolean): string {
    return [
        'You are an elite spoken-word video scriptwriter and teleprompter coach for creators.',
        'CONTEXT: Every script is written for a video creator speaking directly to a camera lens using a teleprompter (Instagram Reels, YouTube, LinkedIn, or camera-confidence practice). Interpret filming terms like "lens", "eye contact", "frame", "hook", or "cuts" in the context of recording video on camera unless the topic explicitly specifies another domain.',
        '',
        'NON-NEGOTIABLE SPOKEN-WORD & TELEPROMPTER RULES:',
        '1. Output ONLY exact words meant to be spoken aloud. NEVER write stage directions ([pause], (smile), [B-roll], [0-5 sec]), section labels ("Hook:", "Body:", "Close:", "Part 1:"), markdown headings (#), fenced code blocks (```), URLs, hashtags (#tag), or emojis.',
        '2. NEVER include source code syntax, raw math symbols, slashes like "and/or", abbreviations like "e.g.", "i.e.", "etc.", "w/", or currency shorthand like "₹1L/mo". Write how humans actually say them ("for example", "one lakh a month", "thirty to forty five seconds").',
        '3. Write short, breathable sentences (roughly 6-14 words per sentence). Keep each beat focused on one spoken idea so the teleprompter scrolls smoothly sentence by sentence.',
        '4. BANNED CLICHES: Never open with "Hello everyone", "Hey guys, welcome back", "In today\'s video", "Today I\'m going to share", "Have you ever wondered", or "In today\'s fast-paced world". Start mid-thought with tension, a relatable admission, a bold counter-intuitive truth, or a sharp specific question.',
        '5. NEVER translate template guidance literally. Express ideas natively in the requested language\'s natural creator idiom.',
        markdownMode
            ? '6. MARKDOWN EMPHASIS (REQUIRED): Include **bold** emphasis on 1-3 key spoken punch words across part1, bodyBeats, and part3, and put list items on separate lines starting with "- " when listing steps or tips.'
            : '6. PLAIN TEXT ONLY: Do not use **bold**, *italics*, markdown bullets, or special formatting characters.',
        '7. Always provide 3 genuinely distinct, scroll-stopping opening hooks in "hookAlternatives" matching the target language and tone.',
    ].join('\n')
}

export function buildGenerateUserPrompt(req: GenerateRequest): string {
    const template = normalizeTemplate(req.template)
    const tone = normalizeTone(req.tone)
    const lengthKey = normalizeLength(req.length)
    const lengthCfg = LENGTH_CONFIG[lengthKey]
    const platformKey = normalizePlatform(req.platform)
    const ctaKey = (req.ctaStyle ?? 'auto').trim().toLowerCase()
    const markdownMode = req.markdownMode !== false
    const coreMessage = (req.coreMessage || req.message || '').trim()

    const parts: string[] = [
        `TOPIC: ${(req.topic ?? '').trim()}`,
        `TOPIC ADHERENCE: Stay 100% focused on the exact TOPIC above from a video creator's camera perspective—every example and beat must directly support it.`,
        `PLATFORM & DELIVERY: ${PLATFORM_GUIDANCE[platformKey]}`,
        `TEMPLATE FORMAT (${template.toUpperCase()}): ${TEMPLATE_INSTRUCTIONS[template]}`,
        `TONE: ${TONE_DESCRIPTIONS[tone] ?? TONE_DESCRIPTIONS.casual}`,
        `STRICT LENGTH & BEAT STRUCTURE (${lengthCfg.label}):`,
        `- Total spoken words MUST fall between ${lengthCfg.min} and ${lengthCfg.max} words.`,
        `- part1 (Hook): ${lengthCfg.p1} (1-2 crisp sentences, no internal blank lines).`,
        `- bodyBeats (Main Body): Return EXACTLY ${lengthCfg.beats} distinct spoken beats (${lengthCfg.wordsPerBeat}, totaling ${lengthCfg.p2}). Develop each beat with concrete specifics, a relatable mistake, or an actionable step so you hit the full ${lengthCfg.min}-${lengthCfg.max} word target.`,
        `- part3 (Close/CTA): ${lengthCfg.p3}.`,
        `LANGUAGE: ${resolveLanguageInstruction(req)}`,
        `CTA STYLE: ${CTA_INSTRUCTIONS[ctaKey] ?? CTA_INSTRUCTIONS.auto}`,
    ]

    if (req.audience?.trim()) {
        parts.push(`TARGET AUDIENCE: ${req.audience.trim()}`)
    }
    if (coreMessage) {
        parts.push(`CORE TAKEAWAY / MUST INCLUDE POINTS: ${coreMessage}`)
    }
    if (req.customPrompt?.trim()) {
        parts.push(`CREATOR CUSTOM INSTRUCTIONS: ${req.customPrompt.trim()}`)
    }

    parts.push(
        markdownMode
            ? 'FORMATTING: Use **bold** on 1-3 key punch words per beat and "- " bullets where lists fit.'
            : 'FORMATTING: Clean plain spoken sentences only, zero markdown symbols.',
        '',
        'Generate: title (3-7 punchy words in the target language), part1 (scroll-stopping Hook), bodyBeats (array of spoken body beats), part3 (natural spoken Close/CTA), and hookAlternatives (3 varied alternative opening hooks in the same language and tone).'
    )

    return parts.join('\n')
}

export function buildLengthExpansionPrompt(
    raw: RawScriptOutput,
    req: GenerateRequest,
    lengthKey: 'short' | 'medium' | 'long',
    currentWords: number,
): string {
    const cfg = LENGTH_CONFIG[lengthKey]
    const currentBody = (raw.bodyBeats ?? []).join('\n\n')
    const markdownMode = req.markdownMode !== false
    return [
        `The draft script below is only ${currentWords} words, which is TOO SHORT for a ${cfg.label} (target: ${cfg.min}-${cfg.max} words).`,
        `EXPAND bodyBeats to EXACTLY ${cfg.beats} rich spoken beats (${cfg.wordsPerBeat}) by adding concrete real-world examples, a common mistake to avoid, and actionable specifics directly about: "${(req.topic ?? '').trim()}".`,
        `Keep the exact same language, tone, and spoken-word style.`,
        `LANGUAGE: ${resolveLanguageInstruction(req)}`,
        markdownMode
            ? 'Preserve **bold** emphasis on key spoken punch words.'
            : 'Use plain text only with zero markdown symbols.',
        '',
        'DRAFT TO EXPAND:',
        `Title: ${raw.title}`,
        `Hook (part1): ${raw.part1}`,
        `Body:\n${currentBody}`,
        `Close (part3): ${raw.part3}`,
        '',
        `Return the expanded JSON with total words strictly between ${cfg.min} and ${cfg.max} words.`,
    ].join('\n')
}

export function buildRefineUserPrompt(req: GenerateRequest): string {
    const existing = req.existingScript ?? {}
    const origWords = countWords(`${existing.part1 ?? ''} ${existing.part2 ?? ''} ${existing.part3 ?? ''}`)
    const rawInstr = (req.refineInstruction ?? '').trim()
    const markdownMode = req.markdownMode !== false

    const shortMin = Math.max(35, Math.round(origWords * 0.62))
    const shortMax = Math.max(50, Math.round(origWords * 0.75))

    const instructionMap: Record<string, string> = {
        punchier_hook: [
            'Rewrite part1 with a GENUINELY DIFFERENT, much stronger 3-second scroll-stopping hook.',
            'FORBIDDEN: Do NOT just add or swap 1-2 adjectives in the existing hook. Change the opening structure completely (use a sharp contrast, bold counter-intuitive claim, or specific tension question).',
            'Keep bodyBeats and part3 aligned with the new hook, and provide 3 completely distinct hookAlternatives.',
        ].join(' '),
        shorter: [
            `STRICT WORD BUDGET: The current script is ${origWords} words. Your tightened version MUST be between ${shortMin} and ${shortMax} words total (25-35% shorter).`,
            'Cut filler words and merge redundant lines across ALL sections—including part1 (hook), bodyBeats, and part3—while keeping the core insight sharp and warm.',
        ].join(' '),
        more_casual: 'Rewrite the phrasing so it sounds effortlessly natural—like talking to one close friend over coffee. Use spoken contractions, looser rhythm, and everyday words without losing the core message.',
        add_example: 'Add one vivid, relatable everyday real-world example or quick concrete analogy as a clear spoken beat inside bodyBeats so the viewer immediately pictures the idea.',
    }

    const goal = instructionMap[rawInstr] || rawInstr || 'Polish clarity, spoken rhythm, and hook punchiness while keeping the creator’s core topic intact.'

    return [
        `REFINE THIS EXISTING SCRIPT ACCORDING TO: ${goal}`,
        `LANGUAGE CONSTRAINT: ${resolveLanguageInstruction(req)}`,
        markdownMode
            ? 'FORMATTING: Preserve teleprompter-friendly **bold** emphasis and "- " bullets where appropriate.'
            : 'FORMATTING: Output clean plain text with zero markdown characters.',
        '',
        'CURRENT SCRIPT:',
        `Title: ${existing.title ?? ''}`,
        `Hook (part1): ${existing.part1 ?? ''}`,
        `Body (part2): ${existing.part2 ?? ''}`,
        `Close (part3): ${existing.part3 ?? ''}`,
        '',
        'Return the refined title, part1, bodyBeats (array of body paragraphs), part3, and 3 strong distinct hookAlternatives.',
    ].join('\n')
}

export function buildWeeklyChallengeSystemPrompt(): string {
    return [
        'You are an expert camera-confidence coach and spoken-word scriptwriter.',
        'Every script will be read aloud to a phone camera on a voice-following teleprompter.',
        '',
        'STRICT RULES:',
        '1. Write ONLY exact words meant to be spoken aloud. NEVER write stage directions ([pause], (smile)), labels ("Hook:", "Part 1:"), hashtags, URLs, or emojis.',
        '2. NO storybook narration ("Once upon a time", "Today I want to talk about..."). Use active, direct spoken sentences ("You" and "I").',
        '3. Keep sentences short and breathable (6-14 words) with \\n\\n breaks between natural thoughts.',
        '4. Every day in the requested range MUST have a unique angle progressing the user’s camera confidence.',
        '5. Follow the exact language instruction for EVERY field including titles.',
    ].join('\n')
}

export function buildWeeklyChallengeUserPrompt(req: GenerateRequest): string {
    const weekNumber = Number(req.weekNumber ?? 1)
    const startDay = req.startDay !== undefined ? Number(req.startDay) : (weekNumber - 1) * 7 + 1
    const endDay = req.endDay !== undefined ? Number(req.endDay) : Math.min(30, weekNumber * 7)
    const scriptCount = endDay - startDay + 1
    const range = getWordRangeForWeek(weekNumber)
    const part1Words = Math.round(range.min * 0.15)
    const part2Words = Math.round(range.min * 0.70)
    const part3Words = Math.round(range.min * 0.15)

    const answers = req.onboardingAnswers ?? {}
    const formatAnswer = (key: string, fallback: string): string => {
        const val = answers[key]
        if (Array.isArray(val) && val.length > 0) return val.join(', ')
        if (typeof val === 'string' && val.trim()) return val.trim()
        return fallback
    }

    const p = req.promptProfile ?? {}
    const profileLines: string[] = []
    if (p.systemPersona) profileLines.push(`Persona: ${p.systemPersona}`)
    if (p.coreIntent) profileLines.push(`Core Intent: ${p.coreIntent}`)
    if (p.speakerMindset) profileLines.push(`Speaker Mindset: ${p.speakerMindset}`)
    if (p.emotionalArc) profileLines.push(`Emotional Arc: ${p.emotionalArc}`)
    if (p.closingBehavior) profileLines.push(`Closing Behavior: ${p.closingBehavior}`)
    if (p.humanSpeechRules) profileLines.push(`Human Speech Rules:\n${p.humanSpeechRules.trim()}`)
    if (p.audienceMirrorRules) profileLines.push(`Audience Mirror:\n${p.audienceMirrorRules.trim()}`)
    if (p.culturalRules) profileLines.push(`Cultural Context:\n${p.culturalRules.trim()}`)
    if (p.forbiddenPatterns) profileLines.push(`Avoid:\n${p.forbiddenPatterns.trim()}`)

    return [
        `LANGUAGE: ${resolveLanguageInstruction(req)}`,
        '',
        `WEEK ${weekNumber} OF 30-DAY CAMERA CONFIDENCE JOURNEY`,
        `Generate EXACTLY ${scriptCount} personalized spoken scripts for Days ${startDay} through ${endDay}.`,
        '',
        'CREATOR PROFILE:',
        `- Name: ${(req.firstName ?? 'Creator').trim() || 'Creator'}`,
        `- Age: ${req.age ?? 25}`,
        `- Location: ${(req.location ?? '').trim() || 'Not specified'}`,
        `- Primary Goal: ${(req.goal ?? 'build camera confidence').trim()}`,
        `- Camera Challenges: ${formatAnswer('challenges', 'camera nervousness and self-doubt')}`,
        `- Content Style: ${formatAnswer('content_style', 'talking-head and educational videos')}`,
        `- Target Platforms: ${formatAnswer('platform', 'Instagram Reels and YouTube')}`,
        `- Daily Time Commitment: ${formatAnswer('time_commitment', '10-20 minutes')}`,
        '',
        ...(profileLines.length > 0 ? ['COACHING VOICE & STYLE PROFILE:', ...profileLines, ''] : []),
        'STRICT 3-PART STRUCTURE PER DAY:',
        `- part1 (Hook, ~${part1Words} words): Immediate scroll-stopper—relatable admission, direct question, or sharp contrast. Never "Hello everyone" or "Welcome to Day X".`,
        `- part2 (Body, ~${part2Words} words): Conversational, grounded spoken paragraphs separated by \\n\\n, connecting their real challenge/goal to lived insight.`,
        `- part3 (Close, ~${part3Words} words): Grounded punchy close or viewer engagement prompt.`,
        `- Total words per script: ${range.min} to ${range.max} words.`,
        '',
        `Return JSON with "scripts" array containing EXACTLY ${scriptCount} items with dayNumber from ${startDay} to ${endDay}.`,
    ].join('\n')
}

export function buildWarmupUserPrompt(req: GenerateRequest): string {
    const firstName = (req.firstName ?? 'Creator').trim() || 'Creator'
    const location = (req.location ?? '').trim()
    const goal = (req.goal ?? 'build camera confidence').trim()
    const locationText = location ? ` from ${location}` : ''

    return [
        `LANGUAGE: ${resolveLanguageInstruction(req)}`,
        '',
        `Create 3 short, natural camera-warmup scripts (60-95 words / 30-45 seconds each) for ${firstName}${locationText}.`,
        `Their goal: ${goal}`,
        '',
        'THEMES:',
        '- warmupIndex 0: "First Steps" — calming initial nerves and showing up imperfectly.',
        '- warmupIndex 1: "Finding Your Energy" — bringing genuine warmth and relaxed expression to the lens.',
        '- warmupIndex 2: "Ready to Start" — stepping confidently into the 30-day challenge.',
        '',
        'STRICT RULES:',
        '- Write like talking naturally to one friend on FaceTime—short breathable lines with \\n\\n breaks.',
        '- part1 (Hook): Energetic immediate opener (no stiff introductions).',
        '- part2 (Body): Honest spoken reflection tied to their goal.',
        '- part3 (Close): Firm, grounded commitment line.',
        '- Spoken words ONLY: zero stage directions, zero labels, zero emojis.',
    ].join('\n')
}

export function stripNonSpokenArtifacts(text: string, markdownMode: boolean): string {
    if (!text) return ''

    let s = text.replace(/\r\n/g, '\n')

    // Remove fenced code blocks if an LLM accidentally emits them
    s = s.replace(/```[\s\S]*?```/g, '')

    // Remove bracketed stage directions / timestamps like [Pause], [0-5 sec], [Cut to B-roll]
    s = s.replace(/\[[^\]]{1,60}\]/g, '')

    // Remove parenthetical stage directions (never speak cues)
    s = s.replace(/\(\s*(?:short\s+)?(?:pauses?|beats?|smiles?|smiling|laughs?|laughing|sighs?|nods?|cut to [^)]{0,30}|b-roll[^)]{0,30}|look at camera|camera [^)]{0,20}|music[^)]{0,20}|tone[^)]{0,20})\s*\)/gi, '')

    // Remove spoken label prefixes if placed at start of lines or text
    s = s.replace(/^(?:hook|part\s*[123]|body|close|outro|cta|intro)\s*[:\-–—]\s*/gim, '')

    // Remove markdown headings (# Title -> Title)
    s = s.replace(/^\s{0,3}#{1,6}\s+/gm, '')

    // Remove hashtags like #Reels or #CameraConfidence
    s = s.replace(/(^|\s)#[A-Za-z0-9_]+/g, '$1')

    // Remove graphic emojis that clutter teleprompter reading
    s = s.replace(/[\p{Extended_Pictographic}\uFE0F]/gu, '')

    // Split crammed inline bullet runs like "Point one. • Point two." onto separate lines
    s = s.replace(/\s*[•●▪◦]\s*/g, '\n- ')
    s = s.replace(/^\n+/, '')

    if (!markdownMode) {
        s = s
            .replace(/\*\*(.*?)\*\*/g, '$1')
            .replace(/__(.*?)__/g, '$1')
            .replace(/`([^`]*)`/g, '$1')
            .replace(/^\s*[-*]\s+/gm, '')
    }

    s = s
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()

    return s
}

export function countWords(text: string): number {
    const cleaned = text.trim()
    if (!cleaned) return 0
    return cleaned.split(/\s+/).filter(Boolean).length
}

export function joinBodyBeats(beats: string[] | undefined, markdownMode: boolean): string {
    if (!Array.isArray(beats) || beats.length === 0) return ''
    return beats
        .map((b) => stripNonSpokenArtifacts(b || '', markdownMode))
        .filter(Boolean)
        .join('\n\n')
}

export function sanitizeAndEnrich(
    raw: RawScriptOutput,
    req: GenerateRequest,
    norm: { template: string; tone: string; length: 'short' | 'medium' | 'long'; platform: string; markdownMode: boolean }
) {
    const title = stripNonSpokenArtifacts(raw.title || req.topic || 'Untitled Script', false)
        .replace(/^[“"'‘]|[”"'’]$/g, '')
        .slice(0, 120)

    const part1 = stripNonSpokenArtifacts(raw.part1 || '', norm.markdownMode)
    const part2 = joinBodyBeats(raw.bodyBeats, norm.markdownMode)
    const part3 = stripNonSpokenArtifacts(raw.part3 || '', norm.markdownMode)

    const altSet = new Set<string>()
    if (part1) altSet.add(part1)
    if (Array.isArray(raw.hookAlternatives)) {
        for (const h of raw.hookAlternatives) {
            const cleanH = stripNonSpokenArtifacts(h || '', norm.markdownMode)
            if (cleanH && !altSet.has(cleanH)) {
                altSet.add(cleanH)
            }
            if (altSet.size >= 3) break
        }
    }

    const p1Words = countWords(part1)
    const p2Words = countWords(part2)
    const p3Words = countWords(part3)
    const totalWords = p1Words + p2Words + p3Words
    const estimatedSeconds = totalWords > 0 ? Math.max(5, Math.round((totalWords / SPEAKING_WPM) * 60)) : 0

    const cfg = LENGTH_CONFIG[norm.length]
    const warnings: string[] = []
    if (!part1 || !part2 || !part3) {
        warnings.push('One or more script sections came back short; review before recording.')
    }
    if (req.action !== 'refine' && totalWords < Math.round(cfg.min * 0.85)) {
        warnings.push(`Generated ${totalWords} words (below ${norm.length} target ${cfg.min}-${cfg.max}w).`)
    }

    return {
        title,
        part1,
        part2,
        part3,
        hookAlternatives: Array.from(altSet),
        meta: {
            model: OPENAI_MODEL,
            action: req.action === 'refine' ? 'refine' : 'generate',
            template: norm.template,
            tone: norm.tone,
            length: norm.length,
            platform: norm.platform,
            languageCode: req.languageCode || null,
            markdownMode: norm.markdownMode,
            wordCount: totalWords,
            partWords: { part1: p1Words, part2: p2Words, part3: p3Words },
            estimatedSeconds,
            warnings,
        },
    }
}

export function sanitizeWeeklyScripts(
    raw: RawWeeklyScriptsOutput,
    req: GenerateRequest,
) {
    const weekNumber = Number(req.weekNumber ?? 1)
    const startDay = req.startDay !== undefined ? Number(req.startDay) : (weekNumber - 1) * 7 + 1
    const items = Array.isArray(raw.scripts) ? raw.scripts : []

    const scripts = items.map((item, idx) => {
        const expectedDay = startDay + idx
        const dayNumber = Number.isInteger(item.dayNumber) && item.dayNumber >= 1 && item.dayNumber <= 30
            ? item.dayNumber
            : expectedDay
        const title = stripNonSpokenArtifacts(item.title || `Day ${dayNumber}`, false)
            .replace(/^[“"'‘]|[”"'’]$/g, '')
            .slice(0, 120)
        const part1 = stripNonSpokenArtifacts(item.part1 || '', false)
        const part2 = stripNonSpokenArtifacts(item.part2 || '', false)
        const part3 = stripNonSpokenArtifacts(item.part3 || '', false)
        const wordCount = countWords(`${part1} ${part2} ${part3}`)
        const estSec = Math.max(15, Math.round((wordCount / SPEAKING_WPM) * 60))

        return {
            dayNumber,
            title: title || `Day ${dayNumber}`,
            part1,
            part2,
            part3,
            focus: stripNonSpokenArtifacts(item.focus || 'Camera confidence', false).slice(0, 80),
            duration: item.duration?.trim() || `${estSec} seconds`,
            wordCount,
        }
    })

    return {
        scripts,
        meta: {
            model: OPENAI_MODEL,
            action: 'weekly',
            weekNumber,
            languageCode: req.languageCode || 'en',
            count: scripts.length,
        },
    }
}

export function sanitizeWarmupScripts(
    raw: RawWarmupScriptsOutput,
    req: GenerateRequest,
) {
    const items = Array.isArray(raw.scripts) ? raw.scripts : []
    const defaultTitles = ['First Steps', 'Finding Your Energy', 'Ready to Start']

    const scripts = items.slice(0, 3).map((item, idx) => {
        const warmupIndex = Number.isInteger(item.warmupIndex) && item.warmupIndex >= 0 && item.warmupIndex <= 2
            ? item.warmupIndex
            : idx
        return {
            warmupIndex,
            title: stripNonSpokenArtifacts(item.title || defaultTitles[warmupIndex] || `Warmup ${warmupIndex + 1}`, false)
                .replace(/^[“"'‘]|[”"'’]$/g, '')
                .slice(0, 100),
            part1: stripNonSpokenArtifacts(item.part1 || '', false),
            part2: stripNonSpokenArtifacts(item.part2 || '', false),
            part3: stripNonSpokenArtifacts(item.part3 || '', false),
            focus: stripNonSpokenArtifacts(item.focus || 'Warmup presence', false).slice(0, 80),
        }
    })

    return {
        scripts,
        meta: {
            model: OPENAI_MODEL,
            action: 'warmup',
            languageCode: req.languageCode || 'en',
            count: scripts.length,
        },
    }
}
