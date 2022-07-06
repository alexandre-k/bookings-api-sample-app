#!/bin/sh

set -e

echo "---- Running backend entrypoint ----"

NODE_ENV=$NODE_ENV yarn start
