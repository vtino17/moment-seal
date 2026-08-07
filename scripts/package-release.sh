#!/usr/bin/env bash
set -euo pipefail

release_tag=${1:?Provide a v-prefixed release tag.}
output_dir=${2:?Provide a release output directory.}
source_epoch=${SOURCE_DATE_EPOCH:?Set SOURCE_DATE_EPOCH to the release commit timestamp.}

if [[ ! $release_tag =~ ^v[0-9]+\.[0-9]+\.[0-9]+([.-][A-Za-z0-9.-]+)?$ ]]; then
  echo "Release tag must be a semantic v-prefixed version." >&2
  exit 2
fi
if [[ ! $source_epoch =~ ^[0-9]+$ ]]; then
  echo "SOURCE_DATE_EPOCH must be a Unix timestamp." >&2
  exit 2
fi

mkdir -p "$output_dir"
artifact_name="momentseal-${release_tag}.tar.gz"
artifact_path="${output_dir}/${artifact_name}"

LC_ALL=C tar \
  --sort=name \
  --mtime="@${source_epoch}" \
  --owner=0 \
  --group=0 \
  --numeric-owner \
  --pax-option=delete=atime,delete=ctime \
  -czf "$artifact_path" \
  package.json pnpm-lock.yaml README.md LICENSE \
  packages/core/package.json packages/core/dist \
  packages/node/package.json packages/node/dist \
  packages/cli/package.json packages/cli/dist \
  apps/studio/package.json apps/studio/dist \
  schemas

(
  cd "$output_dir"
  sha256sum "$artifact_name" > "momentseal-${release_tag}.sha256"
)
