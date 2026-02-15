import { useLoaderData, useParams } from "react-router";
import { CORE_URL } from "../lib/core-url.server.js";
import { PLUGIN_REGISTRY } from "../lib/plugin-registry.js";

export async function loader({ request, params }) {
  const splat = params["*"];
  const segments = splat.split("/").filter(Boolean);
  const pluginName = segments[0];

  // Plugin root path (e.g., /plugins/analytics or /plugins/auto-promote)
  if (segments.length === 1) {
    const entry = PLUGIN_REGISTRY[pluginName];
    if (entry) {
      try {
        const res = await fetch(`${CORE_URL}${entry.dataEndpoint}`);
        if (!res.ok) return { _type: "react", plugin: pluginName, error: true };
        const data = await res.json();
        return { _type: "react", plugin: pluginName, ...data };
      } catch {
        return { _type: "react", plugin: pluginName, error: true };
      }
    }
  }

  // Sub-paths (e.g., /plugins/auto-promote/stats, /plugins/analytics/data)
  // → proxy to backend
  const url = new URL(request.url);
  const target = `${CORE_URL}/plugins/${splat}${url.search}`;
  const res = await fetch(target);
  const contentType = res.headers.get("content-type") || "text/plain";

  // If backend returns HTML, serve it raw (bypasses React rendering)
  if (contentType.includes("text/html")) {
    const html = await res.text();
    return new Response(html, {
      status: res.status,
      headers: { "Content-Type": "text/html" },
    });
  }

  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": contentType },
  });
}

export default function PluginRoute() {
  const data = useLoaderData();
  const params = useParams();
  const splat = params["*"];
  const pluginName = splat?.split("/")[0];

  const entry = PLUGIN_REGISTRY[pluginName];
  if (entry && data?._type === "react") {
    const Component = entry.component;
    return <Component initialData={data} routePath={`/plugins/${pluginName}`} />;
  }

  return null;
}
