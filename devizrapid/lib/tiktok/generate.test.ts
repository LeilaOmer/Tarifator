// Teste pentru nucleul agentului TikTok.
// Ruleaza cu runner-ul built-in din Node (`node --test`), pe TypeScript nativ —
// zero dependente, zero cost. Apelul catre Groq e injectat (ChatFn fals), deci
// testele nu ating reteaua si nu au nevoie de cheie API.

import { test } from 'node:test'
import assert from 'node:assert/strict'

import {
  CONTENT_TYPE_IDS,
  CONTENT_TYPES,
  GOAL_IDS,
  GOALS,
  DEFAULT_RECIPES,
  buildUserMessage,
  buildVariantsSystemPrompt,
  buildSingleSystemPrompt,
  parseContent,
  parseVariantSet,
  generateTikTokVariants,
  generateTikTokContent,
  type ChatFn,
  type TikTokContentType,
} from './generate.ts'
import { variantSetToRows } from './store.ts'

// Corpul de continut trimis de "model": doar content_type + continut.
// NU include goal — acela vine din reteta (cod).
function variantBody(ct: TikTokContentType) {
  return {
    content_type: ct,
    hook: `hook ${ct}`,
    script: `[Scena 1 - 0-3s] ${ct}`,
    description: `descriere ${ct} 🎬`,
    hashtags: ['#tarifator', '#meseriasi'],
    cta: `cta ${ct}`,
    videoPrompt: `english video prompt for ${ct}`,
  }
}

// JSON valid cu variantele setului implicit (ordine amestecata dinadins).
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

// --- Cele doua axe (content_type si goal sunt SEPARATE) ---

test('content_type si goal sunt liste distincte, complete', () => {
  assert.ok(CONTENT_TYPE_IDS.includes('educational'))
  assert.ok(CONTENT_TYPE_IDS.includes('story')) // extensibil
  assert.deepEqual([...GOAL_IDS], ['awareness', 'engagement', 'conversion'])
  for (const id of CONTENT_TYPE_IDS) {
    assert.equal(CONTENT_TYPES[id].id, id)
    assert.ok(CONTENT_TYPES[id].styleBrief.length > 0)
  }
  for (const id of GOAL_IDS) {
    assert.equal(GOALS[id].id, id)
    assert.ok(GOALS[id].ctaType.length > 0)
    assert.ok(GOALS[id].kpi.length > 0)
  }
})

test('setul implicit are content_type-uri unice (cheia de potrivire)', () => {
  const types = DEFAULT_RECIPES.map((r) => r.contentType)
  assert.equal(new Set(types).size, types.length)
  // fiecare reteta referentiaza axe valide
  for (const r of DEFAULT_RECIPES) {
    assert.ok((CONTENT_TYPE_IDS as readonly string[]).includes(r.contentType))
    assert.ok((GOAL_IDS as readonly string[]).includes(r.goal))
  }
})

// --- buildUserMessage ---

test('buildUserMessage include tema cand e data', () => {
  assert.match(buildUserMessage('pentru electricieni'), /pentru electricieni/)
})

test('buildUserMessage cere agentului sa aleaga cand tema lipseste', () => {
  assert.match(buildUserMessage(null), /alege tu/i)
})

// --- Prompturile: adevar despre produs + cele doua axe ---

test('prompturile ancoreaza in functii reale Tarifator', () => {
  for (const p of [buildSingleSystemPrompt(), buildVariantsSystemPrompt()]) {
    assert.match(p, /Fise Servicii/)
    assert.match(p, /Calculator Pret/)
    assert.match(p, /Nu inventa functii/)
  }
})

test('promptul de variante briefeaza content_type SI goal', () => {
  const p = buildVariantsSystemPrompt()
  assert.match(p, /content_type/)
  assert.match(p, /goal/)
  assert.match(p, /KPI/)
})

// --- parseVariantSet ---

test('parseVariantSet intoarce variantele in ordinea retetelor, indiferent de ordinea din JSON', () => {
  const set = parseVariantSet(validVariantsJson(), 'tema x')
  assert.equal(set.topic, 'tema x')
  assert.equal(set.idea, 'Cum scapi de pretul dat din burta')
  assert.deepEqual(
    set.variants.map((v) => v.contentType),
    DEFAULT_RECIPES.map((r) => r.contentType),
  )
  for (const v of set.variants) {
    assert.ok(v.hook.length > 0)
    assert.ok(v.script.length > 0)
    assert.ok(v.cta.length > 0)
    assert.ok(Array.isArray(v.hashtags) && v.hashtags.length > 0)
    assert.match(v.videoPrompt, /english/)
  }
})

test('parseVariantSet ataseaza goal-ul din RETETA (cod), nu din model', () => {
  // Modelul trimite doar content_type; goal-ul vine determinist din DEFAULT_RECIPES.
  const set = parseVariantSet(validVariantsJson(), null)
  for (const r of DEFAULT_RECIPES) {
    const v = set.variants.find((x) => x.contentType === r.contentType)!
    assert.equal(v.goal, r.goal)
  }
})

test('parseVariantSet accepta si variante ca obiect cheiat pe content_type', () => {
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
    set.variants.map((v) => v.contentType),
    DEFAULT_RECIPES.map((r) => r.contentType),
  )
})

test('parseVariantSet arunca eroare cand lipseste o varianta', () => {
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
    cta: 'incearca gratis',
    videoPrompt: 'prompt',
  })
  const c = parseContent(raw)
  assert.equal(c.idea, 'ideea')
  assert.equal(c.cta, 'incearca gratis')
  assert.deepEqual(c.hashtags, ['#a'])
})

// --- Maparea la randuri DB (persistenta) ---

test('variantSetToRows produce cate un rand per varianta, cu metadate', () => {
  const set = parseVariantSet(validVariantsJson(), 'electricieni')
  const rows = variantSetToRows(set, { userId: 'u1', setId: 's1', model: 'm1' })
  assert.equal(rows.length, DEFAULT_RECIPES.length)
  for (const row of rows) {
    assert.equal(row.user_id, 'u1')
    assert.equal(row.set_id, 's1') // acelasi set_id grupeaza variantele
    assert.equal(row.model, 'm1')
    assert.equal(row.topic, 'electricieni')
    assert.equal(row.idea, set.idea)
    // camelCase -> snake_case
    assert.ok('content_type' in row && 'video_prompt' in row)
    assert.ok(row.content_type.length > 0)
    assert.ok(row.goal.length > 0)
  }
  // goal-ul din rand oglindeste reteta
  const eduRow = rows.find((r) => r.content_type === 'educational')!
  assert.equal(eduRow.goal, 'conversion')
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
  assert.equal(set.variants.length, DEFAULT_RECIPES.length)
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
