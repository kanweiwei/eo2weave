import { describe, expect, it } from 'vitest'
import {
  getModelRuntimeStatus,
  isValidModelSelection,
  resolveDefaultModelSelection,
  type AvailableProviderLike,
} from '../model-selection'

const provider = (
  providerType: string,
  ids: string[],
  options: Partial<AvailableProviderLike> = {},
): AvailableProviderLike => ({
  providerType,
  models: ids.map((id) => ({ id, name: id })),
  authoritativeIds: ids,
  ...options,
})

describe('model selection reconciliation', () => {
  it('selects the first model when the selection is empty', () => {
    expect(resolveDefaultModelSelection([provider('openai', ['gpt-4o'])], { providerType: '', modelName: '' })).toMatchObject({
      action: 'switch', providerType: 'openai', modelName: 'gpt-4o', reason: 'first-available',
    })
  })

  it('keeps a valid selection', () => {
    expect(resolveDefaultModelSelection([provider('openai', ['gpt-4o'])], { providerType: 'openai', modelName: 'gpt-4o' })).toMatchObject({ action: 'keep', reason: 'current-valid' })
  })

  it('falls back within the current provider before switching providers', () => {
    expect(resolveDefaultModelSelection([
      provider('openai', ['gpt-4o', 'gpt-4o-mini']),
      provider('anthropic', ['claude-sonnet']),
    ], { providerType: 'openai', modelName: 'removed' })).toMatchObject({
      action: 'switch', providerType: 'openai', modelName: 'gpt-4o', reason: 'current-provider-fallback',
    })
  })

  it('switches providers when the current provider has no models', () => {
    expect(resolveDefaultModelSelection([
      provider('openai', []),
      provider('anthropic', ['claude-sonnet']),
    ], { providerType: 'openai', modelName: 'removed' })).toMatchObject({
      action: 'switch', providerType: 'anthropic', modelName: 'claude-sonnet', reason: 'first-available',
    })
  })

  it('does not treat stale pinned models as valid', () => {
    const stale = provider('openai', ['old'], { models: [{ id: 'old', stale: true }], authoritativeIds: ['new'] })
    expect(isValidModelSelection([stale], 'openai', 'old')).toBe(false)
    expect(resolveDefaultModelSelection([stale], { providerType: 'openai', modelName: 'old' }).action).toBe('none')
  })

  it('defers while a provider catalog is loading', () => {
    expect(resolveDefaultModelSelection([
      provider('openai', [], { catalogStatus: 'loading' }),
    ], { providerType: '', modelName: '' })).toMatchObject({ action: 'defer', reason: 'catalog-loading' })
  })

  it('does not misreport a failed catalog as empty', () => {
    expect(resolveDefaultModelSelection([
      provider('openai', [], { catalogStatus: 'failed' }),
    ], { providerType: 'openai', modelName: 'gpt-4o' })).toMatchObject({ action: 'defer', reason: 'catalog-failed' })
  })

  it('requires exact provider and model ids', () => {
    expect(isValidModelSelection([provider('openai', ['gpt-4o'])], 'open', 'gpt-4o')).toBe(false)
    expect(isValidModelSelection([provider('openai', ['gpt-4o'])], 'openai', 'gpt-4')).toBe(false)
  })

  it('reports runtime sendability separately from selection', () => {
    expect(getModelRuntimeStatus([provider('openai', ['gpt-4o'])], { providerType: 'openai', modelName: 'gpt-4o' }, 'expired')).toMatchObject({
      catalog: 'ready', selection: 'valid', credential: 'expired', canSend: false,
    })
  })
})
