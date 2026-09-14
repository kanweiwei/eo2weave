import { describe, expect, it } from 'vitest'
import {
  countLinesBefore,
  findEditMatch,
  reindentNewText,
  type MatchOutcome,
} from '../fuzzy-match'

function expectOk(outcome: MatchOutcome) {
  expect(outcome.kind).toBe('ok')
  return (outcome as Extract<MatchOutcome, { kind: 'ok' }>).match
}

function expectAmbiguous(outcome: MatchOutcome) {
  expect(outcome.kind).toBe('ambiguous')
  return (outcome as Extract<MatchOutcome, { kind: 'ambiguous' }>)
}

function expectNotFound(outcome: MatchOutcome) {
  expect(outcome.kind).toBe('not_found')
  return (outcome as Extract<MatchOutcome, { kind: 'not_found' }>)
}

describe('findEditMatch tier 1: exact', () => {
  it('matches uniquely and reports offsets', () => {
    const file = 'const a = 1\nconst b = 2\n'
    const m = expectOk(findEditMatch(file, 'const b = 2'))
    expect(m.tier).toBe('exact')
    expect(m.start).toBe(file.indexOf('const b = 2'))
    expect(m.end).toBe(m.start + 'const b = 2'.length)
    expect(m.actualOldText).toBe('const b = 2')
    expect(m.indentDelta).toBe('')
  })

  it('reports ambiguous with line numbers instead of guessing', () => {
    const file = 'x = old\ny = old\n'
    const amb = expectAmbiguous(findEditMatch(file, 'old'))
    expect(amb.tier).toBe('exact')
    expect(amb.occurrences).toHaveLength(2)
    expect(amb.occurrences[0]!.line).toBe(1)
    expect(amb.occurrences[1]!.line).toBe(2)
  })
})

describe('findEditMatch tier 2: quotes', () => {
  it('matches curly quotes and returns the file-original text', () => {
    const file = 'const s = \u201Chello\u201D\n'
    const m = expectOk(findEditMatch(file, 'const s = "hello"'))
    expect(m.tier).toBe('quotes')
    expect(m.actualOldText).toBe('const s = \u201Chello\u201D')
  })

  it('detects ambiguity at the quotes tier', () => {
    const file = 'a \u201Cdup\u201D b\na \u201Cdup\u201D c\n'
    const amb = expectAmbiguous(findEditMatch(file, 'a "dup"'))
    expect(amb.tier).toBe('quotes')
    expect(amb.occurrences.length).toBeGreaterThan(1)
  })
})

describe('findEditMatch tier 3: whitespace', () => {
  it('ignores trailing whitespace differences', () => {
    const file = 'abc   \nnext\n'
    const m = expectOk(findEditMatch(file, 'abc\nnext'))
    expect(m.tier).toBe('whitespace')
    expect(m.actualOldText).toBe('abc   \nnext')
  })

  it('normalizes CRLF line endings', () => {
    const file = 'foo\r\nbar\r\nbaz\r\n'
    const m = expectOk(findEditMatch(file, 'bar\nbaz'))
    expect(m.tier).toBe('whitespace')
    expect(m.actualOldText).toBe('bar\r\nbaz')
  })

  it('keeps the trailing newline boundary when old_text ends with \\n', () => {
    const file = 'head\nfoo  \nbar\t\ntail\n'
    const m = expectOk(findEditMatch(file, 'foo\nbar\n'))
    expect(m.tier).toBe('whitespace')
    expect(m.actualOldText).toBe('foo  \nbar\t\n')
    expect(m.end).toBe(file.indexOf('tail'))
  })

  it('matches a flexible final partial line', () => {
    const file = 'const total = compute(x)  \nreturn total + bonus\n'
    const m = expectOk(findEditMatch(file, 'const total = compute(x)\nreturn total'))
    expect(m.tier).toBe('whitespace')
    // The whole file line is consumed (replacement covers '+ bonus' too)
    expect(m.actualOldText).toBe('const total = compute(x)  \nreturn total + bonus')
  })
})

describe('findEditMatch tier 4: indent', () => {
  const nested = [
    'function f() {',
    '    if (cond) {',
    '        doWork()',
    '    }',
    '}',
  ].join('\n')

  it('matches at a different indentation and captures the delta', () => {
    const m = expectOk(findEditMatch(nested, 'if (cond) {\n    doWork()\n}'))
    expect(m.tier).toBe('indent')
    expect(m.indentDelta).toBe('    ')
    expect(m.lineAligned).toBe(true)
    expect(m.actualOldText).toContain('doWork()')
  })

  it('recovers a non-constant-indent block at the fuzzy tier', () => {
    // Mixed indent drift defeats the structural tiers, but trimmed content
    // is identical — the fuzzy tier takes it; the delta vote cannot find a
    // stable offset, so no re-indentation is applied.
    const file = 'if (a) {\n    one()\n        two()\n}\n'
    const m = expectOk(findEditMatch(file, 'if (a) {\n  one()\n    two()\n}'))
    expect(m.tier).toBe('fuzzy')
    expect(m.actualOldText).toBe('if (a) {\n    one()\n        two()\n}')
  })

  it('handles a fully de-indented search block', () => {
    const file = 'function alpha() {\n  const a = 1\n  const b = 2\n  return a + b\n}\n'
    const m = expectOk(findEditMatch(file, 'const a = 1\nconst b = 2\nreturn a + b'))
    expect(m.tier).toBe('indent')
    expect(m.indentDelta).toBe('  ')
  })
})

describe('findEditMatch tier 5: fuzzy', () => {
  it('accepts a mostly-identical multi-line block', () => {
    const file = 'function f() {\n  const a = computeValue(input)\n  return a\n}\n'
    const m = expectOk(findEditMatch(file, 'const a = computeValue(inputx)\n  return a'))
    expect(m.tier).toBe('fuzzy')
    expect(m.similarity).toBeGreaterThanOrEqual(0.9)
  })

  it('fuzzy-matches a single line and keeps file indentation', () => {
    const file = 'const result = computeFinalValue(inputValue)\n'
    const m = expectOk(findEditMatch(file, 'const result = computeFinalValue(inputValue?)'))
    expect(m.tier).toBe('fuzzy')
    expect(m.indentDelta).toBe('')
    expect(m.actualOldText).toBe('const result = computeFinalValue(inputValue)')
  })

  it('re-indents new_text when the search lost its indentation', () => {
    // 3-line block, wrong indent on every line -> below structural tiers,
    // line ratio 1.0, so fuzzy accepts and derives the constant delta.
    const file = 'if (ready) {\n  begin()\n  work()\n  end()\n}\n'
    const m = expectOk(findEditMatch(file, 'if (ready) {\nbegin()\nwork()\nend()\n}'))
    expect(m.tier).toBe('fuzzy')
    expect(m.indentDelta).toBe('  ')
  })

  it('does NOT missile onto a same-shape sibling block (line-structure gate)', () => {
    const file = [
      'function alpha(x) {',
      '  const total = sum(values)',
      '  return alpha(total)',
      '}',
      '',
      'function gamma(x) {',
      '  const total = sum(gammaValues)',
      '  return gamma(total)',
      '}',
    ].join('\n')
    // A third variant: same shape, different identifiers — must not be
    // silently applied to alpha or gamma.
    const search = [
      'function beta(x) {',
      '  const total = sum(betaValues)',
      '  return beta(total)',
      '}',
    ].join('\n')
    const nf = expectNotFound(findEditMatch(file, search))
    // Candidates point at the sibling blocks for self-correction
    expect(nf.candidates.length).toBeGreaterThan(0)
    expect(nf.bestSimilarity).toBeGreaterThanOrEqual(0.5)
    expect(nf.bestSimilarity).toBeLessThan(0.9)
  })
})

describe('findEditMatch tier 6: anchored', () => {
  it('recovers when an interior line is heavily rewritten', () => {
    const file = [
      'export function handler(req) {',
      '  const session = await auth(req)',
      '  const data = load(session)',
      '  return render(data)',
      '}',
    ].join('\n')
    // Interior line replaced with much longer content: char ratio drops
    // below 0.9, line ratio (4/5 shared) stays >= 0.8, edges intact.
    const search = [
      'export function handler(req) {',
      '  const session = await auth(req)',
      '  const data = await loadFromRepositoryWithCache(session, { ttl: 300 })',
      '  return render(data)',
      '}',
    ].join('\n')
    const m = expectOk(findEditMatch(file, search))
    expect(m.tier).toBe('anchored')
    expect(m.start).toBe(0)
  })
})

describe('findEditMatch: not-found reporting', () => {
  it('returns no candidates for a totally unrelated search', () => {
    const nf = expectNotFound(findEditMatch('foo\nbar\n', 'qqq\nwww'))
    expect(nf.candidates).toHaveLength(0)
    expect(nf.bestSimilarity).toBe(0)
  })

  it('ranks candidates by similarity with line numbers', () => {
    const file = 'const alpha = 1\nconst beta = 2\nconst gamma = 3\n'
    const nf = expectNotFound(findEditMatch(file, 'const alpha = 999'))
    expect(nf.candidates.length).toBeGreaterThan(0)
    expect(nf.candidates[0]!.line).toBe(1)
    expect(nf.candidates[0]!.similarity).toBeGreaterThan(0.5)
    for (let i = 1; i < nf.candidates.length; i++) {
      expect(nf.candidates[i]!.similarity).toBeLessThanOrEqual(
        nf.candidates[i - 1]!.similarity
      )
    }
  })
})

describe('countLinesBefore', () => {
  it('is 1-based and counts newlines before the offset', () => {
    const file = 'a\nb\nc\n'
    expect(countLinesBefore(file, 0)).toBe(1)
    expect(countLinesBefore(file, 2)).toBe(2)
    expect(countLinesBefore(file, 4)).toBe(3)
  })
})

describe('reindentNewText', () => {
  it('line-aligned match: applies the delta to every line including the first', () => {
    expect(reindentNewText('a\nb\n\nc', '  ', false)).toBe('  a\n  b\n\n  c')
  })

  it('not line-aligned match: the first line inherits the file indentation', () => {
    expect(reindentNewText('a\nb\n\nc', '  ', true)).toBe('a\n  b\n\n  c')
  })

  it('leaves text unchanged when delta is empty', () => {
    expect(reindentNewText('a\nb', '', false)).toBe('a\nb')
    expect(reindentNewText('a\nb', '', true)).toBe('a\nb')
  })
})
