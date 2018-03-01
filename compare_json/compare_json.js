const assert = require('assert')

const gor = require('goreplay_middleware')
const StatsD = require('hot-shots')
const Raven = require('raven')

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
      statsd.increment('zztest.requests.total')
      if (gor.httpStatus(resp.http) != gor.httpStatus(repl.http)) {
        statsd.increment('zztest.fail.total')
        console.error(
          "%s STATUS NOT MATCH: 'Expected %s got '%s'",
          gor.httpPath(req.http),
          gor.httpStatus(resp.http),
          gor.httpStatus(repl.http),
        )
      } else {
        try {
          respData = JSON.parse(gor.httpBody(resp.http))
          replData = JSON.parse(gor.httpBody(repl.http))
          assert.deepEqual(respData, replData)
          // OK
        } catch (err) {
          console.error('MISMATCH %s: %s', gor.httpPath(req.http), err.message)
          statsd.increment('zztest.fail.total')
          // TODO send more data
          // https://docs.sentry.io/clients/node/usage/#additional-data
          const httpRequest = {
            reqHeaders: httpHeaders(req.http),
            respHeaders: httpHeaders(resp.http),
            respReplHeaders: httpHeaders(repl.http),
            method: gor.httpMethod(req.http),
            path: gor.httpPath(req.http),
            reqBody: gor.httpBody(req.http).toString(),
          }
          Raven.captureException(err, {
            extra: httpRequest,
          })
        }
      }
      return repl
    })
    return resp
  })
  return req
})
