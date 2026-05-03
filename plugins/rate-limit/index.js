/**
 * Rate Limit Plugin
 *
 * Adds fixed-window per-IP rate limiting via the `guard` hook. Not needed
 * when a reverse proxy (nginx, Caddy, Cloudflare) already handles rate
 * limiting — use this for standalone deployments or local dev servers that
 * need request throttling without an external layer.
 *
 * Options:
 *   windowMs  — window size in milliseconds (default: 60000)
 *   max       — max requests per IP per window (default: 60)
 *   disabled  — set true to bypass all limiting (default: false)
 *
 * Usage:
 *   import { createRateLimitPlugin } from 'rich-wind/plugins/rate-limit/index.js';
 *   createCore({ plugins: [createRateLimitPlugin({ max: 30 })] });
 */

export function createRateLimitPlugin(options = {}) {
  const windowMs = options.windowMs ?? 60000;
  const max = options.max ?? 60;
  const disabled = options.disabled ?? false;

  const buckets = new Map();
  let cleanup = null;

  return {
    name: 'rate-limit',

    setup() {
      if (!disabled && windowMs > 0) {
        cleanup = setInterval(() => {
          const now = Date.now();
          for (const [ip, entry] of buckets.entries()) {
            if (entry.resetAt <= now) buckets.delete(ip);
          }
        }, windowMs);
        cleanup.unref();
      }
    },

    teardown() {
      if (cleanup) {
        clearInterval(cleanup);
        cleanup = null;
      }
    },

    guard({ ip }) {
      if (disabled) return;
      const now = Date.now();
      const entry = buckets.get(ip);
      if (!entry || entry.resetAt <= now) {
        buckets.set(ip, { count: 1, resetAt: now + windowMs });
        return;
      }
      if (entry.count >= max) {
        const retryAfter = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        return { blocked: true, status: 429, error: 'Rate limit exceeded. Slow down.', retryAfter };
      }
      entry.count += 1;
    }
  };
}

export default createRateLimitPlugin;
