export function createPendingInitResponse() {
  return {
    status: 0,
    body: "",
    writeHead(status) {
      this.status = status;
      return this;
    },
    end(body) {
      this.body = body;
    },
    once(_event, callback) {
      this.finish = callback;
    },
  };
}

export function createPendingInitRequest(url, body = { confirm: true }, method = "POST") {
  return {
    method,
    url,
    async *[Symbol.asyncIterator]() {
      yield JSON.stringify(body);
    },
  };
}
