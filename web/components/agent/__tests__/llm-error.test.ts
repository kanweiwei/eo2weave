import { describe, expect, it } from 'vitest'
import { presentLlmError } from '../llm-error'

describe('presentLlmError', () => {
  describe('HTTP status errors (custom Chat Completions handler format)', () => {
    it('shows localized status line and extracts provider message from JSON body', () => {
      const raw =
        'HTTP 429: {"error":{"message":"Rate limit reached for gpt-5.5","type":"requests","param":null,"code":"rate_limit_exceeded"}}'
      const result = presentLlmError(raw, 'zh-CN')

      expect(result.title).toBe('模型服务商返回错误（HTTP 429）')
      expect(result.details).toBe('Rate limit reached for gpt-5.5')
    })

    it('falls back to known error code when body has no message field', () => {
      const raw = 'HTTP 429: {"error":{"code":"rate_limit_exceeded"}}'
      const result = presentLlmError(raw, 'en-US')

      expect(result.title).toBe('The model provider returned an error (HTTP 429).')
      expect(result.details).toBe('rate_limit_exceeded')
    })

    it('uses parsed.code when error object is absent', () => {
      const raw = 'HTTP 401: {"code":"invalid_api_key","message":"Incorrect API key"}'
      const result = presentLlmError(raw, 'en-US')

      expect(result.details).toBe('Incorrect API key')
    })

    it('falls back to a truncated raw body for non-JSON bodies', () => {
      const longBody = 'x'.repeat(400)
      const raw = `HTTP 502: ${longBody}`
      const result = presentLlmError(raw, 'zh-CN')

      expect(result.title).toBe('模型服务商返回错误（HTTP 502）')
      expect(result.details).toBe(`${'x'.repeat(300)}…`)
    })

    it('returns no details when body is a placeholder', () => {
      const result = presentLlmError('HTTP 500: No response body', 'en-US')

      expect(result.title).toBe('The model provider returned an error (HTTP 500).')
      expect(result.details).toBeNull()
    })

    it('handles multi-line JSON bodies (pretty-printed provider errors)', () => {
      const raw = 'HTTP 402: {\n  "error": {\n    "message": "Insufficient balance"\n  }\n}'
      const result = presentLlmError(raw, 'en-US')

      expect(result.details).toBe('Insufficient balance')
    })
  })

  describe('network errors', () => {
    it.each([
      'Failed to fetch',
      'fetch failed',
      'TypeError: NetworkError when attempting to fetch resource.',
      'Load failed',
    ])('classifies "%s" as a network error', (raw) => {
      const result = presentLlmError(raw, 'zh-CN')

      expect(result.title).toBe('网络连接失败，无法访问模型服务商，请检查网络后重试')
      expect(result.details).toBe(raw)
    })
  })

  describe('pi-ai built-in handler errors', () => {
    it('keeps "does not exist or does not support" messages as the title', () => {
      const raw = 'gpt-6-mini does not exist or does not support image input'
      const result = presentLlmError(raw, 'en-US')

      expect(result.title).toBe(raw)
      expect(result.details).toBeNull()
    })
  })

  describe('unrecognized errors', () => {
    it('wraps unknown failures with the generic line, keeping raw details', () => {
      const result = presentLlmError('Some provider SDK exploded', 'en-US')

      expect(result.title).toBe('The model request failed. Please try again later.')
      expect(result.details).toBe('Some provider SDK exploded')
    })

    it('returns title only for empty input', () => {
      const result = presentLlmError('   ', 'zh-CN')

      expect(result.title).toBe('模型请求失败，请稍后重试')
      expect(result.details).toBeNull()
    })
  })
})
