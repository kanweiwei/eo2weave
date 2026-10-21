/* eslint-disable react-refresh/only-export-components */
/**
 * File icons for the workspace file tree and the pending-sync panels.
 *
 * The `vscode-icons` set is NOT published on the Iconify API, so a plain
 * `icon="vscode-icons:…"` lookup would 404 at runtime and render nothing.
 * The subset of icons we actually use is bundled locally (see
 * `file-icons.generated.json`) and registered with `addCollection`, so icons
 * render instantly and offline.
 *
 * Regenerate the bundled subset after changing any icon name below:
 *   node scripts/generate-file-icons.mjs
 */
import { addCollection, Icon } from '@iconify/react'
import type { IconifyJSON } from '@iconify/react'
import collection from './file-icons.generated.json'

addCollection(collection as IconifyJSON)

/** Icon used when nothing more specific matches. */
const DEFAULT_FILE_ICON = 'vscode-icons:default-file'

/**
 * Icons for files whose name is more meaningful than their extension.
 * Keys are lower-cased full file names.
 */
const FILE_ICON_BY_NAME: Record<string, string> = {
  // Containers
  dockerfile: 'vscode-icons:file-type-docker',
  'docker-compose.yml': 'vscode-icons:file-type-docker',
  'docker-compose.yaml': 'vscode-icons:file-type-docker',

  // Build
  makefile: 'vscode-icons:file-type-gnu',
  gnumakefile: 'vscode-icons:file-type-gnu',

  // Node / package managers
  'package.json': 'vscode-icons:file-type-npm',
  'package-lock.json': 'vscode-icons:file-type-npm',
  'pnpm-lock.yaml': 'vscode-icons:file-type-pnpm',
  'yarn.lock': 'vscode-icons:file-type-yarn',
  'bun.lockb': 'vscode-icons:file-type-bun',

  // Config
  'tsconfig.json': 'vscode-icons:file-type-tsconfig',
  'jsconfig.json': 'vscode-icons:file-type-jsconfig',
  '.editorconfig': 'vscode-icons:file-type-editorconfig',
  '.eslintrc.json': 'vscode-icons:file-type-eslint',
  'eslint.config.js': 'vscode-icons:file-type-eslint',
  '.prettierrc': 'vscode-icons:file-type-prettier',
  'tailwind.config.js': 'vscode-icons:file-type-tailwind',
  'vite.config.ts': 'vscode-icons:file-type-vite',

  // Git
  '.gitignore': 'vscode-icons:file-type-git',
  '.gitattributes': 'vscode-icons:file-type-git',
  '.gitmodules': 'vscode-icons:file-type-git',

  // Environment
  '.env': 'vscode-icons:file-type-dotenv',
  '.env.local': 'vscode-icons:file-type-dotenv',
  '.env.development': 'vscode-icons:file-type-dotenv',
  '.env.production': 'vscode-icons:file-type-dotenv',

  // Misc
  license: 'vscode-icons:file-type-license',
  'license.md': 'vscode-icons:file-type-license',
}

/** Icons by file extension (lower-case, without the dot). */
const FILE_ICON_BY_EXTENSION: Record<string, string> = {
  // Code
  ts: 'vscode-icons:file-type-typescript',
  mts: 'vscode-icons:file-type-typescript',
  cts: 'vscode-icons:file-type-typescript',
  tsx: 'vscode-icons:file-type-reactts',
  js: 'vscode-icons:file-type-js',
  mjs: 'vscode-icons:file-type-js',
  cjs: 'vscode-icons:file-type-js',
  jsx: 'vscode-icons:file-type-reactjs',

  // Other languages
  rs: 'vscode-icons:file-type-rust',
  go: 'vscode-icons:file-type-go',
  py: 'vscode-icons:file-type-python',
  pyi: 'vscode-icons:file-type-python',
  java: 'vscode-icons:file-type-java',
  c: 'vscode-icons:file-type-c',
  h: 'vscode-icons:file-type-c',
  cpp: 'vscode-icons:file-type-cpp',
  cc: 'vscode-icons:file-type-cpp',
  cxx: 'vscode-icons:file-type-cpp',
  hpp: 'vscode-icons:file-type-cpp',
  cs: 'vscode-icons:file-type-csharp',
  php: 'vscode-icons:file-type-php',
  rb: 'vscode-icons:file-type-ruby',
  swift: 'vscode-icons:file-type-swift',
  kt: 'vscode-icons:file-type-kotlin',
  kts: 'vscode-icons:file-type-kotlin',
  dart: 'vscode-icons:file-type-dartlang',
  vue: 'vscode-icons:file-type-vue',
  svelte: 'vscode-icons:file-type-svelte',
  astro: 'vscode-icons:file-type-astro',
  lua: 'vscode-icons:file-type-lua',
  sh: 'vscode-icons:file-type-shell',
  bash: 'vscode-icons:file-type-shell',
  zsh: 'vscode-icons:file-type-shell',
  ps1: 'vscode-icons:file-type-powershell',
  sql: 'vscode-icons:file-type-sql',
  r: 'vscode-icons:file-type-r',
  scala: 'vscode-icons:file-type-scala',
  pl: 'vscode-icons:file-type-perl',
  ex: 'vscode-icons:file-type-elixir',
  exs: 'vscode-icons:file-type-elixir',
  hs: 'vscode-icons:file-type-haskell',
  m: 'vscode-icons:file-type-objectivec',
  mm: 'vscode-icons:file-type-objectivecpp',
  fs: 'vscode-icons:file-type-fsharp',
  fsx: 'vscode-icons:file-type-fsharp',
  clj: 'vscode-icons:file-type-clojure',
  erl: 'vscode-icons:file-type-erlang',
  zig: 'vscode-icons:file-type-zig',
  nim: 'vscode-icons:file-type-nim',

  // Web
  html: 'vscode-icons:file-type-html',
  htm: 'vscode-icons:file-type-html',
  css: 'vscode-icons:file-type-css',
  scss: 'vscode-icons:file-type-scss',
  sass: 'vscode-icons:file-type-sass',
  less: 'vscode-icons:file-type-less',
  svg: 'vscode-icons:file-type-svg',
  xml: 'vscode-icons:file-type-xml',
  graphql: 'vscode-icons:file-type-graphql',
  gql: 'vscode-icons:file-type-graphql',

  // Data & config
  json: 'vscode-icons:file-type-json',
  jsonc: 'vscode-icons:file-type-json',
  json5: 'vscode-icons:file-type-json',
  yaml: 'vscode-icons:file-type-yaml',
  yml: 'vscode-icons:file-type-yaml',
  toml: 'vscode-icons:file-type-toml',
  ini: 'vscode-icons:file-type-ini',
  cfg: 'vscode-icons:file-type-ini',
  conf: 'vscode-icons:file-type-ini',
  proto: 'vscode-icons:file-type-protobuf',

  // Docs
  md: 'vscode-icons:file-type-markdown',
  mdx: 'vscode-icons:file-type-markdown',
  markdown: 'vscode-icons:file-type-markdown',
  mdown: 'vscode-icons:file-type-markdown',
  txt: 'vscode-icons:file-type-text',
  log: 'vscode-icons:file-type-text',
  pdf: 'vscode-icons:file-type-pdf',
  doc: 'vscode-icons:file-type-word',
  docx: 'vscode-icons:file-type-word',
  ppt: 'vscode-icons:file-type-powerpoint',
  pptx: 'vscode-icons:file-type-powerpoint',
  xls: 'vscode-icons:file-type-excel',
  xlsx: 'vscode-icons:file-type-excel',
  csv: 'vscode-icons:file-type-csv',
  tex: 'vscode-icons:file-type-tex',

  // Images
  png: 'vscode-icons:file-type-image',
  jpg: 'vscode-icons:file-type-image',
  jpeg: 'vscode-icons:file-type-image',
  gif: 'vscode-icons:file-type-image',
  webp: 'vscode-icons:file-type-image',
  avif: 'vscode-icons:file-type-image',
  bmp: 'vscode-icons:file-type-image',
  ico: 'vscode-icons:file-type-image',
  tiff: 'vscode-icons:file-type-image',

  // Media
  mp3: 'vscode-icons:file-type-audio',
  wav: 'vscode-icons:file-type-audio',
  flac: 'vscode-icons:file-type-audio',
  ogg: 'vscode-icons:file-type-audio',
  m4a: 'vscode-icons:file-type-audio',
  mp4: 'vscode-icons:file-type-video',
  mov: 'vscode-icons:file-type-video',
  mkv: 'vscode-icons:file-type-video',
  webm: 'vscode-icons:file-type-video',
  avi: 'vscode-icons:file-type-video',

  // Fonts & binaries
  ttf: 'vscode-icons:file-type-font',
  otf: 'vscode-icons:file-type-font',
  woff: 'vscode-icons:file-type-font',
  woff2: 'vscode-icons:file-type-font',
  bin: 'vscode-icons:file-type-binary',
  dat: 'vscode-icons:file-type-binary',
  wasm: 'vscode-icons:file-type-wasm',

  // Archives
  zip: 'vscode-icons:file-type-zip',
  gz: 'vscode-icons:file-type-zip',
  tgz: 'vscode-icons:file-type-zip',
  tar: 'vscode-icons:file-type-zip',
  rar: 'vscode-icons:file-type-zip',
  '7z': 'vscode-icons:file-type-zip',
  bz2: 'vscode-icons:file-type-zip',
  xz: 'vscode-icons:file-type-zip',
}

/**
 * Resolve the icon for a file name.
 *
 * Exact file name wins over extension, so `package.json` and `Dockerfile`
 * get their own icons while `notes.md` falls back to the Markdown icon.
 */
export function getFileIconName(filename: string): string {
  const name = filename.toLowerCase()

  const byName = FILE_ICON_BY_NAME[name]
  if (byName) return byName

  const dotIndex = name.lastIndexOf('.')
  const extension = dotIndex > 0 ? name.slice(dotIndex + 1) : ''

  return FILE_ICON_BY_EXTENSION[extension] ?? DEFAULT_FILE_ICON
}

/** File icon rendered with the bundled `vscode-icons` subset. */
export function FileIcon({
  filename,
  className = 'h-3.5 w-3.5',
}: {
  filename: string
  className?: string
}) {
  return <Icon icon={getFileIconName(filename)} className={className} />
}
