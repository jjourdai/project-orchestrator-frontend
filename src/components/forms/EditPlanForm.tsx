import { useState, useEffect } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface EditPlanFormData {
  title: string
  description: string
  priority: number
}

interface Props {
  initialValues: { title: string; description?: string; priority?: number }
  onSubmit: (data: EditPlanFormData) => Promise<void>
  loading?: boolean
}

export function EditPlanForm({ initialValues, onSubmit, loading }: Props) {
  const [title, setTitle] = useState(initialValues.title)
  const [description, setDescription] = useState(initialValues.description ?? '')
  const [priority, setPriority] = useState(String(initialValues.priority ?? 5))
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setTitle(initialValues.title)
    setDescription(initialValues.description ?? '')
    setPriority(String(initialValues.priority ?? 5))
    setErrors({})
  }, [initialValues.title, initialValues.description, initialValues.priority])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!title.trim()) errs.title = 'Title is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Title"
          placeholder="Plan title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          error={errors.title}
          disabled={loading}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="Describe the plan..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={4}
        />
        <Input
          label="Priority"
          type="number"
          min={1}
          max={10}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
          disabled={loading}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        title: title.trim(),
        description: description.trim(),
        priority: parseInt(priority) || 5,
      })
    },
  }
}
