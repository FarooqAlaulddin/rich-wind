import { CORE_URL } from "../lib/core-url.server.js";
import { getUserId } from "../lib/user-id.server.js";

export async function action({ request }) {
  if (request.method && request.method.toUpperCase() !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  let payload = {};
  try {
    payload = await request.json();
  } catch (error) {
    payload = {};
  }

  const userId = getUserId(request);
  if (userId && payload.projectId) {
    payload.projectId = `${userId}_${payload.projectId}`;
  }

  const response = await fetch(`${CORE_URL}/api/suggest`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  return new Response(text, {
    status: response.status,
    headers: {
      "Content-Type": response.headers.get("content-type") || "application/json",
    },
  });
}

