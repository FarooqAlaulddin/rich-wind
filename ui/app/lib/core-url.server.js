const rawCoreUrl = (process.env.RW_CORE_URL || "http://localhost:3001").trim();

export const CORE_URL = /^https?:\/\//i.test(rawCoreUrl)
  ? rawCoreUrl
  : `http://${rawCoreUrl}`;
