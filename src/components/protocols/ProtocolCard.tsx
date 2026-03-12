/**
 * ProtocolCard — Reusable card for the protocol list view.
 *
 * Displays protocol name, description (truncated), status dot, state/transition
 * counts, category badge, and tags. Follows the same visual language as SkillCard.
 */

import { GitBranch, Circle, ArrowRightLeft, Tag } from 'lucide-react'
import { Card, CardContent, Badge } from '@/components/ui'
import type { Protocol, ProtocolStatus } from '@/types/protocol'

// ---------------------------------------------------------------------------
// Status dot color mapping
// ---------------------------------------------------------------------------

const statusDotColor: Record<ProtocolStatus, string> = {
  draft: 'bg-gray-400',
  active: 'bg-green-400',
  archived: 'bg-gray-500',
}

const statusLabel: Record<ProtocolStatus, string> = {
  draft: 'Draft',
  active: 'Active',
  archived: 'Archived',
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ProtocolCardProps {
  protocol: Protocol
  onClick?: () => void
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ProtocolCard({ protocol, onClick }: ProtocolCardProps) {
  const stateCount = protocol.states?.length ?? 0
  const transitionCount = protocol.transitions?.length ?? 0
  const hasMacroStates = protocol.states?.some((s) => s.sub_protocol_id) ?? false

  return (
    <Card className="group cursor-pointer transition-colors hover:border-indigo-500" onClick={onClick}>
      <CardContent>
        {/* Header: name + status */}
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`w-2 h-2 rounded-full shrink-0 ${statusDotColor[protocol.status ?? 'active']}`} />
              <h3 className="text-sm font-semibold text-gray-100 truncate">{protocol.name}</h3>
            </div>
            {protocol.description && (
              <p className="text-xs text-gray-500 mt-0.5 line-clamp-2 ml-4">{protocol.description}</p>
            )}
          </div>
          <span className="text-[10px] font-medium uppercase tracking-wider text-gray-500 shrink-0 mt-0.5">
            {statusLabel[protocol.status ?? 'active']}
          </span>
        </div>

        {/* Counters */}
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
          <span className="flex items-center gap-1">
            <Circle className="w-3 h-3" />
            {stateCount} state{stateCount !== 1 ? 's' : ''}
          </span>
          <span className="flex items-center gap-1">
            <ArrowRightLeft className="w-3 h-3" />
            {transitionCount} transition{transitionCount !== 1 ? 's' : ''}
          </span>
          {hasMacroStates && (
            <span className="flex items-center gap-1 text-violet-400">
              <GitBranch className="w-3 h-3" />
              Macro
            </span>
          )}
        </div>

        {/* Tags */}
        {protocol.tags && protocol.tags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {protocol.tags.slice(0, 5).map((tag) => (
              <Badge key={tag} variant="default">
                <Tag className="w-2.5 h-2.5 mr-0.5" />
                {tag}
              </Badge>
            ))}
            {protocol.tags.length > 5 && (
              <span className="text-xs text-gray-500">+{protocol.tags.length - 5}</span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
