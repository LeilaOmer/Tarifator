// Teste pentru nucleul agentului TikTok.
// Ruleaza cu runner-ul built-in din Node (`node --test`), pe TypeScript nativ —
// zero dependente, zero cost. Apelul catre Groq e injectat (ChatFn fals), deci
// testele nu ating reteaua si nu au nevoie de cheie API.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  TIKTOK_STRATEGY_IDS,
  TIKTOK_STRATEGIES,
  buildUserMessage,
  buildVariantsSystemPrompt,
  buildSingleSystemPrompt,
  parseContent,
  parseVariantSet,
  generateTikTokVariants,
  generateTikTokContent,
  type ChatFn,
  type TikTokStrategyId,
} from './generate.ts'

// Corpul de continut trimis de "model": doar id-ul strategiei + continut.
// NU include metadatele strategiei (obiectiv/kpi) — acelea le ataseaza codul.
function variantBody(id: TikTokStrategyId) {
  return {
    strategy: id,
    hook: `hook ${id}`,
    script: `[Scena 1 - 0-3s] ${id}`,
    description: `descriere ${id} 🎬`,
    hashtags: ['#tarifator', '#meseriasi'],
    cta: `cta ${id}`,
    videoPrompt: `english video prompt for ${id}`,
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

// --- Strategii (contractul de business) ---

test('exista exact 3 strategii, in ordinea canonica', () => {
  assert.deepEqual([...TIKTOK_STRATEGY_IDS], ['educational', 'funny', 'controversial'])
})

test('fiecare strategie e completa: obiectiv, funnel, parghie, CTA, KPI', () => {
  for (const id of TIKTOK_STRATEGY_IDS) {
    const s = TIKTOK_STRATEGIES[id]
    assert.equal(s.id, id)
    for (const field of ['label', 'objective', 'audience', 'lever', 'ctaType', 'kpi', 'styleBrief'] as const) {
      assert.ok(s[field].length > 0, `${id}.${field} gol`)
    }
    assert.ok(['awareness', 'consideration', 'conversion'].includes(s.funnelStage))
  }
})

test('strategiile au obiective distincte (nu doar stiluri)', () => {
  const objectives = TIKTOK_STRATEGY_IDS.map((id) => TIKTOK_STRATEGIES[id].objective)
  assert.equal(new Set(objectives).size, 3)
})

// --- buildUserMessage ---

test('buildUserMessage include tema cand e data', () => {
  assert.match(buildUserMessage('pentru electricieni'), /pentru electricieni/)
})

test('buildUserMessage cere agentului sa aleaga cand tema lipseste', () => {
  assert.match(buildUserMessage(null), /alege tu/i)
})

// --- Prompturile contin adevarul despre produs + strategiile ---

test('prompturile ancoreaza in functii reale Tarifator', () => {
  for (const p of [buildSingleSystemPrompt(), buildVariantsSystemPrompt()]) {
    assert.match(p, /Fise Servicii/)
    assert.match(p, /Calculator Pret/)
    assert.match(p, /Nu inventa functii/)
  }
})

test('promptul de variante briefeaza cele 3 strategii cu obiectiv si KPI', () => {
  const p = buildVariantsSystemPrompt()
  for (const id of TIKTOK_STRATEGY_IDS) {
    assert.match(p, new RegExp(id))
  }
  assert.match(p, /obiectiv =/)
  assert.match(p, /KPI/)
})

// --- parseVariantSet ---

test('parseVariantSet intoarce 3 variante in ordine canonica, indiferent de ordinea din JSON', () => {
  const set = parseVariantSet(validVariantsJson(), 'tema x')
  assert.equal(set.topic, 'tema x')
  assert.equal(set.idea, 'Cum scapi de pretul dat din burta')
  assert.deepEqual(
    set.variants.map((v) => v.strategy.id),
    ['educational', 'funny', 'controversial'],
  )
  for (const v of set.variants) {
    assert.ok(v.hook.length > 0)
    assert.ok(v.script.length > 0)
    assert.ok(v.description.length > 0)
    assert.ok(v.cta.length > 0)
    assert.ok(Array.isArray(v.hashtags) && v.hashtags.length > 0)
    assert.match(v.videoPrompt, /english/)
  }
})

test('parseVariantSet ataseaza metadatele strategiei din COD, nu din model', () => {
  // Modelul trimite doar id + continut; obiectivul/kpi vin din TIKTOK_STRATEGIES.
  const set = parseVariantSet(validVariantsJson(), null)
  const edu = set.variants.find((v) => v.strategy.id === 'educational')!
  assert.equal(edu.strategy.objective, TIKTOK_STRATEGIES.educational.objective)
  assert.equal(edu.strategy.kpi, TIKTOK_STRATEGIES.educational.kpi)
  assert.equal(edu.strategy.funnelStage, 'consideration')
})

test('parseVariantSet accepta si variante ca obiect cheiat pe strategie', () => {
  const raw = JSON.stringify({
    idea: 'idee comuna',
    variants: {
      educational: variantBody('educational'),
      funny: variantBody('funny'),
      controversial: variantBody('controversial'),
    },
  })
  const set = parseVariantSet(raw, null)
  assert.deepEqual(
    set.variants.map((v) => v.strategy.id),
    ['educational', 'funny', 'controversial'],
  )
})

test('parseVariantSet arunca eroare cand lipseste o strategie', () => {
  const raw = JSON.stringify({
    idea: 'idee',
    variants: [variantBody('educational'), variantBody('funny')],
  })
  assert.throws(() => parseVariantSet(raw, null), /Lipsesc strategii.*controversial/)
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
    cta: 'incearca gratis',
    videoPrompt: 'prompt',
  })
  const c = parseContent(raw)
  assert.equal(c.idea, 'ideea')
  assert.equal(c.cta, 'incearca gratis')
  assert.deepEqual(c.hashtags, ['#a'])
})

// --- Flux end-to-end cu Groq injectat (fara retea) ---

test('generateTikTokVariants foloseste chat-ul injectat si intoarce set tipizat', async () => {
  let calls = 0
  const fakeChat: ChatFn = async (messages) => {
    calls++
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
      cta: 'c',
      videoPrompt: 'p',
    })
  const c = await generateTikTokContent({}, { chat: fakeChat })
  assert.equal(c.idea, 'o idee')
  assert.equal(c.hook, 'h')
  assert.equal(c.cta, 'c')
  assert.deepEqual(c.hashtags, ['#x'])
})
