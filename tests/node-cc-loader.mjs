const stubUrl = new URL('./cc-stub.mjs', import.meta.url).href;

/**
 * @param {string} specifier
 * @param {import('node:module').ResolveHookContext} context
 * @param {import('node:module').ResolveFn} nextResolve
 */
export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'cc') {
    return { url: stubUrl, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
