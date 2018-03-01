const assert = require('assert')

const gor = require('goreplay_middleware')
const StatsD = require('hot-shots')


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
          console.error(err.message)
          statsd.increment('zztest.fail.total')
          // BAD
        }
      }
      return repl
    })
    return resp
  })
  return req
})
