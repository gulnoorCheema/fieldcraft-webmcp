export default {
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const acceptsHtml = request.headers.get("accept")?.includes("text/html");

    const withWebMcpHeaders = (source) => {
      const headers = new Headers(source.headers);
      headers.set("Origin-Agent-Cluster", "?1");
      headers.set("Permissions-Policy", "tools=(self)");
      return new Response(source.body, {
        status: source.status,
        statusText: source.statusText,
        headers,
      });
    };

    if (response.status !== 404 || !acceptsHtml || !["GET", "HEAD"].includes(request.method)) {
      return withWebMcpHeaders(response);
    }

    const indexUrl = new URL(request.url);
    indexUrl.pathname = "/index.html";
    indexUrl.search = "";
    return withWebMcpHeaders(await env.ASSETS.fetch(new Request(indexUrl, request)));
  },
};
