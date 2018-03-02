const assert = require('assert')

const gor = require('goreplay_middleware')
const StatsD = require('hot-shots')
const Raven = require('raven')
const { parseResponse } = require('parse-raw-http').parseResponse

if (process.env.SENTRY_DSN) {
  Raven.config(process.env.SENTRY_DSN)
}

function httpHeaders(payload) {
  const headers = {}
  const head = payload.slice(0, payload.indexOf('\r\n\r\n')).toString()
  const raw_headers = head.split('\r\n')
  raw_headers.shift() // remove first line
  raw_headers.forEach((line) => {
    const [header, value] = line.split(':', 2)
    headers[header] = value.trim()
  })
  return headers
}

const statsd = new StatsD()
gor.init()

gor.on('request', function(req) {
  gor.on('response', req.ID, function(resp) {
    gor.on('replay', req.ID, function(repl) {
      const method = gor.httpMethod(req.http)
      const path = gor.httpPath(req.http)
      const respObj = parseResponse(resp.http, { decodeContentEncoding: true })
      const replObj = parseResponse(repl.http, { decodeContentEncoding: true })

      statsd.increment('goreplay.requests.total', [`method:${method}`, `path:${path}`])
      if (gor.httpStatus(resp.http) != gor.httpStatus(repl.http)) {
        console.error(
          "%s STATUS MISMATCH: 'Expected %s got '%s'",
          path,
          gor.httpStatus(resp.http),
          gor.httpStatus(repl.http),
        )
      } else {
        try {
          respData = JSON.parse(respObj.bodyData)
          replData = JSON.parse(replObj.bodyData)
          assert.deepEqual(respData, replData)
          // OK
          statsd.increment('goreplay.requests.pass', [`method:${method}`, `path:${path}`])
        } catch (err) {
          console.error('%s MISMATCH: %s', path, err.message)
          // https://docs.sentry.io/clients/node/usage/#additional-data
          const extra = {
            method,
            path,
            reqHeaders: httpHeaders(req.http),
            resp: respObj,
            respHeaders: httpHeaders(resp.http),
            respReplHeaders: httpHeaders(repl.http),
            reqBody: gor.httpBody(req.http).toString(),
          }
          Raven.captureException(err, { extra })
        }
      }
      return repl
    })
    return resp
  })
  return req
})
