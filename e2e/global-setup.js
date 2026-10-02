// Runs once, after the webServers are up. A brand-new core has never seen the
// demo project, so the theme bundle request the demo makes while it boots
// answers 404 until the first compile registers the project. Registering it
// here keeps every test independent of whether it is the first one to run.
// (That first-load 404 on a virgin core is reported separately as a demo issue.)
export default async function globalSetup() {
  const core = `http://localhost:${process.env.RW_E2E_CORE_PORT || 3101}`;
  const res = await fetch(`${core}/api/compile`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ projectId: 'lexical-demo', pageId: 'e2e-warmup', html: '', classes: ['p-4', 'text-slate-900'], bundle: 'utilities' }),
  });
  if (!res.ok) throw new Error(`core warm-up compile failed: HTTP ${res.status}`);
}
