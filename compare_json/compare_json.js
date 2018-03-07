const assert = require('assert')
const zlib = require('zlib')

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
    headers[header.toLowerCase()] = value.trim()
  })
  return headers
}

function httpBody(payload)/*: string|Buffer */ {
  const headers = httpHeaders(payload)
  const bufBody = gor.httpBody(payload)
  let body = bufBody.toString()

  if (headers['content-encoding'] === 'gzip') {
    body = zlib.gunzipSync(bufBody)
  }

  if (headers['transfer-encoding'] === 'chunked') {
    // `parse-raw-http` can't handle all chunked output
    // Assume there's only one line and return that
    const bodyLines = body.split(/\r\n/)
    if (bodyLines.length > 2) {
      return bodyLines[1]
    }
  }

  // WISHLIST get and use charset
  if (headers['content-type'] && headers['content-type'].includes('application/json')) {
    body = JSON.parse(body)
  }

  return body
}

const statsd = new StatsD()
gor.init()

gor.on('request', function(req) {
  gor.on('response', req.ID, function(resp) {
    gor.on('replay', req.ID, function(repl) {
      const method = gor.httpMethod(req.http)
      const path = gor.httpPath(req.http)
      // https://docs.sentry.io/clients/node/usage/#additional-data
      const extra = {
        method,
        path,
        request: req.http.toString(),
        resp: resp.http.toString(),
        respRepl: repl.http.toString(),
      }

      statsd.increment('goreplay.requests.total', [`method:${method}`, `path:${path}`])
      const respStatus = gor.httpStatus(resp.http)
      const replStatus = gor.httpStatus(repl.http)
      if (respStatus != replStatus) {
        const message = `${path} STATUS MISMATCH: 'Expected '${gor.httpStatus(resp.http)}' got '${gor.httpStatus(repl.http)}'`
        Raven.captureException(message, {
          fingerprint: ['{{ default }}', path, respStatus, replStatus],
          extra,
        })
      } else {
        try {
          assert.deepEqual(httpBody(repl.http), httpBody(resp.http))
          // OK
          statsd.increment('goreplay.requests.pass', [`method:${method}`, `path:${path}`])
        } catch (err) {
          console.error('%s MISMATCH: %s', path, err.message)
          Raven.captureException(err, {
            fingerprint: ['{{ default }}', path, err.message],
            extra,
          })
        }
      }
      return repl
    })
    return resp
  })
  return req
})
