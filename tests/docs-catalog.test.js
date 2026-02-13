import os from "node:os";
import path from "node:path";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadDocsCatalog, resolveDocFromPathname } from "../ui/app/routes/docs.catalog.js";

async function writeDocs(root, files) {
  await Promise.all(
    Object.entries(files).map(([name, content]) => {
      return writeFile(path.join(root, name), content, "utf8");
    })
  );
}

describe("docs catalog", () => {
  let docsRoot;

  beforeEach(async () => {
    docsRoot = await mkdtemp(path.join(os.tmpdir(), "rich-wind-docs-"));
  });

  afterEach(async () => {
    if (!docsRoot) return;
    await rm(docsRoot, { recursive: true, force: true });
  });

  it("ignores underscore drafts but keeps _review_ pages", async () => {
    await writeDocs(docsRoot, {
      "index.md": "# Overview",
      "_draft.md": "# Draft",
      "_review_runtime-spec.md": "# Runtime Spec",
      "_idea_edge-cache.md": "# Edge Cache",
      "api-reference.md": "# API",
    });

    const catalog = await loadDocsCatalog(docsRoot);

    expect(catalog.pageByFile.has("_draft.md")).toBe(false);
    expect(catalog.pageBySlug.get("runtime-spec")).toMatchObject({
      file: "_review_runtime-spec.md",
      isReview: true,
    });
    expect(catalog.pageBySlug.get("edge-cache")).toMatchObject({
      file: "_idea_edge-cache.md",
      isIdea: true,
      kind: "idea",
    });
    expect(catalog.pages[0]?.file).toBe("index.md");
  });

  it("prefers non-review file when both review and final versions exist", async () => {
    await writeDocs(docsRoot, {
      "index.md": "# Overview",
      "_review_api-reference.md": "# Review API",
      "api-reference.md": "# API",
    });

    const catalog = await loadDocsCatalog(docsRoot);
    const page = catalog.pageBySlug.get("api-reference");

    expect(page).toMatchObject({
      file: "api-reference.md",
      isReview: false,
    });
  });

  it("resolves /docs, slug routes, and .md routes from catalog", async () => {
    await writeDocs(docsRoot, {
      "index.md": "# Overview",
      "_review_runtime-spec.md": "# Runtime Spec",
      "_idea_persistence-layer.md": "# Persistence Layer",
    });

    const catalog = await loadDocsCatalog(docsRoot);

    expect(resolveDocFromPathname("/docs", catalog)?.file).toBe("index.md");
    expect(resolveDocFromPathname("/docs/runtime-spec", catalog)?.file).toBe("_review_runtime-spec.md");
    expect(resolveDocFromPathname("/docs/_review_runtime-spec.md", catalog)?.slug).toBe("runtime-spec");
    expect(resolveDocFromPathname("/docs/persistence-layer", catalog)?.file).toBe("_idea_persistence-layer.md");
    expect(resolveDocFromPathname("/docs/_idea_persistence-layer.md", catalog)?.slug).toBe("persistence-layer");
  });

  it("rejects traversal and ignored markdown routes", async () => {
    await writeDocs(docsRoot, {
      "index.md": "# Overview",
      "_draft.md": "# Draft",
      "runtime-spec.md": "# Runtime",
    });

    const catalog = await loadDocsCatalog(docsRoot);

    expect(resolveDocFromPathname("/docs/../secrets.md", catalog)).toBeNull();
    expect(resolveDocFromPathname("/docs/_draft.md", catalog)).toBeNull();
    expect(resolveDocFromPathname("/docs/missing", catalog)).toBeNull();
  });

  it("builds nav sections in required order: docs, review, ideas", async () => {
    await writeDocs(docsRoot, {
      "index.md": "# Overview",
      "api-reference.md": "# API",
      "_review_runtime-spec.md": "# Runtime Spec",
      "_idea_persistence-layer.md": "# Persistence Layer",
    });

    const catalog = await loadDocsCatalog(docsRoot);

    expect(catalog.sections.map((section) => section.kind)).toEqual([
      "docs",
      "review",
      "idea",
    ]);
    expect(catalog.sections[0]?.pages.map((page) => page.slug)).toContain("");
    expect(catalog.sections[1]?.pages.map((page) => page.slug)).toContain("runtime-spec");
    expect(catalog.sections[2]?.pages.map((page) => page.slug)).toContain("persistence-layer");
  });
});
