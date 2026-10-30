import { rm, mkdir } from 'node:fs/promises'
import { build } from 'esbuild'

const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-primitives',
]

await rm('lib', { recursive: true, force: true })
await mkdir('lib', { recursive: true })

// Host half: plain ESM, all harness packages stay external so the Loader's
// own instances are used.
await build({
  entryPoints: ['src/index.js'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  external: ['@deepseek-ai/cordis', '@deepseek-ai/dsh-tools', '@deepseek-ai/schemastery'],
  logLevel: 'info',
})

// Browser half: CJS wrapped in the harness module-loader factory. Only the
// platform module table is external; everything else is bundled.
await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2022',
  jsx: 'automatic',
  external: PLATFORM_MODULES,
  define: { 'process.env.NODE_ENV': '"production"' },
  banner: {
    js: `window.__ModuleLoader__.load({ id: "dsh-surface", factory: (require) => { var module = { exports: {} }; var exports = module.exports;`,
  },
  footer: { js: `return module.exports; } });` },
  logLevel: 'info',
})

console.log('built lib/index.js and lib/client.js')
