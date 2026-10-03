# Agent Quickstart

The loop for a model that writes styled HTML:

1. The model emits HTML.
2. Compile it: `POST /api/compile`, or `core.compile()` in-process.
3. If `rejected` is not empty, feed those values back to the model and recompile.
4. Serve the `css` from the compile response. `GET /api/css` and `core.getCss()` only return what is still cached and answer 404 after expiry.

`rejected` is defined in [POST /api/compile](api-reference.html#post-apicompile); HTML alone is enough.

## Node

```js
import { createCore } from "@thinkly/rich-wind";

const core = await createCore();
const projectId = "agent-demo";
const pageId = "card";

let html = '<div class="p-4 bg-brand-500 rounded-lg">Hi</div>';
let result = await core.compile({ projectId, pageId, html });
// result.rejected is ["bg-brand-500"]; result.classes is ["p-4", "rounded-lg"]
if (result.rejected.length > 0) {
  // Ask the model to replace result.rejected, then compile its new output.
  html = '<div class="p-4 bg-blue-500 rounded-lg">Hi</div>';
  result = await core.compile({ projectId, pageId, html });
  // result.rejected is []; result.classes is ["bg-blue-500", "p-4", "rounded-lg"]
}

const { css } = result;
await core.close();
```

`bg-brand-500` is not in Tailwind's default design system, so it comes back in `rejected`. Errors are thrown as `RichWindError` (see [Errors](api-reference.html#errors)).

Over HTTP, send the same body to `POST /api/compile`; the response shape is in the [API Reference](api-reference.html#post-apicompile).
