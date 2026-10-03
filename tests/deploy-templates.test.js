import fs from "node:fs";
import { describe, it, expect } from "vitest";

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), "utf8");

describe("deploy templates", () => {
  const example = read("../deploy/rich-wind.env.example");
  const source = read("../services/index.js");
  const names = [...example.matchAll(/^#?(RW_[A-Z0-9_]+)=/gm)].map((m) => m[1]);

  it("lists RW_ variables", () => {
    expect(names.length).toBeGreaterThan(0);
  });

  it.each([...new Set(names)])("%s is read by services/index.js", (name) => {
    expect(source).toContain(`process.env.${name}`);
  });

  it("every RW_ variable the server reads is in the example", () => {
    const used = [...source.matchAll(/process\.env\.(RW_[A-Z0-9_]+)/g)].map((m) => m[1]);
    for (const name of new Set(used)) expect(names).toContain(name);
  });
});
