export function createApiRequest(method, url, { token = "root", body, requestId } = {}) {
  return {
    method,
    url,
    headers: {
      ...(token === null ? {} : { authorization: `Bearer ${token}` }),
      ...(requestId ? { "x-request-id": requestId } : {}),
    },
    async *[Symbol.asyncIterator]() {
      if (body !== undefined) yield JSON.stringify(body);
    },
  };
}

export function createApiResponse() {
  return {
    status: 0,
    body: "",
    writeHead(status) {
      this.status = status;
      return this;
    },
    end(body = "") {
      this.body = body;
      return this;
    },
  };
}
