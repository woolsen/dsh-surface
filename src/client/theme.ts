/**
 * Bridge the host's design tokens into the frame.
 *
 * The dsh shell exposes `--dsw-*` variables. Pages written for OpenChamber
 * expect `--background`, `--foreground`, `--chart-*`, and friends, so we
 * resolve the host values once per render and hand the page a small,
 * stable vocabulary instead of leaking the whole token set.
 */

export interface HostTheme {
  css: string
  dark: boolean
}

/** Host token → the names a page may use. First present token wins. */
const TOKENS: Record<string, string[]> = {
  '--background': ['--dsw-alias-bg-base'],
  '--foreground': ['--dsw-alias-label-primary'],
  '--muted': ['--dsw-alias-bg-layer-2', '--dsw-alias-bg-layer-1'],
  '--muted-foreground': ['--dsw-alias-label-secondary', '--dsw-alias-label-tertiary'],
  '--card': ['--dsw-alias-bg-layer-1', '--dsw-alias-bg-base'],
  '--card-foreground': ['--dsw-alias-label-primary'],
  '--border': ['--dsw-alias-border-l2', '--dsw-alias-border-l3'],
  '--primary': ['--dsw-alias-brand-primary-new-colorprimary-new-color', '--dsw-alias-state-business-primary'],
  '--primary-foreground': ['--dsw-alias-label-primary-inverted'],
  '--radius': ['--dsw-radius-md', '--dsw-radius-lg'],
  '--font-sans': ['--dsw-font-family'],
  '--font-mono': ['--ds-font-family-code', '--dsw-font-family-code'],
}

const CHART_TOKENS = [
  '--dsw-static-deepseek-500',
  '--dsw-static-green-500',
  '--dsw-static-amber-400',
  '--dsw-static-red-600',
  '--dsw-static-violet-500',
  '--dsw-static-neutral-bluish-300',
]

const LIGHT = {
  '--background': '#ffffff',
  '--foreground': '#0f1115',
  '--muted': '#f4f5f7',
  '--muted-foreground': '#6b7280',
  '--card': '#ffffff',
  '--card-foreground': '#0f1115',
  '--border': '#e5e7eb',
  '--primary': '#4d6bfe',
  '--primary-foreground': '#ffffff',
  '--radius': '10px',
  '--font-sans': '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  '--font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

const DARK = {
  '--background': '#0f1115',
  '--foreground': '#f5f6f8',
  '--muted': '#1a1d23',
  '--muted-foreground': '#9aa1ad',
  '--card': '#15181e',
  '--card-foreground': '#f5f6f8',
  '--border': '#2a2f38',
  '--primary': '#6e8bff',
  '--primary-foreground': '#0b0d11',
  '--radius': '10px',
  '--font-sans': '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif',
  '--font-mono': 'ui-monospace, SFMono-Regular, Menlo, monospace',
}

const CHART_FALLBACK_LIGHT = ['#4d6bfe', '#16a34a', '#f59e0b', '#dc2626', '#8b5cf6', '#64748b']
const CHART_FALLBACK_DARK = ['#7c95ff', '#4ade80', '#fbbf24', '#f87171', '#a78bfa', '#94a3b8']

function hostIsDark(): boolean {
  const body = document.body
  const root = document.documentElement
  if (body?.hasAttribute('data-ds-dark-theme')) return true
  if (body?.dataset?.theme === 'dark') return true
  if (root.dataset?.theme === 'dark') return true
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

/** Read one token, following the first alias that has a value. */
function readVar(style: CSSStyleDeclaration, names: string[]): string | undefined {
  for (const name of names) {
    const value = style.getPropertyValue(name).trim()
    if (value !== '') return value
  }
  return undefined
}

export function readHostTheme(): HostTheme {
  const dark = hostIsDark()
  const fallback = dark ? DARK : LIGHT
  const style = getComputedStyle(document.documentElement)
  const vars: Record<string, string> = {}

  for (const [alias, names] of Object.entries(TOKENS)) {
    vars[alias] = readVar(style, names) ?? (fallback as Record<string, string>)[alias] ?? ''
  }

  const charts = CHART_TOKENS.map((name) => style.getPropertyValue(name).trim())
  const chartFallback = dark ? CHART_FALLBACK_DARK : CHART_FALLBACK_LIGHT
  for (let index = 0; index < 6; index += 1) {
    vars[`--chart-${index + 1}`] = charts[index] || chartFallback[index]
  }

  const declarations = Object.entries(vars)
    .filter(([, value]) => value !== '')
    .map(([name, value]) => `${name}: ${value};`)
    .join('')

  const css = `:root{${declarations}color-scheme:${dark ? 'dark' : 'light'};}
html,body{margin:0;background:transparent;color:var(--foreground);font-family:var(--font-sans);font-size:14px;line-height:1.55;-webkit-font-smoothing:antialiased;}
body{padding:2px 2px 10px;}
a{color:var(--primary);}
::selection{background:color-mix(in srgb, var(--primary) 26%, transparent);}
`

  return { css, dark }
}
