// Token helpers with no catalog dependency.

/** Split "hover:md:p-4" into { prefix: "hover:md:", base: "p-4" }. Colons inside [] do not split. */
export function splitTokenSimple(token) {
  let depth = 0;
  let cut = -1;
  for (let i = 0; i < token.length; i++) {
    const c = token[i];
    if (c === '[') depth++;
    else if (c === ']') depth = Math.max(0, depth - 1);
    else if (c === ':' && depth === 0) cut = i;
  }
  return cut < 0 ? { prefix: '', base: token } : { prefix: token.slice(0, cut + 1), base: token.slice(cut + 1) };
}
