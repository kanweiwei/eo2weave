import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { getFileIconName, FileIcon } from '../file-icons'
import collection from '../file-icons.generated.json'

const bundled = new Set(Object.keys(collection.icons))

describe('getFileIconName', () => {
  it('maps Markdown files to the Markdown icon', () => {
    expect(getFileIconName('README.md')).toBe('vscode-icons:file-type-markdown')
    expect(getFileIconName('notes.markdown')).toBe('vscode-icons:file-type-markdown')
  })

  it('maps common code extensions', () => {
    expect(getFileIconName('index.ts')).toBe('vscode-icons:file-type-typescript')
    expect(getFileIconName('App.tsx')).toBe('vscode-icons:file-type-reactts')
    expect(getFileIconName('main.py')).toBe('vscode-icons:file-type-python')
    expect(getFileIconName('main.rs')).toBe('vscode-icons:file-type-rust')
  })

  it('prefers well-known file names over their extension', () => {
    expect(getFileIconName('package.json')).toBe('vscode-icons:file-type-npm')
    expect(getFileIconName('tsconfig.json')).toBe('vscode-icons:file-type-tsconfig')
    expect(getFileIconName('Dockerfile')).toBe('vscode-icons:file-type-docker')
    expect(getFileIconName('Makefile')).toBe('vscode-icons:file-type-gnu')
    expect(getFileIconName('.gitignore')).toBe('vscode-icons:file-type-git')
    expect(getFileIconName('.env')).toBe('vscode-icons:file-type-dotenv')
  })

  it('falls back to the generic file icon for unknown types', () => {
    expect(getFileIconName('mystery.qqq')).toBe('vscode-icons:default-file')
    expect(getFileIconName('LICENSE')).toBe('vscode-icons:file-type-license')
    expect(getFileIconName('noextension')).toBe('vscode-icons:default-file')
  })

  it('only returns icons that are bundled locally', () => {
    const samples = [
      'README.md',
      'index.ts',
      'App.tsx',
      'style.css',
      'data.json',
      'config.yaml',
      'photo.png',
      'archive.zip',
      'script.sh',
      'Dockerfile',
      'package.json',
      '.gitignore',
      'mystery.qqq',
    ]

    for (const sample of samples) {
      const icon = getFileIconName(sample)
      expect(bundled.has(icon.replace('vscode-icons:', '')), `${sample} -> ${icon}`).toBe(true)
    }
  })

  it('renders an icon element from the bundled collection', () => {
    const { container } = render(<FileIcon filename="README.md" />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
    expect(svg?.innerHTML.length).toBeGreaterThan(0)
  })
})
