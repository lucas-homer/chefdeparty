import { describe, expect, it } from "vitest";
import { rewriteHtmlResponse } from "./rewrite-html-response";

describe("rewriteHtmlResponse", () => {
  it("does not consume the response body when no replacements match", async () => {
    const html = "<html><body><h1>Hello</h1></body></html>";
    const response = new Response(html, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });

    const rewritten = await rewriteHtmlResponse(
      response,
      new Map([["/assets/main.css", "/assets/main-abc123.css"]])
    );

    expect(rewritten).toBe(response);
    await expect(rewritten.text()).resolves.toBe(html);
  });

  it("rewrites matching HTML asset paths", async () => {
    const response = new Response(
      '<html><head><link href="/assets/main.css"></head><body></body></html>',
      {
        headers: {
          "content-type": "text/html; charset=utf-8",
          "content-length": "123",
        },
      }
    );

    const rewritten = await rewriteHtmlResponse(
      response,
      new Map([["/assets/main.css", "/assets/main-abc123.css"]])
    );

    expect(rewritten).not.toBe(response);
    await expect(rewritten.text()).resolves.toContain('/assets/main-abc123.css');
    expect(rewritten.headers.get("content-length")).toBeNull();
  });

  it("skips non-HTML responses", async () => {
    const response = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });

    const rewritten = await rewriteHtmlResponse(
      response,
      new Map([["/assets/main.css", "/assets/main-abc123.css"]])
    );

    expect(rewritten).toBe(response);
    await expect(rewritten.json()).resolves.toEqual({ ok: true });
  });
});
