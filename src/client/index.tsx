import { RenderCard } from './RenderCard'

/** Client-side plugin name, matching the host half. */
export const name = 'dsh-surface'

/** Wait for the slot registry; the tool slot itself is declared by ui-tool. */
export const inject = ['slots']

/**
 * Register the `render` tool's card. The key is the wire tool name: a typo
 * would silently fall back to the generic tool row.
 */
export function apply(ctx: any) {
  ctx.slots.inject('tool.call.toolview', () =>
    ctx.slots.register({ name: 'tool.call.toolview', key: 'render' }, RenderCard),
  )
}
