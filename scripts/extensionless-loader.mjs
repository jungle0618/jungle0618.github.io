export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context, nextResolve);
  } catch (error) {
    if (specifier.startsWith(".") && !specifier.endsWith(".js")) {
      return nextResolve(`${specifier}.js`, context, nextResolve);
    }
    throw error;
  }
}
