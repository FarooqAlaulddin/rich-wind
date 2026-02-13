# Plugin System

Rich Wind exposes a lightweight plugin system so features can live outside the core. Plugins receive lifecycle hooks during compilation, caching, and request handling.

## Basic Usage

```js
import { createCore } from "rich-wind";

const app = createCore({
  pluginTimeoutMs: 200,
  plugins: [
    {
      name: "audit",
      onCompileStart: ({ projectId, pageId }) => {
        console.log("compile", projectId, pageId);
      },
    },
  ],
});

app.listen(3001);
```

## Available Hooks

| Hook | When it fires | Key context fields |
| --- | --- | --- |
| `onRequestStart` | Incoming request received | `request` |
| `onResponseSent` | Response sent to client | `request`, `status`, `durationMs` |
| `onCompileStart` | Before Tailwind compilation | `projectId`, `pageId`, `bundle` |
| `onCompileResult` | After compilation completes | `projectId`, `pageId`, `css`, `classes`, `hash` |
| `onCacheHit` | Page cache hit | `projectId`, `pageId`, `hash` |
| `onCacheMiss` | Page cache miss | `projectId`, `pageId` |
| `onProjectCss` | Project-level CSS aggregated | `projectId`, `css` |
| `onSuggest` | Suggestion request handled | `projectId`, `prefix`, `suggestions` |
| `onError` | Any hook error or timeout | `error`, `hookName`, `pluginName` |

### Hook Context

All hooks receive a context object. Common fields:

- `projectId`, `pageId`, `bundle` — identifiers for the current operation
- `classes`, `css`, `hash`, `cached` — compilation results (where relevant)
- `request` — `{ ip, method, path }`
- `status`, `durationMs` — response metadata (for `onResponseSent`)

## Plugin Options

### Per-plugin

| Option | Type | Description |
| --- | --- | --- |
| `name` | string | Used in error reporting. |
| `defer` | boolean | Run all hooks asynchronously (non-blocking). |
| `deferHooks` | string[] | Defer only specific hooks by name. |
| `timeoutMs` | number | Per-hook timeout before `onError` is called. |

### Global

| Option | Description |
| --- | --- |
| `pluginTimeoutMs` | Passed to `createCore()`. Default timeout for all plugin hooks. |
| `RW_PLUGIN_TIMEOUT_MS` | Environment variable equivalent. |

## Error Handling

- Hook errors are caught and never crash the server.
- If a hook throws or exceeds its timeout, `onError` is called with the error details.
- Use `defer` or `deferHooks` to make hooks non-blocking so they don't add latency.

## Example: Logging Plugin

```js
const loggingPlugin = {
  name: "logger",
  defer: true,
  onCompileResult: ({ projectId, pageId, classes }) => {
    console.log(`[${projectId}/${pageId}] ${classes.length} classes compiled`);
  },
  onError: ({ error, hookName }) => {
    console.error(`Hook ${hookName} failed:`, error.message);
  },
};

const app = createCore({ plugins: [loggingPlugin] });
```
