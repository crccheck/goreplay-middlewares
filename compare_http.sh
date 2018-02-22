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
    # TODO strip GET params
    line1=$(echo -e "$payload" | head -n +1)
    line1_bits=( $line1 )
    echo "${line1_bits[1]}" > $TMP_DIR/$request_id.url_path
    ;;
  "2")
    # log "Request type: Original Response"
    echo "$compare" > $TMP_DIR/$request_id
    ;;
  "3")
    # log "Request type: Replayed Response"
    if [ -f "$TMP_DIR/$request_id" ]; then
      log $(cat "$TMP_DIR/$request_id.url_path")
      echo "$compare" | >&2 diff --suppress-common-lines --ignore-case --ignore-all-space $TMP_DIR/$request_id -
      rm "$TMP_DIR/$request_id"
      rm "$TMP_DIR/$request_id.url_path"
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
