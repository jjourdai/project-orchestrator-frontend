import { useState, useEffect } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface EditProjectFormData {
  name: string
  description: string
}

interface Props {
  initialValues: { name: string; description?: string }
  onSubmit: (data: EditProjectFormData) => Promise<void>
  loading?: boolean
}

export function EditProjectForm({ initialValues, onSubmit, loading }: Props) {
  const [name, setName] = useState(initialValues.name)
  const [description, setDescription] = useState(initialValues.description ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setName(initialValues.name)
    setDescription(initialValues.description ?? '')
    setErrors({})
  }, [initialValues.name, initialValues.description])

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    setErrors(errs)
    return Object.keys(errs).length === 0
  }

  return {
    fields: (
      <>
        <Input
          label="Name"
          placeholder="Project name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={errors.name}
          disabled={loading}
          autoFocus
        />
        <Textarea
          label="Description"
          placeholder="Optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={3}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        name: name.trim(),
        description: description.trim(),
      })
    },
  }
}
