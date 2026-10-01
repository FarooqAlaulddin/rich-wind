# Agent Quickstart

The loop for a model that writes styled HTML:

1. The model emits HTML and an explicit class list.
2. Compile it: `POST /api/compile`, or `core.compile()` in-process.
3. If `rejected` is not empty, feed those values back to the model and recompile.
4. Serve the result: `GET /api/css`, or `core.getCss()`.

`rejected` holds the tokens from the explicit `classes` input that Tailwind could not compile. Classes found by scanning `html` are never listed there, so the model must say which classes it meant. A wrapper may parse the HTML into that list; core does not own that step.

## Node

```js
import { createCore } from "rich-wind";

const core = await createCore();
const projectId = "agent-demo";
const pageId = "card";

let html = '<div class="p-4 bg-brand-500 rounded-lg">Hi</div>';
let classes = ["p-4", "bg-brand-500", "rounded-lg"];

let result = await core.compile({ projectId, pageId, html, classes });
if (result.rejected.length > 0) {
  // Ask the model to replace result.rejected, then compile its new output.
  html = '<div class="p-4 bg-blue-500 rounded-lg">Hi</div>';
  classes = ["p-4", "bg-blue-500", "rounded-lg"];
  result = await core.compile({ projectId, pageId, html, classes });
}

const { css } = await core.getCss({ projectId, pageId });
await core.close();
```

Errors are thrown as `RichWindError` (see the [API Reference](api-reference.html#errors)).

## curl

Start a server with `npm start`, or mount `core.handler` in your app.

```bash
curl -s -X POST http://localhost:3001/api/compile \
  -H "Content-Type: application/json" \
  -d '{"projectId":"agent-demo","pageId":"card",
       "html":"<div class=\"p-4 bg-brand-500 rounded-lg\">Hi</div>",
       "classes":"p-4 bg-brand-500 rounded-lg"}'
```

```json
{
  "success": true,
  "projectId": "agent-demo",
  "pageId": "card",
  "bundle": "full",
  "hash": "cf612405...",
  "classes": ["p-4", "rounded-lg"],
  "rejected": ["bg-brand-500"],
  "cached": false,
  "css": "..."
}
```

`bg-brand-500` is not in Tailwind's default design system, so it comes back in `rejected`. After the model replaces it with `bg-blue-500`, the same request returns `"rejected": []` and `"classes": ["bg-blue-500", "p-4", "rounded-lg"]`. Then fetch the stylesheet:

```bash
curl "http://localhost:3001/api/css?projectId=agent-demo&pageId=card"
```
