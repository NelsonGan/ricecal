/**
 * Lets Node import the app's TypeScript directly.
 *
 * `--experimental-strip-types` handles the types; it does not handle module
 * resolution. TypeScript source writes `import { … } from './derive'` with no
 * extension, and Node's ESM resolver requires one, so the import fails with
 * ERR_MODULE_NOT_FOUND naming a file that is plainly there.
 *
 * Retrying with `.ts` appended is the whole fix. Registered by
 * `register-ts.mjs`; used only by the catalogue generator, which is a build
 * time script and never ships.
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context)
  } catch (error) {
    if (specifier.startsWith('.') && !specifier.endsWith('.ts')) {
      return nextResolve(`${specifier}.ts`, context)
    }
    throw error
  }
}
