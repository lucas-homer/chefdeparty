export async function rewriteHtmlResponse(
  response: Response,
  replacementMap: ReadonlyMap<string, string>
): Promise<Response> {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) {
    return response;
  }

  if (replacementMap.size === 0) {
    return response;
  }

  // Read from a clone so downstream response streaming is never consumed.
  const originalHtml = await response.clone().text();
  let rewrittenHtml = originalHtml;

  for (const [from, to] of replacementMap) {
    rewrittenHtml = rewrittenHtml.replaceAll(from, to);
  }

  if (rewrittenHtml === originalHtml) {
    return response;
  }

  const headers = new Headers(response.headers);
  headers.delete("content-length");

  return new Response(rewrittenHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
