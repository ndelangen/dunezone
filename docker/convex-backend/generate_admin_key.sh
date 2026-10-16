#!/usr/bin/env bash
# Convex's image ships a separate generate_key binary; the release binary carries the same keygen.

set -e

source ./read_credentials.sh

./convex-local-backend keygen admin-key --instance-name "$INSTANCE_NAME" --instance-secret "$INSTANCE_SECRET"
