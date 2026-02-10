const rawCoreUrl = (process.env.RW_CORE_URL || "http://localhost:3001").trim();
const CORE_URL = /^https?:\/\//i.test(rawCoreUrl)
  ? rawCoreUrl
  : `http://${rawCoreUrl}`;

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

