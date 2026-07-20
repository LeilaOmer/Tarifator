// Teste pentru nucleul agentului TikTok.
// Ruleaza cu runner-ul built-in din Node (`node --test`), pe TypeScript nativ —
// zero dependente, zero cost. Apelul catre Groq e injectat (ChatFn fals), deci
// testele nu ating reteaua si nu au nevoie de cheie API.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TIKTOK_TONES,
  TIKTOK_TONE_LABELS,
  buildUserMessage,
  buildVariantsSystemPrompt,
  buildSingleSystemPrompt,
  parseContent,
  parseVariantSet,
  generateTikTokVariants,
  generateTikTokContent,
  type ChatFn,
  type TikTokTone,
} from './generate.ts'

// Un corp valid de varianta, pentru un ton dat.
function variantBody(tone: TikTokTone) {
  return {
    tone,
    hook: `hook ${tone}`,
    script: `[Scena 1 - 0-3s] ${tone}`,
    description: `descriere ${tone} 🎬`,
    hashtags: ['#tarifator', '#meseriasi'],
    videoPrompt: `english video prompt for ${tone}`,
  }
}

// JSON valid cu toate cele 3 variante (ordine amestecata dinadins).
function validVariantsJson(): string {
  return JSON.stringify({
    idea: 'Cum scapi de pretul dat din burta',
    variants: [
      variantBody('funny'),
      variantBody('controversial'),
      variantBody('educational'),
    ],
  })
}

// --- Constante / tipuri ---

test('exista exact 3 tonuri, in ordinea canonica', () => {
  assert.deepEqual([...TIKTOK_TONES], ['educational', 'funny', 'controversial'])
  for (const tone of TIKTOK_TONES) {
    assert.equal(typeof TIKTOK_TONE_LABELS[tone], 'string')
    assert.ok(TIKTOK_TONE_LABELS[tone].length > 0)
  }
})

// --- buildUserMessage ---

test('buildUserMessage include tema cand e data', () => {
  const msg = buildUserMessage('pentru electricieni')
  assert.match(msg, /pentru electricieni/)
})

test('buildUserMessage cere agentului sa aleaga cand tema lipseste', () => {
  const msg = buildUserMessage(null)
  assert.match(msg, /alege tu/i)
})

// --- Prompturile contin adevarul despre produs (nu inventat) ---

test('prompturile ancoreaza in functii reale Tarifator', () => {
  for (const p of [buildSingleSystemPrompt(), buildVariantsSystemPrompt()]) {
    assert.match(p, /Fise Servicii/)
    assert.match(p, /Calculator Pret/)
    assert.match(p, /Nu inventa functii/)
  }
})

test('promptul de variante descrie cele 3 tonuri', () => {
  const p = buildVariantsSystemPrompt()
  assert.match(p, /educational/)
  assert.match(p, /funny/)
  assert.match(p, /controversial/)
})

// --- parseVariantSet ---

test('parseVariantSet intoarce 3 variante in ordine canonica, indiferent de ordinea din JSON', () => {
  const set = parseVariantSet(validVariantsJson(), 'tema x')
  assert.equal(set.topic, 'tema x')
  assert.equal(set.idea, 'Cum scapi de pretul dat din burta')
  assert.deepEqual(
    set.variants.map((v) => v.tone),
    ['educational', 'funny', 'controversial'],
  )
  // fiecare varianta e completa si tipizata
  for (const v of set.variants) {
    assert.ok(v.hook.length > 0)
    assert.ok(v.script.length > 0)
    assert.ok(v.description.length > 0)
    assert.ok(Array.isArray(v.hashtags) && v.hashtags.length > 0)
    assert.match(v.videoPrompt, /english/)
  }
})

test('parseVariantSet accepta si variante ca obiect cheiat pe ton', () => {
  const raw = JSON.stringify({
    idea: 'idee comuna',
    variants: {
      educational: variantBody('educational'),
      funny: variantBody('funny'),
      controversial: variantBody('controversial'),
    },
  })
  const set = parseVariantSet(raw, null)
  assert.equal(set.topic, null)
  assert.deepEqual(
    set.variants.map((v) => v.tone),
    ['educational', 'funny', 'controversial'],
  )
})

test('parseVariantSet arunca eroare cand lipseste un ton', () => {
  const raw = JSON.stringify({
    idea: 'idee',
    variants: [variantBody('educational'), variantBody('funny')],
  })
  assert.throws(() => parseVariantSet(raw, null), /Lipsesc variante.*controversial/)
})

test('parseVariantSet arunca eroare fara idee', () => {
  const raw = JSON.stringify({ variants: [variantBody('educational')] })
  assert.throws(() => parseVariantSet(raw, null), /idee/)
})

test('parseVariantSet arunca eroare pe non-JSON', () => {
  assert.throws(() => parseVariantSet('nu e json aici', null), /JSON/)
})

test('parseVariantSet curata hashtag-urile (spatii, goale, non-string)', () => {
  const dirty = {
    ...variantBody('educational'),
    hashtags: ['  #ok  ', '', '   ', 42, '#bun'],
  }
  const raw = JSON.stringify({
    idea: 'idee',
    variants: [dirty, variantBody('funny'), variantBody('controversial')],
  })
  const set = parseVariantSet(raw, null)
  assert.deepEqual(set.variants[0].hashtags, ['#ok', '42', '#bun'])
})

// --- parseContent (varianta single) ---

test('parseContent normalizeaza continutul unic', () => {
  const raw = JSON.stringify({
    idea: '  ideea  ',
    hook: 'hook',
    script: 'script',
    description: 'desc',
    hashtags: ['#a'],
    videoPrompt: 'prompt',
  })
  const c = parseContent(raw)
  assert.equal(c.idea, 'ideea')
  assert.equal(c.hook, 'hook')
  assert.deepEqual(c.hashtags, ['#a'])
})

// --- Flux end-to-end cu Groq injectat (fara retea) ---

test('generateTikTokVariants foloseste chat-ul injectat si intoarce set tipizat', async () => {
  let calls = 0
  const fakeChat: ChatFn = async (messages) => {
    calls++
    // primeste system + user
    assert.equal(messages.length, 2)
    assert.equal(messages[0].role, 'system')
    assert.equal(messages[1].role, 'user')
    assert.match(messages[1].content, /electricieni/)
    return validVariantsJson()
  }
  const set = await generateTikTokVariants({ topic: 'electricieni' }, { chat: fakeChat })
  assert.equal(calls, 1)
  assert.equal(set.topic, 'electricieni')
  assert.equal(set.variants.length, 3)
})

test('generateTikTokContent foloseste chat-ul injectat', async () => {
  const fakeChat: ChatFn = async () =>
    JSON.stringify({
      idea: 'o idee',
      hook: 'h',
      script: 's',
      description: 'd',
      hashtags: ['#x'],
      videoPrompt: 'p',
    })
  const c = await generateTikTokContent({}, { chat: fakeChat })
  assert.equal(c.idea, 'o idee')
  assert.equal(c.hook, 'h')
  assert.deepEqual(c.hashtags, ['#x'])
})
