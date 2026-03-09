// ============================================================================
// TaskUniverse3D — Legacy wrapper, delegates to Universe3DPanel
// ============================================================================

import { Universe3DPanel } from '@/components/universe'
import { useTaskUniverse } from '@/components/universe'

interface TaskUniverse3DProps {
  taskId: string
  onClose: () => void
}

export function TaskUniverse3D({ taskId, onClose }: TaskUniverse3DProps) {
  const { nodes, links, isLoading, error } = useTaskUniverse(taskId)

  return (
    <Universe3DPanel
      nodes={nodes}
      links={links}
      isLoading={isLoading}
      error={error}
      onClose={onClose}
      centerType="task"
      legend={[
        { type: 'task', label: 'Task (center)' },
        { type: 'step', label: 'Steps' },
        { type: 'decision', label: 'Decisions' },
        { type: 'file', label: 'Files' },
        { type: 'commit', label: 'Commits' },
      ]}
    />
  )
}

export default TaskUniverse3D
