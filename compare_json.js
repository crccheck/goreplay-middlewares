const assert = require('assert')
const gor = require('goreplay_middleware')

gor.init()

gor.on('request', function(req) {
  gor.on('response', req.ID, function(resp) {
    gor.on('replay', req.ID, function(repl) {
      if (gor.httpStatus(resp.http) != gor.httpStatus(repl.http)) {
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
          // BAD
        }
      }
      return repl
    })
    return resp
  })
  return req
})
