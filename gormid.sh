#!/usr/bin/env bash
#
# Based on:
# https://github.com/buger/goreplay/blob/master/examples/middleware/echo.sh

function log {
    # Logging to stderr, because stdout/stdin used for data transfer
    >&2 echo ">>> $1"
}

while read line; do
    decoded=$(echo -e "$line" | xxd -r -p)

    header=$(echo -e "$decoded" | head -n +1)
    payload=$(echo -e "$decoded" | tail -n +2)

    log ""
    log "==================================="

    case ${header:0:1} in
    "1")
        log "Request type: Request"
        ;;
    "2")
        log "Request type: Original Response"
        ;;
    "3")
        log "Request type: Replayed Response"
        ;;
    *)
        log "Unknown request type $header"
    esac
    echo "$line"

    log "$header"
    log $payload

    # log "Original data: $line"
    # log "Decoded request: $decoded"
done;
