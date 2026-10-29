import { describe, expect, it, vi } from 'vitest'
import { validateManifest, validatePackage, validatePackageSnapshot, parseWorkflow } from '@creatorweave/shared/webmcp-adapter'
import { matchesToolUrl, hasNestedQuantifier } from '@creatorweave/shared/webmcp-url'
import { readPackage, readPackageCatalog } from '../adapters'
import { manifest, source, pkg } from './fixtures'

describe('package validation', () => {
  it('reads a multi-tool package and normalizes relative source paths', async () => {
    const metadata = { ...manifest, tools: [manifest.tools[0], { ...manifest.tools[0], name: 'other', path: './nested/other.js' }] }
    const readFile = vi.fn(async (path: string) => path.endsWith('.json') ? JSON.stringify(metadata) : source)
    const result = await readPackage({ readFile }, '/external/webmcp/com.example.tools/')
    expect(result.manifest.tools).toHaveLength(2)
    expect(readFile).toHaveBeenCalledWith('/external/webmcp/com.example.tools/nested/other.js')
    expect(result.sources['nested/other.js']).toBe(source)
  })
  it.each(['../escape.js', '/absolute.js', './nested/../../escape.js', 'nested\\file.js', 'x.ts'])('rejects unsafe source paths %s', path => {
    expect(() => validateManifest({ ...manifest, tools: [{ ...manifest.tools[0], path }] }, manifest.id)).toThrow()
  })
  it('requires all manifest fields, matching id and unique tool names', () => {
    expect(() => validateManifest({ ...manifest, version: undefined }, manifest.id)).toThrow()
    expect(() => validateManifest(manifest, 'com.other.tools')).toThrow('must match directory')
    expect(() => validateManifest({ ...manifest, tools: [manifest.tools[0], manifest.tools[0]] }, manifest.id)).toThrow('Duplicate tool')
    expect(() => validatePackageSnapshot([pkg, pkg])).toThrow('Duplicate package')
  })
  it('rejects an entire package when a tool source is missing', async () => {
    const result = await readPackageCatalog({
      directories: async () => [manifest.id],
      readFile: async path => {
        if (path.endsWith('.json')) return JSON.stringify(manifest)
        throw new Error('Missing file')
      },
    })
    expect(result.packages).toEqual([])
    expect(result.errors).toHaveLength(1)
  })
  it('validates contracts in CSP environments without dynamic code generation', async () => {
    const FunctionConstructor = globalThis.Function
    globalThis.Function = (() => { throw new Error('unsafe-eval forbidden') }) as unknown as typeof FunctionConstructor
    try {
      expect(validatePackage(manifest, pkg.sources, manifest.id).manifest.id).toBe(manifest.id)
    } finally { globalThis.Function = FunctionConstructor }
  })
  it('parses schemas without executing adapter code', () => {
    const parsed = parseWorkflow(source.replace("return 'title'", 'throw new Error("executed")'))
    expect(parsed.contract.inputSchema).toEqual({ type: 'object' })
    expect(parsed.expression).toMatch(/^\{/)
  })
  it.each([
    `export default []`, source + '; alert("executed")',
    source.replace("inputSchema: { type: 'object' },", ''),
    source.replace("outputSchema: { type: 'string' }", "outputSchema: { type: 'not-a-type' }"),
    source.replace("inputSchema: { type: 'object' }", "inputSchema: (() => ({type:'object'}))()"),
    source.replace("return 'title'", "return import('x')"),
    source.replace('inspect()', 'get inspect()'),
  ])('rejects invalid workflow contracts: %s', code => {
    expect(() => validatePackage(manifest, { 'read-title.js': code }, manifest.id)).toThrow()
  })
  it('extracts nested tree structure and wait timing without executing callbacks', () => {
    const code = source.replace("{ type: 'condition', inspect() { return true } }", `{
      type: 'selector', children: [
        {type:'condition', inspect() { throw new Error('not executed') }},
        {type:'sequence', children: [
          {type:'action', run() { return 'success' }},
          {type:'wait', description:'Wait for data', intervalMs:100, timeoutMs:2000, inspect() { return true }}
        ]}
      ]
    }`)
    expect(parseWorkflow(code).tree).toEqual({type:'selector', children:[
      {type:'condition',id:'tree.children[0]'},
      {type:'sequence',children:[
        {type:'action',id:'tree.children[1].children[0]'},
        {type:'wait',id:'tree.children[1].children[1]',description:'Wait for data',intervalMs:100,timeoutMs:2000}
      ]}
    ]})
  })
  it.each([
    "{type:'parallel',children:[]}",
    "{type:'sequence'}",
    "{type:'selector',children:[null]}",
    "{type:'action',run:42}",
    "{type:'condition',inspect(){return true},run(){return 'success'}}",
    "{type:'wait',timeoutMs:-1,inspect(){return true}}",
    "{type:'wait',intervalMs:Infinity,inspect(){return true}}",
    "{type:'wait',get inspect(){return () => true}}",
    "{type:'action',async *run(){yield 'success'}}",
  ])('rejects malformed nodes before publishing: %s', node => {
    expect(() => parseWorkflow(source.replace("{ type: 'condition', inspect() { return true } }", node))).toThrow()
  })
  it('supports local schema refs and rejects unresolved external refs', () => {
    expect(() => parseWorkflow(source.replace("outputSchema: { type: 'string' }", "outputSchema: { $ref: '#/definitions/value', definitions: { value: {type:'string'} } }"))).not.toThrow()
    expect(() => parseWorkflow(source.replace("outputSchema: { type: 'string' }", "outputSchema: { $ref: 'https://remote.test/schema' }"))).toThrow()
  })

})

describe('URL matching', () => {
  it.each(['https://example.com/articles', 'https://example.com/articles/1?sort=asc#top'])('matches full URLs %s', href => {
    expect(matchesToolUrl(manifest.tools[0].urlRegex, href)).toBe(true)
  })
  it.each(['https://example.com/other', 'https://example.com.evil.test/articles', 'http://example.com/articles', 'https://other.test/articles'])('rejects other URLs %s', href => {
    expect(matchesToolUrl(manifest.tools[0].urlRegex, href)).toBe(false)
  })
  it('enforces whole-string matching even when alternation bypasses the anchors', () => {
    expect(matchesToolUrl('^https://example\\.com|/articles$', 'https://example.com/other')).toBe(false)
  })
  it.each(['example.com', '^[$', '^https://example.com'])('rejects invalid patterns %s', urlRegex => {
    expect(() => validateManifest({ ...manifest, tools: [{ ...manifest.tools[0], urlRegex }] }, manifest.id)).toThrow()
  })
  /**
   * A registry package could ship a catastrophically backtracking pattern
   * and stall the extension's service worker while probing the tab URL.
   * The pattern is rejected at VALIDATION time (manifest validation), so
   * such a package never reaches the matching stage.
   */
  it.each(['^(https://example\\.com/)+(a+)+$', '^(https://example\\.com/)*(.*)*$', '^(x+x+)+y$'])(
    'rejects the catastrophic-backtracking pattern %s',
    urlRegex => {
      expect(() => validateManifest({ ...manifest, tools: [{ ...manifest.tools[0], urlRegex }] }, manifest.id))
        .toThrow(/nested quantifiers/i)
    },
  )
  /**
   * Structural-validator coverage: each of these shapes splits input
   * ambiguity across two quantifiers (findings: "Hostile URL patterns stall
   * matching" — repeated ambiguous alternations, bounded repeats over
   * quantified bodies, nested groups with quantifiers spread across
   * levels). The old partial regex missed several of them.
   */
  it.each([
    ['nested plus', '(a+)+'],
    ['nested star', '(a*)*'],
    ['repeated ambiguous alternation', '(?:a|a)+'],
    ['quantifier across group levels', '((a)*)+'],
    ['overlapping alternation branches', '(a|aa)*'],
    ['stacked quantified groups', '(x+x+)+y'],
    ['bounded repeat over quantified body', '(a{1,2}){1,20}'],
    ['non-capturing double nested', '((a+)*)+'],
    ['lazy quantifier in group', '(a??)*'],
  ] as Array<[string, string]>)('rejects the ReDoS shape %s (%s)', (_label, pattern) => {
    expect(hasNestedQuantifier(`^${pattern}$`)).toBe(true)
    expect(() => validateManifest({ ...manifest, tools: [{ ...manifest.tools[0], urlRegex: `^${pattern}$` }] }, manifest.id))
      .toThrow(/nested quantifiers/i)
  })
  it.each([
    '^(https://example\\.com/articles)+(?:/[^?#]*)?$',
    '^(https://jmail\\.world(?:/|/search(?:/[^?#]*)?|/thread(?:/[^?#]*)?))(?:\\?[^#]*)?(?:#.*)?$',
    '^(https://example\\.com)/(?:\\?[^#]*)?(?:#.*)?$|^^(https://other\\.test)/x$',
  ])('keeps accepting safe quantified-group patterns %s', urlRegex => {
    expect(hasNestedQuantifier(urlRegex)).toBe(false)
  })
  it('keeps matching a normal pattern that merely uses a quantified group', () => {
    const urlRegex = '^https://example\\.com/articles(?:/[^?#]*)?$'
    expect(() => validateManifest({ ...manifest, tools: [{ ...manifest.tools[0], urlRegex }] }, manifest.id)).not.toThrow()
    expect(matchesToolUrl(urlRegex, 'https://example.com/articles/1')).toBe(true)
  })
  it('does not match an over-long URL (no backtracking work for a hostile pattern)', () => {
    const long = `https://example.com/${'a'.repeat(5000)}`
    expect(matchesToolUrl(manifest.tools[0].urlRegex, long)).toBe(false)
  })
})
