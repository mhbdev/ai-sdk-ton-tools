#!/bin/sh
set -eu

read_secret_file() {
  var_name="$1"
  file_var_name="${var_name}_FILE"

  eval "current_value=\${$var_name-}"
  eval "file_value=\${$file_var_name-}"

  if [ -n "${current_value}" ] && [ -n "${file_value}" ]; then
    echo "Both ${var_name} and ${file_var_name} are set; use only one." >&2
    exit 1
  fi

  if [ -n "${file_value}" ]; then
    if [ ! -f "${file_value}" ]; then
      echo "${file_var_name} points to missing file: ${file_value}" >&2
      exit 1
    fi

    secret_value="$(tr -d '\r\n' < "${file_value}")"
    export "${var_name}=${secret_value}"
    unset "${file_var_name}"
  fi
}

for variable in \
  TELEGRAM_BOT_TOKEN \
  TELEGRAM_WEBHOOK_SECRET \
  BOT_ADMIN_TOKEN \
  TONAPI_API_KEY \
  OPENROUTER_API_KEY \
  AI_GATEWAY_API_KEY \
  ENCRYPTION_MASTER_KEY \
  POSTGRES_URL \
  REDIS_URL
do
  read_secret_file "${variable}"
done

exec "$@"
