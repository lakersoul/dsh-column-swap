/**
 * dsh-column-swap — host half.
 *
 * The entire patch lives in the browser half (`lib/client.js`, served as this
 * package's `./client` client module). This host half exists for exactly one
 * reason: the Loader needs a mountable row, and `dsh-client-modules` discovers
 * a browser half by reading the manifest of the package that row mounts
 * (`dsh.client` + `exports["./client"]` in package.json). The row is the mount
 * point; the host side itself touches no service, no session, and no file.
 *
 * Mount row (see ../install.mjs, which writes it idempotently):
 *
 *   - insert:
 *       - id: column-swap
 *         name: '/abs/path/to/dsh-column-swap/lib/index.js'
 *
 * The browser half swaps DSH's native right column with the conversation
 * column. It depends only on DSH's own anchors — never on the plugin that
 * currently occupies the right column (e.g. dsh-better-sidebar), which it
 * neither imports nor inspects.
 */

/** Plugin name shown by the Loader; must equal the bundle id and package name. */
export const name = 'dsh-column-swap'

/** No host-side work: the column swap is a browser-side layout patch. */
export function apply() {}
