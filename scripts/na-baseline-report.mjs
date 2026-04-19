#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SOURCE_URL = 'https://cc-maker.na-helper.ninja/default%20characters'
const OUTPUT_DIR = path.resolve(process.cwd(), 'reference', 'na-baseline')
const RAW_JSON_PATH = path.join(OUTPUT_DIR, 'na-helper-default-characters.raw.json')
const NORMALIZED_JSON_PATH = path.join(OUTPUT_DIR, 'na-helper-default-characters.normalized.json')
const SUMMARY_JSON_PATH = path.join(OUTPUT_DIR, 'na-helper-coverage-summary.json')
const REPORT_MD_PATH = path.join(OUTPUT_DIR, 'na-helper-coverage-report.md')

const NA_CLASS_CANON = new Set([
  'Action',
  'Affliction',
  'Chakra',
  'Control',
  'Instant',
  'Melee',
  'Mental',
  'Physical',
  'Ranged',
  'Unique',
])

const MECHANIC_DEFINITIONS = [
  {
    id: 'counter',
    label: 'Counter mechanics',
    pattern: /\bcounter\b/i,
    support: 'native',
    rationale:
      'Engine has first-class counter guards with class filtering and optional multi-trigger behavior.',
  },
  {
    id: 'reflect',
    label: 'Reflect mechanics',
    pattern: /\breflect(?:ed|ion)?\b/i,
    support: 'partial',
    rationale: 'Engine reflect guards now reroute core harmful effects with class filters and optional multi-trigger behavior, but not every skill-level pattern.',
  },
  {
    id: 'piercing',
    label: 'Piercing and unpierceable DR',
    pattern: /\bpiercing|unpierceable\b/i,
    support: 'native',
    rationale:
      'Damage effects expose piercing flags and the mitigation lane supports unpierceable-tagged reductions.',
  },
  {
    id: 'destructible_defense',
    label: 'Destructible defense',
    pattern: /\bdestructible defense|destroy destructible defense\b/i,
    support: 'partial',
    rationale:
      'Shield has first-class chip (`shieldDamage`) and shatter (`breakShield`) effects, but broader NA defense interactions remain partial.',
  },
  {
    id: 'chakra_economy',
    label: 'Chakra drain/steal/generation/cost pressure',
    pattern: /\bdrain|steal|chakra generation|chakra cost\b/i,
    support: 'native',
    rationale:
      'Engine now has explicit energyGain, energyDrain, energySteal, plus ability cost modifiers.',
  },
  {
    id: 'cooldown_manip',
    label: 'Cooldown increase/decrease',
    pattern: /\bcooldown\b/i,
    support: 'native',
    rationale:
      'Engine now supports cooldownAdjust for positive/negative deltas and keeps cooldownReduction for passive tempo.',
  },
  {
    id: 'transform_replace',
    label: 'Transformation / skill replacement',
    pattern: /\breplace|transformed?|awakening|during\b/i,
    support: 'native',
    rationale:
      'Engine has replaceAbility/replaceAbilities/modifyAbilityState and passive trigger hooks.',
  },
  {
    id: 'invulnerable',
    label: 'Invulnerability and anti-invuln clauses',
    pattern: /\binvulnerable|invulnerability|cannot become invulnerable\b/i,
    support: 'native',
    rationale:
      'Engine models invulnerability plus canGainInvulnerable gate and boolean modifier checks.',
  },
  {
    id: 'counter_reflect_immunity',
    label: 'Cannot be countered/reflected clauses',
    pattern: /\bcannot be countered|cannot be reflected\b/i,
    support: 'partial',
    rationale:
      'Ability/effect/packet flags exist for anti-counter and anti-reflect clauses.',
  },
]

const ENGINE_CLASS_ALIASES = {
  Chakra: 'Energy',
}

function slugify(input) {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function toCountObject(map) {
  return Object.fromEntries([...map.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))))
}

function bump(map, key, inc = 1) {
  map.set(key, (map.get(key) ?? 0) + inc)
}

function normalizeEnergy(energy) {
  const source = energy && typeof energy === 'object' ? energy : {}
  const read = (key) => {
    const value = Number(source[key] ?? 0)
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.trunc(value))
  }
  return {
    taijutsu: read('taijutsu'),
    bloodline: read('bloodline'),
    ninjutsu: read('ninjutsu'),
    genjutsu: read('genjutsu'),
    random: read('random'),
  }
}

function parseCooldown(rawCooldown) {
  const raw = String(rawCooldown ?? '').trim()
  if (!raw || raw.toLowerCase() === 'none') return { kind: 'none', value: null, raw }
  const numeric = Number(raw)
  if (Number.isFinite(numeric)) return { kind: 'turns', value: Math.max(0, Math.trunc(numeric)), raw }
  return { kind: 'text', value: null, raw }
}

function normalizeClasses(rawClasses, unknownClassTokens) {
  const classesRaw = String(rawClasses ?? '')
  const tokens = classesRaw
    .split(',')
    .map((token) => token.trim().replace(/\.+$/, ''))
    .filter(Boolean)

  const normalized = []
  const flagged = []
  for (const token of tokens) {
    const cleaned = token.replace(/\*/g, '').trim()
    if (!cleaned) continue
    if (!NA_CLASS_CANON.has(cleaned)) {
      unknownClassTokens.add(cleaned)
    }
    normalized.push(cleaned)
    if (token !== cleaned) flagged.push(token)
  }

  return { classes: normalized, classesRaw: tokens, classArtifacts: flagged }
}

function parseSkillRecord(skill, unknownClassTokens) {
  const name = String(skill?.name ?? '').trim()
  const description = String(skill?.description ?? '').trim()
  const image = String(skill?.image ?? '').trim()
  const cooldown = parseCooldown(skill?.cooldown)
  const energy = normalizeEnergy(skill?.energy)
  const { classes, classesRaw, classArtifacts } = normalizeClasses(skill?.classes, unknownClassTokens)

  return {
    name,
    description,
    image,
    cooldown,
    energy,
    classes,
    classesRaw,
    classArtifacts,
    isPassiveNamed: /^Passive:/i.test(name),
  }
}

function normalizeBaselineCharacters(input) {
  const unknownClassTokens = new Set()
  const idCollisions = new Map()
  const characters = input.map((entry, index) => {
    const name = String(entry?.characterName ?? `Character ${index + 1}`).trim()
    const baseId = slugify(name) || `character-${index + 1}`
    const collision = idCollisions.get(baseId) ?? 0
    idCollisions.set(baseId, collision + 1)
    const id = collision === 0 ? baseId : `${baseId}-${collision + 1}`
    const unlockRequirement = String(entry?.unlockRequirement ?? 'No requirements').trim() || 'No requirements'
    const portrait = String(entry?.characterPortrait ?? '').trim()
    const description = String(entry?.characterDescription ?? '').trim()
    const sourceSkills = Array.isArray(entry?.skills) ? entry.skills : []
    const skills = sourceSkills.map((skill, skillIndex) => ({
      id: `${id}:skill-${skillIndex + 1}`,
      slot: skillIndex + 1,
      ...parseSkillRecord(skill, unknownClassTokens),
    }))

    return {
      id,
      sourceIndex: index,
      name,
      description,
      portrait,
      unlockRequirement,
      skills,
    }
  })

  return {
    sourceUrl: SOURCE_URL,
    generatedAt: new Date().toISOString(),
    characterCount: characters.length,
    characters,
    unknownClassTokens: [...unknownClassTokens].sort((a, b) => a.localeCompare(b)),
  }
}

function extractTypeUnionMembers(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  if (start === -1 || end === -1 || end <= start) return []
  const segment = source.slice(start, end)
  return [...segment.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

function extractConstArrayMembers(source, startMarker, endMarker) {
  const start = source.indexOf(startMarker)
  const end = source.indexOf(endMarker)
  if (start === -1 || end === -1 || end <= start) return []
  const segment = source.slice(start, end)
  return [...segment.matchAll(/'([^']+)'/g)].map((match) => match[1])
}

function analyzeCoverage(normalized, engineTypesSource) {
  const allSkills = normalized.characters.flatMap((character) =>
    character.skills.map((skill) => ({ ...skill, characterName: character.name })),
  )

  const skillCountDistribution = new Map()
  const cooldownRawDistribution = new Map()
  const cooldownKindDistribution = new Map()
  const classDistribution = new Map()
  const classArtifactDistribution = new Map()

  let charactersWithUnlockRequirement = 0
  for (const character of normalized.characters) {
    if (character.unlockRequirement && character.unlockRequirement !== 'No requirements') {
      charactersWithUnlockRequirement += 1
    }
    bump(skillCountDistribution, character.skills.length)
  }

  for (const skill of allSkills) {
    bump(cooldownRawDistribution, skill.cooldown.raw || '(empty)')
    bump(cooldownKindDistribution, skill.cooldown.kind)
    for (const cls of skill.classes) bump(classDistribution, cls)
    for (const artifact of skill.classArtifacts) bump(classArtifactDistribution, artifact)
  }

  const engineSkillEffects = extractTypeUnionMembers(
    engineTypesSource,
    'export type SkillEffect =',
    'export type PassiveTrigger =',
  )
  const engineReactionConditions = extractTypeUnionMembers(
    engineTypesSource,
    'export type BattleReactionCondition =',
    'export type BattleScheduledPhase =',
  )
  const engineRangeClasses = extractConstArrayMembers(
    engineTypesSource,
    'export const battleSkillRangeValues',
    'export const battleSkillDamageTypeValues',
  )
  const engineDamageClasses = extractConstArrayMembers(
    engineTypesSource,
    'export const battleSkillDamageTypeValues',
    'export const battleSkillActionTypeValues',
  )
  const engineActionClasses = extractConstArrayMembers(
    engineTypesSource,
    'export const battleSkillActionTypeValues',
    'export type BattleAbilityIcon =',
  )
  const engineSkillClasses = [
    ...new Set([...engineRangeClasses, ...engineDamageClasses, ...engineActionClasses, 'Unique', 'Ultimate']),
  ].sort((a, b) => a.localeCompare(b))

  const naClasses = new Set([...classDistribution.keys()])
  const naClassesForEngine = new Set(
    [...naClasses].map((cls) => ENGINE_CLASS_ALIASES[cls] ?? cls),
  )
  const engineClassSet = new Set(engineSkillClasses)
  const naClassesMissingInEngine = [...naClassesForEngine].filter((cls) => !engineClassSet.has(cls)).sort()
  const engineClassesMissingInNa = [...engineClassSet].filter((cls) => !naClassesForEngine.has(cls)).sort()

  const mechanics = MECHANIC_DEFINITIONS.map((definition) => {
    const matches = allSkills.filter((skill) => definition.pattern.test(skill.description))
    return {
      ...definition,
      pattern: definition.pattern.source,
      count: matches.length,
      examples: matches.slice(0, 5).map((skill) => ({
        character: skill.characterName,
        skill: skill.name,
      })),
    }
  }).filter((entry) => entry.count > 0)

  const supportWeight = { native: 1, partial: 2, missing: 3 }
  const prioritizedGaps = mechanics
    .filter((entry) => entry.support !== 'native')
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      support: entry.support,
      mentions: entry.count,
      priorityScore: entry.count * (supportWeight[entry.support] ?? 2),
    }))
    .sort((a, b) => b.priorityScore - a.priorityScore)

  return {
    sourceUrl: normalized.sourceUrl,
    generatedAt: normalized.generatedAt,
    characterCount: normalized.characterCount,
    skillCount: allSkills.length,
    charactersWithUnlockRequirement,
    distributions: {
      skillCountPerCharacter: toCountObject(skillCountDistribution),
      cooldownRaw: toCountObject(cooldownRawDistribution),
      cooldownKind: toCountObject(cooldownKindDistribution),
      classes: toCountObject(classDistribution),
      classArtifacts: toCountObject(classArtifactDistribution),
    },
    engine: {
      skillEffects: engineSkillEffects,
      reactionConditions: engineReactionConditions,
      skillClasses: engineSkillClasses,
      naClassesMissingInEngine,
      engineClassesMissingInNa,
      unknownNaClassTokens: normalized.unknownClassTokens,
      classAliases: ENGINE_CLASS_ALIASES,
    },
    mechanics,
    prioritizedGaps,
  }
}

function toMarkdownReport(summary) {
  const lines = []
  lines.push('# NA Helper Baseline Coverage Report')
  lines.push('')
  lines.push(`Generated: ${summary.generatedAt}`)
  lines.push(`Source: ${summary.sourceUrl}`)
  lines.push('')
  lines.push('## Snapshot')
  lines.push('')
  lines.push(`- Characters: ${summary.characterCount}`)
  lines.push(`- Skill rows: ${summary.skillCount}`)
  lines.push(`- Characters with explicit unlock requirement: ${summary.charactersWithUnlockRequirement}`)
  lines.push('')
  lines.push('## Skill Slot Distribution')
  lines.push('')
  lines.push('| Skills per character | Character count |')
  lines.push('|---:|---:|')
  for (const [skills, count] of Object.entries(summary.distributions.skillCountPerCharacter)) {
    lines.push(`| ${skills} | ${count} |`)
  }
  lines.push('')
  lines.push('## Class Vocabulary Diff')
  lines.push('')
  lines.push(`- NA classes missing in engine class union: ${summary.engine.naClassesMissingInEngine.join(', ') || '(none)'}`)
  lines.push(`- Engine classes not present in NA baseline: ${summary.engine.engineClassesMissingInNa.join(', ') || '(none)'}`)
  lines.push(`- Unknown NA class tokens after normalization: ${summary.engine.unknownNaClassTokens.join(', ') || '(none)'}`)
  lines.push(`- Alias mapping applied for comparison: ${Object.entries(summary.engine.classAliases).map(([from, to]) => `${from}->${to}`).join(', ') || '(none)'}`)
  lines.push('')
  lines.push('## Prioritized Coverage Gaps')
  lines.push('')
  lines.push('| Mechanic | Support status | Mentions | Priority score |')
  lines.push('|---|---|---:|---:|')
  for (const gap of summary.prioritizedGaps) {
    lines.push(`| ${gap.label} | ${gap.support} | ${gap.mentions} | ${gap.priorityScore} |`)
  }
  lines.push('')
  lines.push('## Mechanic Matrix')
  lines.push('')
  lines.push('| Mechanic | Mentions | Support | Rationale |')
  lines.push('|---|---:|---|---|')
  for (const entry of summary.mechanics) {
    lines.push(`| ${entry.label} | ${entry.count} | ${entry.support} | ${entry.rationale} |`)
  }
  lines.push('')
  lines.push('## Sample Gap Examples')
  lines.push('')
  for (const entry of summary.mechanics.filter((item) => item.support !== 'native')) {
    lines.push(`### ${entry.label}`)
    for (const example of entry.examples) {
      lines.push(`- ${example.character} -> ${example.skill}`)
    }
    lines.push('')
  }
  lines.push('## Engine Type Snapshot')
  lines.push('')
  lines.push(`- SkillEffect variants (${summary.engine.skillEffects.length}): ${summary.engine.skillEffects.join(', ')}`)
  lines.push(`- Reaction conditions (${summary.engine.reactionConditions.length}): ${summary.engine.reactionConditions.join(', ')}`)
  lines.push(`- Skill classes (${summary.engine.skillClasses.length}): ${summary.engine.skillClasses.join(', ')}`)
  lines.push('')
  return `${lines.join('\n')}\n`
}

async function fetchJsonFromSource(url) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'cursed-arena-baseline/1.0',
      Accept: 'application/json,text/plain,*/*',
    },
  })
  if (!response.ok) {
    throw new Error(`Failed to fetch baseline source (${response.status} ${response.statusText})`)
  }
  return response.json()
}

async function main() {
  await mkdir(OUTPUT_DIR, { recursive: true })

  const raw = await fetchJsonFromSource(SOURCE_URL)
  if (!Array.isArray(raw)) {
    throw new Error('Baseline source did not return a top-level array.')
  }

  const normalized = normalizeBaselineCharacters(raw)
  const repoRoot = path.dirname(fileURLToPath(import.meta.url))
  const engineTypesPath = path.resolve(repoRoot, '..', 'src', 'features', 'battle', 'types.ts')
  const engineTypesSource = await readFile(engineTypesPath, 'utf8')
  const summary = analyzeCoverage(normalized, engineTypesSource)
  const report = toMarkdownReport(summary)

  await writeFile(RAW_JSON_PATH, JSON.stringify(raw, null, 2))
  await writeFile(NORMALIZED_JSON_PATH, JSON.stringify(normalized, null, 2))
  await writeFile(SUMMARY_JSON_PATH, JSON.stringify(summary, null, 2))
  await writeFile(REPORT_MD_PATH, report)

  console.log(`Wrote raw baseline: ${path.relative(process.cwd(), RAW_JSON_PATH)}`)
  console.log(`Wrote normalized baseline: ${path.relative(process.cwd(), NORMALIZED_JSON_PATH)}`)
  console.log(`Wrote coverage summary: ${path.relative(process.cwd(), SUMMARY_JSON_PATH)}`)
  console.log(`Wrote markdown report: ${path.relative(process.cwd(), REPORT_MD_PATH)}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
