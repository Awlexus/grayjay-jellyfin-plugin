#!/bin/sh

# Update the public key and script signature
fly secrets set SCRIPT_PUBLIC_KEY $(mix signature --public-key)
fly secrets set SCRIPT_SIGNATURE $(mix signature --signature)

# trigger the deployment
fly deploy
