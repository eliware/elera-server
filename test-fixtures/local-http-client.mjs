import http from "node:http";

export async function requestLocal(url, options = {}) {
  const target = new URL(url);
  const response = await new Promise((resolve, reject) => {
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port: Number(target.port),
        path: `${target.pathname}${target.search}`,
        method: options.method ?? "GET",
        headers: { connection: "close", ...options.headers },
      },
      (incoming) => {
        const chunks = [];
        incoming.on("data", (chunk) => chunks.push(chunk));
        incoming.on("end", () =>
          resolve({ incoming, body: Buffer.concat(chunks).toString("utf8") }),
        );
      },
    );
    request.on("error", reject);
    request.end(options.body);
  });
  return {
    status: response.incoming.statusCode,
    text: async () => response.body,
    json: async () => JSON.parse(response.body),
  };
}
