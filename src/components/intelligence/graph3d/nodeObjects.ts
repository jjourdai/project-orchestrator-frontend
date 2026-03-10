// ============================================================================
// 3D Node Objects — Emoji-centric design with colored ring + circular label
// ============================================================================
//
// Each entity is represented by its EMOJI as the primary visual element.
// No 3D mesh shapes — the emoji IS the node.
//
// Visual hierarchy:
//   1. Single billboard sprite combining: colored ring border + circular name
//      (+ optional subtitle on a second inner/top arc for chat_session nodes)
//   2. Emoji (center, billboard sprite) — scaled by energy
//   3. Subtle glow halo (high energy only)
//
// Everything is billboard sprites so all elements share the same orientation
// (always facing the camera). This fixes the axis alignment issue between
// the ring and the emoji/text.
//
// IMPORTANT: Canvas textures are cached by (entityType + label + subtitle + energyBucket)
// to avoid creating unique textures per node when possible.
// ============================================================================

import * as THREE from 'three'
import SpriteText from 'three-spritetext'
import { ENTITY_COLORS } from '@/constants/intelligence'
import type { Graph3DNode } from './useGraph3DLayout'

// SpriteText extends Sprite extends Object3D — has .position
type SpriteTextInstance = SpriteText & THREE.Object3D

// ── Entity emojis — status-aware ─────────────────────────────────────────────
// Entities with lifecycle statuses get different emojis per state.
// The default (no status or unknown status) falls back to the base emoji.

const ENTITY_EMOJIS: Record<string, string> = {
  // Code layer
  file: '📄',
  function: '⚡',
  struct: '🏗️',
  trait: '🧬',
  enum: '📋',
  // PM layer
  plan: '🎯',
  task: '📌',
  step: '👣',
  milestone: '🏁',
  release: '🚀',
  commit: '💾',
  // Knowledge layer
  note: '📝',
  decision: '⚖️',
  constraint: '🛡️',
  // Skills layer
  skill: '🧠',
  // Behavioral layer
  protocol: '🔄',
  protocol_state: '⭕',
  // Chat layer
  chat_session: '💬',
  // Feature graph
  feature_graph: '🔮',
}

/** Status-specific emoji overrides — (entityType, status) → emoji */
const STATUS_EMOJIS: Record<string, Record<string, string>> = {
  task: {
    pending:     '⏳',
    in_progress: '🔨',
    blocked:     '🚧',
    completed:   '✅',
    failed:      '❌',
  },
  step: {
    pending:     '⬜',
    in_progress: '▶️',
    completed:   '✅',
    skipped:     '⏭️',
  },
  plan: {
    draft:       '📝',
    approved:    '🎯',
    in_progress: '🔥',
    completed:   '🏆',
    cancelled:   '🚫',
  },
  milestone: {
    planned:     '📍',
    open:        '🏁',
    in_progress: '🏃',
    completed:   '🎉',
    closed:      '🔒',
  },
  release: {
    planned:     '📦',
    in_progress: '🔧',
    released:    '🚀',
    cancelled:   '🚫',
  },
  decision: {
    proposed:    '💭',
    accepted:    '⚖️',
    deprecated:  '📉',
    superseded:  '🔀',
  },
  note: {
    active:       '📝',
    needs_review: '🔍',
    stale:        '📜',
    obsolete:     '🗑️',
    archived:     '📦',
  },
}

/** Get the emoji for a node, considering its status */
function getStatusEmoji(entityType: string, status?: string): string {
  if (status) {
    const statusMap = STATUS_EMOJIS[entityType]
    if (statusMap?.[status]) return statusMap[status]
  }
  return ENTITY_EMOJIS[entityType] ?? '❓'
}

// ── Helper: draw text along a circular arc ──────────────────────────────────

function drawTextOnArc(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  fontSize: number,
  fillColor: string,
  alpha: number,
  /** Center angle of the arc (radians). PI/2 = bottom, -PI/2 = top */
  centerAngle: number,
  /** If true, characters are flipped so text reads correctly on the top arc */
  flipForTop: boolean,
) {
  ctx.font = `bold ${fontSize}px Inter, system-ui, sans-serif`
  ctx.fillStyle = fillColor
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  const chars = [...text]
  const charWidths: number[] = []
  let totalWidth = 0
  for (const ch of chars) {
    const w = ctx.measureText(ch).width
    charWidths.push(w)
    totalWidth += w
  }

  const totalAngle = totalWidth / radius
  // For bottom arc: start left, go right (decreasing angle in canvas coords)
  // For top arc: start right, go left (increasing angle)
  let currentAngle: number
  if (flipForTop) {
    currentAngle = centerAngle - totalAngle / 2
  } else {
    currentAngle = centerAngle + totalAngle / 2
  }

  ctx.globalAlpha = alpha
  for (let i = 0; i < chars.length; i++) {
    const charAngle = charWidths[i] / radius

    if (flipForTop) {
      currentAngle += charAngle / 2
      ctx.save()
      ctx.translate(
        cx + radius * Math.cos(currentAngle),
        cy + radius * Math.sin(currentAngle),
      )
      ctx.rotate(currentAngle + Math.PI / 2)
      ctx.fillText(chars[i], 0, 0)
      ctx.restore()
      currentAngle += charAngle / 2
    } else {
      currentAngle -= charAngle / 2
      ctx.save()
      ctx.translate(
        cx + radius * Math.cos(currentAngle),
        cy + radius * Math.sin(currentAngle),
      )
      ctx.rotate(currentAngle - Math.PI / 2)
      ctx.fillText(chars[i], 0, 0)
      ctx.restore()
      currentAngle -= charAngle / 2
    }
  }
  ctx.globalAlpha = 1.0
}

// ── Ring + circular label (single canvas billboard sprite) ────────────────────
// Combines the colored ring border AND the name in an arc into one texture.
// Supports an optional subtitle drawn on a second arc (top half).

const ringLabelTextureCache = new Map<string, THREE.CanvasTexture>()
const ringLabelMaterialCache = new Map<string, THREE.SpriteMaterial>()

/** Progress info for entities with steps/children */
interface NodeProgress {
  completed: number
  total: number
}

function createRingLabelSprite(
  text: string,
  color: string,
  energy: number,
  subtitle?: string,
  progress?: NodeProgress,
  status?: string,
): THREE.Sprite {
  const maxLen = 32
  const maxSubLen = 28
  const displayText = text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text
  const displaySub = subtitle
    ? (subtitle.length > maxSubLen ? subtitle.slice(0, maxSubLen - 1) + '\u2026' : subtitle)
    : undefined
  const opacityBucket = energy > 0.7 ? 'bright' : energy > 0.3 ? 'mid' : 'dim'
  const progressRatio = progress && progress.total > 0 ? progress.completed / progress.total : -1
  const progressBucket = progressRatio >= 0 ? Math.round(progressRatio * 20) / 20 : -1 // 5% steps
  const isWorking = status === 'in_progress'
  const cacheKey = `${displayText}:${displaySub ?? ''}:${color}:${opacityBucket}:${progressBucket}:${isWorking ? 'w' : ''}`

  let texture = ringLabelTextureCache.get(cacheKey)
  if (!texture) {
    const size = 512
    const canvas = document.createElement('canvas')
    canvas.width = size
    canvas.height = size
    const ctx = canvas.getContext('2d')!

    const cx = size / 2
    const cy = size / 2
    const ringRadius = size * 0.36
    const ringWidth = opacityBucket === 'bright' ? 6 : opacityBucket === 'mid' ? 5 : 3
    const ringAlpha = opacityBucket === 'bright' ? 0.9 : opacityBucket === 'mid' ? 0.65 : 0.4

    // ── Draw ring border ──
    if (progressRatio >= 0) {
      // Progress mode: background track (dim) + progress fill arc
      const progressArcWidth = ringWidth + 4
      const startAngle = -Math.PI / 2 // 12 o'clock

      // Background track — full circle, dim
      ctx.beginPath()
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.globalAlpha = 0.15
      ctx.lineWidth = progressArcWidth
      ctx.stroke()
      ctx.globalAlpha = 1.0

      // Progress fill — partial arc, bright
      if (progressRatio > 0) {
        const endAngle = startAngle + (Math.PI * 2 * progressRatio)
        const progressColor = progressRatio >= 1.0
          ? '#22c55e' // green-500 — fully complete
          : isWorking
            ? '#818cf8' // indigo-400 — in progress
            : color      // default entity color
        ctx.beginPath()
        ctx.arc(cx, cy, ringRadius, startAngle, endAngle)
        ctx.strokeStyle = progressColor
        ctx.globalAlpha = 0.9
        ctx.lineWidth = progressArcWidth
        ctx.lineCap = 'round'
        ctx.stroke()
        ctx.lineCap = 'butt'
        ctx.globalAlpha = 1.0
      }
    } else {
      // Standard ring — no progress
      ctx.beginPath()
      ctx.arc(cx, cy, ringRadius, 0, Math.PI * 2)
      ctx.strokeStyle = color
      ctx.globalAlpha = ringAlpha
      ctx.lineWidth = ringWidth
      ctx.stroke()
      ctx.globalAlpha = 1.0
    }

    // ── Working indicator badge (top-right of ring) ──
    if (isWorking) {
      const badgeAngle = -Math.PI / 4 // 1:30 position
      const bx = cx + ringRadius * Math.cos(badgeAngle)
      const by = cy + ringRadius * Math.sin(badgeAngle)
      const badgeR = 14

      // Pulsing dot background
      ctx.beginPath()
      ctx.arc(bx, by, badgeR + 4, 0, Math.PI * 2)
      ctx.fillStyle = '#818cf8'
      ctx.globalAlpha = 0.25
      ctx.fill()
      ctx.globalAlpha = 1.0

      // Solid dot
      ctx.beginPath()
      ctx.arc(bx, by, badgeR, 0, Math.PI * 2)
      ctx.fillStyle = '#818cf8'
      ctx.globalAlpha = 0.9
      ctx.fill()
      ctx.globalAlpha = 1.0

      // Gear icon ⚙ inside the badge
      ctx.font = `${badgeR * 1.4}px Inter, system-ui, sans-serif`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillStyle = '#ffffff'
      ctx.globalAlpha = 0.95
      ctx.fillText('⚙', bx, by + 1)
      ctx.globalAlpha = 1.0
    }

    // ── Subtle filled disc behind the ring for depth ──
    ctx.beginPath()
    ctx.arc(cx, cy, ringRadius - ringWidth, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.globalAlpha = 0.06
    ctx.fill()
    ctx.globalAlpha = 1.0

    // ── Primary text: bottom arc (just outside the ring) ──
    const textRadius = ringRadius + 18
    drawTextOnArc(
      ctx, displayText, cx, cy, textRadius,
      28, '#e2e8f0', 0.85,
      Math.PI / 2,  // bottom center
      false,         // normal orientation
    )

    // ── Subtitle: top arc (just outside the ring, reads left-to-right) ──
    if (displaySub) {
      const subRadius = ringRadius + 16
      drawTextOnArc(
        ctx, displaySub, cx, cy, subRadius,
        22, '#94a3b8', 0.6,
        -Math.PI / 2,  // top center
        true,           // flipped for top readability
      )
    }

    texture = new THREE.CanvasTexture(canvas)
    texture.needsUpdate = true
    ringLabelTextureCache.set(cacheKey, texture)
  }

  let material = ringLabelMaterialCache.get(cacheKey)
  if (!material) {
    material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: 1.0,
      depthWrite: false,
    })
    ringLabelMaterialCache.set(cacheKey, material)
  }

  const sprite = new THREE.Sprite(material)
  // Scale proportional to ring — energy gives a subtle breathing effect
  const spriteSize = 22 + energy * 4
  sprite.scale.set(spriteSize, spriteSize, 1)
  return sprite
}

// ── Glow halo (subtle, energy-based) ─────────────────────────────────────────

const glowTextureCache = new Map<string, THREE.CanvasTexture>()
const glowMaterialCache = new Map<string, THREE.SpriteMaterial>()

function createGlowSprite(color: string, energy: number): THREE.Sprite {
  let texture = glowTextureCache.get(color)
  if (!texture) {
    const canvas = document.createElement('canvas')
    canvas.width = 128
    canvas.height = 128
    const ctx = canvas.getContext('2d')!

    const gradient = ctx.createRadialGradient(64, 64, 0, 64, 64, 64)
    gradient.addColorStop(0, `${color}55`)
    gradient.addColorStop(0.3, `${color}33`)
    gradient.addColorStop(0.7, `${color}11`)
    gradient.addColorStop(1, `${color}00`)
    ctx.fillStyle = gradient
    ctx.fillRect(0, 0, 128, 128)

    texture = new THREE.CanvasTexture(canvas)
    glowTextureCache.set(color, texture)
  }

  const opacityBucket = Math.round(Math.min(energy, 1.0) * 4) / 4
  const matKey = `${color}:${opacityBucket}`
  let material = glowMaterialCache.get(matKey)
  if (!material) {
    material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      opacity: opacityBucket * 0.6,
      depthWrite: false,
    })
    glowMaterialCache.set(matKey, material)
  }

  const sprite = new THREE.Sprite(material)
  const size = 28 + energy * 14
  sprite.scale.set(size, size, 1)
  return sprite
}

// ── Central emoji sprite ─────────────────────────────────────────────────────

function createEmojiSprite(entityType: string, energy: number, status?: string): SpriteText {
  const emoji = getStatusEmoji(entityType, status)
  const sprite = new SpriteText(emoji) as SpriteTextInstance
  // Emoji is THE node — prominent size, scaled by energy
  sprite.textHeight = 8 + energy * 4  // 8 at rest → 12 at max energy
  sprite.backgroundColor = 'transparent'
  sprite.padding = [0, 0]
  sprite.position.set(0, 0, 0) // dead center
  return sprite
}

// ── Invisible hitbox sprite (enlarges clickable area) ─────────────────────────
// react-force-graph-3d raycasts against the node's Three.js objects.
// Sprites can be hard to click because their visual area is small.
// We add a larger invisible sprite to expand the hit target.

let hitboxTexture: THREE.CanvasTexture | null = null
let hitboxMaterial: THREE.SpriteMaterial | null = null

function createHitboxSprite(): THREE.Sprite {
  if (!hitboxTexture) {
    const canvas = document.createElement('canvas')
    canvas.width = 4
    canvas.height = 4
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = 'rgba(255, 255, 255, 0.01)' // nearly invisible but raycastable
    ctx.fillRect(0, 0, 4, 4)
    hitboxTexture = new THREE.CanvasTexture(canvas)
  }
  if (!hitboxMaterial) {
    hitboxMaterial = new THREE.SpriteMaterial({
      map: hitboxTexture,
      transparent: true,
      opacity: 0.01,
      depthWrite: false,
    })
  }
  const sprite = new THREE.Sprite(hitboxMaterial)
  sprite.scale.set(26, 26, 1) // larger than the visible ring (~22)
  return sprite
}

// ── Subtitle builders per entity type ────────────────────────────────────────

function getNodeSubtitle(node: Graph3DNode): string | undefined {
  const data = node.data
  const entityType = node.entityType

  // ── Milestone: show plan + task descendance ──
  if (entityType === 'milestone') {
    const parts: string[] = []
    const pc = data.plan_count as number | undefined
    const tc = data.task_count as number | undefined
    if (pc) parts.push(`${pc} plans`)
    if (tc) parts.push(`${tc} tasks`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Plan: show task descendance with completion ──
  if (entityType === 'plan') {
    const parts: string[] = []
    const tc = data.task_count as number | undefined
    const ctc = data.completed_task_count as number | undefined
    if (tc) parts.push(`${ctc ?? 0}/${tc} tasks`)
    const fc = data.file_count as number | undefined
    if (fc) parts.push(`${fc} files`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Task: show step progress + linked entities ──
  if (entityType === 'task') {
    const parts: string[] = []
    const sc = data.step_count as number | undefined
    const csc = data.completed_step_count as number | undefined
    if (sc) parts.push(`${csc ?? 0}/${sc} steps`)
    // Descendance counts — compact format
    const counts: string[] = []
    const nc = data.note_count as number | undefined
    const dc = data.decision_count as number | undefined
    const fc = data.affected_file_count as number | undefined
    const cc = data.commit_count as number | undefined
    if (fc) counts.push(`${fc}📄`)
    if (cc) counts.push(`${cc}💾`)
    if (nc) counts.push(`${nc}📝`)
    if (dc) counts.push(`${dc}⚖️`)
    if (counts.length > 0) parts.push(counts.join(' '))
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Step: show verification hint ──
  if (entityType === 'step') {
    const v = data.verification as string | undefined
    if (v) {
      const short = v.length > 30 ? v.slice(0, 29) + '…' : v
      return short
    }
    return undefined
  }

  // ── File: parent directory + symbol counts ──
  if (entityType === 'file') {
    const parts: string[] = []
    const path = data.path as string | undefined
    if (path) {
      const segs = path.split('/')
      if (segs.length > 2) {
        parts.push(segs.slice(-3, -1).join('/'))
      }
    }
    const fnc = data.function_count as number | undefined
    const sc = data.struct_count as number | undefined
    if (fnc) parts.push(`${fnc}⚡`)
    if (sc) parts.push(`${sc}🏗️`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Decision: chosen option as subtitle ──
  if (entityType === 'decision') {
    const co = data.chosen_option as string | undefined
    if (co) {
      const short = co.length > 28 ? co.slice(0, 27) + '…' : co
      return short
    }
    return undefined
  }

  // ── Note: importance + type ──
  if (entityType === 'note') {
    const parts: string[] = []
    const nt = data.note_type as string | undefined
    const imp = data.importance as string | undefined
    if (nt) parts.push(nt)
    if (imp) parts.push(imp)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Commit: short sha + file count ──
  if (entityType === 'commit') {
    const parts: string[] = []
    const sha = data.sha as string | undefined
    if (sha) parts.push(sha.slice(0, 7))
    const fc = data.file_count as number | undefined
    if (fc) parts.push(`${fc} files`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Chat session: model + msg count ──
  if (entityType === 'chat_session') {
    const parts: string[] = []
    if (data.model) parts.push(String(data.model))
    if (data.messageCount) parts.push(`${data.messageCount} msgs`)
    if (data.totalCostUsd && Number(data.totalCostUsd) > 0) {
      parts.push(`$${Number(data.totalCostUsd).toFixed(3)}`)
    }
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Feature graph: entity count ──
  if (entityType === 'feature_graph') {
    const count = data.entity_count
    if (count) return `${count} entities`
    return undefined
  }

  // ── Constraint: severity ──
  if (entityType === 'constraint') {
    const sev = data.severity as string | undefined
    return sev ?? undefined
  }

  // ── Skill: energy + cohesion ──
  if (entityType === 'skill') {
    const parts: string[] = []
    const e = data.energy as number | undefined
    const c = data.cohesion as number | undefined
    if (e !== undefined) parts.push(`⚡${(e * 100).toFixed(0)}%`)
    if (c !== undefined) parts.push(`🔗${(c * 100).toFixed(0)}%`)
    return parts.length > 0 ? parts.join(' · ') : undefined
  }

  // ── Protocol: state count ──
  if (entityType === 'protocol') {
    const sc = data.state_count as number | undefined
    if (sc) return `${sc} states`
    return undefined
  }

  return undefined
}

// ── Main factory ──────────────────────────────────────────────────────────────

/** Extract progress info from node data for entities with steps/children */
function getNodeProgress(node: Graph3DNode): NodeProgress | undefined {
  const data = node.data
  const entityType = node.entityType

  if (entityType === 'task') {
    const total = (data.step_count as number) ?? 0
    const completed = (data.completed_step_count as number) ?? 0
    if (total > 0) return { completed, total }
  }

  if (entityType === 'plan') {
    const total = (data.task_count as number) ?? 0
    const completed = (data.completed_task_count as number) ?? 0
    if (total > 0) return { completed, total }
  }

  if (entityType === 'milestone') {
    const total = (data.task_count as number) ?? 0
    const completed = (data.completed_task_count as number) ?? 0
    if (total > 0) return { completed, total }
  }

  return undefined
}

export function createNodeObject(node: Graph3DNode): THREE.Object3D {
  const group = new THREE.Group()

  const entityType = node.entityType
  const color = ENTITY_COLORS[entityType as keyof typeof ENTITY_COLORS] ?? '#6B7280'
  const energy = (node.data.energy as number) ?? 0
  const status = node.data.status as string | undefined
  const subtitle = getNodeSubtitle(node)
  const progress = getNodeProgress(node)

  // 0. Invisible hitbox — ensures the node is easy to click/hover
  const hitbox = createHitboxSprite()
  group.add(hitbox)

  // 1. Glow halo (behind everything) — only for energy > 0.4
  if (energy > 0.4) {
    const glow = createGlowSprite(color, energy)
    group.add(glow)
  }

  // 2. Ring + circular label + progress arc + working badge
  const ringLabel = createRingLabelSprite(node.label, color, energy, subtitle, progress, status)
  group.add(ringLabel)

  // 3. Central emoji — THE primary visual element (on top), status-aware
  const emojiSprite = createEmojiSprite(entityType, energy, status)
  group.add(emojiSprite)

  return group
}

// ── Cleanup (call on unmount) ──────────────────────────────────────────────────

export function disposeNodeCaches(): void {
  ringLabelTextureCache.forEach((tex) => tex.dispose())
  ringLabelTextureCache.clear()
  ringLabelMaterialCache.forEach((mat) => mat.dispose())
  ringLabelMaterialCache.clear()
  glowTextureCache.forEach((tex) => tex.dispose())
  glowTextureCache.clear()
  glowMaterialCache.forEach((mat) => mat.dispose())
  glowMaterialCache.clear()
  if (hitboxTexture) { hitboxTexture.dispose(); hitboxTexture = null }
  if (hitboxMaterial) { hitboxMaterial.dispose(); hitboxMaterial = null }
}
