Goreplay Middlewares
===================

Useful [Goreplay] middlewares I've come up with.


Compare HTTP
------------

Compare the HTTP responses between the original and replayed request.

* language: Bash

### Sample

In terminal 1:

    python3 -m http.server 6969

In terminal 2:

    python2 -m SimpleHTTPServer 9001

In terminal 3:

    while [ 1 ]; do curl -v localhost:6969; sleep 3; done

In terminal 4:

    ./gor \
      --input-raw-bpf-filter ":" \  # Only needed for local testing
      --input-raw :6969 \
      --input-raw-track-response \
      --middleware "/path/to/goreplay-middlewars/compare_http.sh" \
      --output-http http://localhost:9001 \
      --output-http-track-response


[goreplay]: https://github.com/buger/goreplay
