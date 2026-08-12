#!/bin/sh
set -e

# Production runs no pytest against this database, so the sibling *_test
# database would just sit there unused.
if [ "$APP_ENV" = "production" ]; then
    exit 0
fi

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
    CREATE DATABASE "${POSTGRES_DB}_test";
EOSQL
