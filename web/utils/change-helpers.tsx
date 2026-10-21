/* eslint-disable react-refresh/only-export-components */
/**
 * Change Helpers - Common utility functions for pending file changes
 *
 * Shared between PendingSyncPanel and PendingFileList components
 */

import React from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import type { ChangeType } from '@/opfs/types/opfs-types'

/**
 * Change type information
 */
export interface ChangeTypeInfo {
  color: string
  bg: string
  label: string
}

/**
 * Get color and label for change type
 * Uses A/M/D labels consistently, matching FileTreePanel
 */
export function getChangeTypeInfo(type: ChangeType): ChangeTypeInfo {
  switch (type) {
    case 'add':
      return { color: 'text-success', bg: 'bg-success/10', label: 'A' }
    case 'modify':
      return { color: 'text-warning', bg: 'bg-warning/10', label: 'M' }
    case 'delete':
      return { color: 'text-danger', bg: 'bg-danger/10', label: 'D' }
  }
}

/**
 * Change type icon component (using lucide-react)
 */
export function ChangeTypeIcon({ type, className = 'w-3.5 h-3.5' }: { type: ChangeType; className?: string }): React.ReactNode {
  switch (type) {
    case 'add':
      return <Plus className={className} />
    case 'modify':
      return <Pencil className={className} />
    case 'delete':
      return <Trash2 className={className} />
  }
}

/**
 * Format file size
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
