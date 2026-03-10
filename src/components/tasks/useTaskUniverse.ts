// Re-export from the new generic universe module
export { useTaskUniverse } from '@/components/universe/useEntityUniverse'
export type { UniverseNode, UniverseLink } from '@/components/universe/useEntityUniverse'

/** @deprecated Use TaskUniverseData from useEntityUniverse instead */
export type { UniverseNode as TaskUniverseData } from '@/components/universe/useEntityUniverse'
