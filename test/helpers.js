// Minimal Vercel-style req/res doubles for handler tests.

export function makeRes() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    ended: false,
    status(code) { this.statusCode = code; return this },
    json(obj)    { this.body = obj; return this },
    send(obj)    { this.body = obj; return this },
    setHeader(k, v) { this.headers[k] = v; return this },
    write()      { return true },
    end()        { this.ended = true; return this },
    get headersSent() { return this.ended },
  }
}

export function makeReq({ method = 'POST', headers = {}, query = {}, body = {} } = {}) {
  return { method, headers, query, body }
}
