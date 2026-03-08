import { useState, useEffect } from 'react'
import { Input, Textarea } from '@/components/ui'

export interface EditProjectFormData {
  name: string
  slug: string
  description: string
  root_path: string
}

interface Props {
  initialValues: { name: string; slug?: string; description?: string; root_path?: string }
  onSubmit: (data: EditProjectFormData) => Promise<void>
  loading?: boolean
}

export function EditProjectForm({ initialValues, onSubmit, loading }: Props) {
  const [name, setName] = useState(initialValues.name)
  const [slug, setSlug] = useState(initialValues.slug ?? '')
  const [slugTouched, setSlugTouched] = useState(false)
  const [description, setDescription] = useState(initialValues.description ?? '')
  const [rootPath, setRootPath] = useState(initialValues.root_path ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    setName(initialValues.name)
    setSlug(initialValues.slug ?? '')
    setSlugTouched(false)
    setDescription(initialValues.description ?? '')
    setRootPath(initialValues.root_path ?? '')
    setErrors({})
  }, [initialValues.name, initialValues.slug, initialValues.description, initialValues.root_path])

  const handleNameChange = (value: string) => {
    setName(value)
    if (!slugTouched) {
      setSlug(value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''))
    }
  }

  const validate = () => {
    const errs: Record<string, string> = {}
    if (!name.trim()) errs.name = 'Name is required'
    if (!slug.trim()) errs.slug = 'Slug is required'
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
          onChange={(e) => handleNameChange(e.target.value)}
          error={errors.name}
          disabled={loading}
          autoFocus
        />
        <Input
          label="Slug"
          placeholder="project-slug"
          value={slug}
          onChange={(e) => {
            setSlugTouched(true)
            setSlug(e.target.value)
          }}
          error={errors.slug}
          disabled={loading}
        />
        <Textarea
          label="Description"
          placeholder="Optional description..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={loading}
          rows={3}
        />
        <Input
          label="Root Path"
          placeholder="/path/to/project"
          value={rootPath}
          onChange={(e) => setRootPath(e.target.value)}
          disabled={loading}
        />
      </>
    ),
    submit: async () => {
      if (!validate()) return
      await onSubmit({
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim(),
        root_path: rootPath.trim(),
      })
    },
  }
}
