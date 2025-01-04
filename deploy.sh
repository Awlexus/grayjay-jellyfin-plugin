#!/bin/sh
JS_FILE_PATH=priv/static/js/client.js
PRIVATE_KEY_PATH=.ssh/key.pem
PUBLIC_KEY_PATH=.ssh/key.pub

if [ ! -f $PRIVATE_KEY_PATH ]; then
  mkdir -p $(dirname $PRIVATE_KEY_PATH)
  openssl genrsa -out $PRIVATE_KEY_PATH 4096
fi

if [ ! -f $PUBLIC_KEY_PATH ]; then
  openssl rsa -in $PRIVATE_KEY_PATH -pubout > $PUBLIC_KEY_PATH
fi

PUBLIC_KEY=$(cat $PUBLIC_KEY_PATH | head -n -1 | tail -n +2 | tr -d "\n")
SIGNATURE=$(cat $JS_FILE_PATH | openssl dgst -sign $PRIVATE_KEY_PATH -sha512 | base64 -w 0)

# Update the public key and script signature
fly secrets set SCRIPT_PUBLIC_KEY=$PUBLIC_KEY SCRIPT_SIGNATURE=$SIGNATURE

# trigger the deployment
fly deploy
