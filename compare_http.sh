#!/usr/bin/env bash
#
# Based on:
# https://github.com/buger/goreplay/blob/master/examples/middleware/echo.sh
#
# Requirements:
# * sed is gnused
# * xxd

# TODO /dev/shm
TMP_DIR=$(mktemp -d)

function log {
  # Logging to stderr, because stdout/stdin used for data transfer
  >&2 echo ">>> $1"
}

statsd_host="${STATSD_HOST:-127.0.0.1}"
statsd_port="${STATSD_PORT:-8125}"

# Statsd client
# Example: statsd test.zz.total:1|c
# based on https://github.com/etsy/statsd/blob/master/examples/statsd-client.sh
function statsd {
  # Setup UDP socket with statsd server
  exec 3<> /dev/udp/$statsd_host/$statsd_port

  # Send data
  printf "$1" >&3

  # Close UDP socket
  exec 3<&-
  exec 3>&-
}

log "Sending to: $TMP_DIR"

while read line; do
  decoded=$(echo -e "$line" | xxd -r -p)

  header=$(echo -e "$decoded" | head -n +1)
  payload=$(echo -e "$decoded" | tail -n +2)
  http_body=$(echo "$payload" | sed '1,/^\r\{0,1\}$/d')
  # Change this: $payload to compare headers too, $http_body for just the body
  compare="$http_body"
  # compare="$payload"

  header_bits=( $header )
  request_id=${header_bits[1]}

  case ${header_bits[0]} in
  "1")
    # log "Request type: Request"
    # Save the url path
    line1=$(echo -e "$payload" | head -n +1)
    echo "$line1" > $TMP_DIR/$request_id.line1
    ;;
  "2")
    # log "Request type: Original Response"
    echo "$compare" > $TMP_DIR/$request_id
    ;;
  "3")
    # log "Request type: Replayed Response"
    if [ -f "$TMP_DIR/$request_id" ]; then
      line1_bits=( $(cat "$TMP_DIR/$request_id.line1") )
      # TODO fallback
      method=${line1_bits[0],,}
      # TODO fallback, strip GET params
      log "$method ${line1_bits[1]}"
      statsd "zztest.total:1|c#method:$method"
      echo "$compare" | \
        >&2 diff --suppress-common-lines --ignore-case --ignore-all-space $TMP_DIR/$request_id - && \
        statsd "zztest.pass:1|c#method:$method"
      rm "$TMP_DIR/$request_id"
      rm "$TMP_DIR/$request_id.line1"
    else
      log "$request_id : Replayed response arrived before original response"
    fi
    ;;
  *)
    log "Unknown request type $header"
  esac

  # REQUIRED. Send to the next middleware/Goreplay
  echo "$line"
done;
