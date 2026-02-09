# Rich Wind UI

This is the demo UI for Rich Wind. It talks to the core service over `/api`
and visualizes compilation, cache hits, and live previews.

## Run The UI

```bash
npm install
npm run dev
```

The UI runs on `http://localhost:5173` and proxies `/api` to
`http://localhost:3001` by default.

Set `RW_CORE_URL` if the core service is running elsewhere.

Open `/preview` in a separate tab for a live, synced preview window.

## Production Build

```bash
npm run build
npm run start
```
