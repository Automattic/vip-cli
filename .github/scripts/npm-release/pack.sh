#!/usr/bin/env bash
# stdout is exclusively the validated tarball path. All build output goes to stderr.
set -euo pipefail

source_dir=$(cd "${1:-.}" && pwd -P)
output_dir=$(cd "${2:?Provide an existing output directory outside the source tree}" && pwd -P)
tag=${3:-latest}
smoke_script=${4:-}
case "$output_dir/" in
  "$source_dir/"*) echo 'Output directory must be outside the source tree.' >&2; exit 1 ;;
esac
script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/npm-pack-staged.XXXXXXXX")
trap 'rm -rf "$work_dir"' EXIT
case "$work_dir/" in
  "$source_dir/"*) echo 'TMPDIR must be outside the source tree.' >&2; exit 1 ;;
esac

# Preserve validation/pack hooks, but run all artifact-producing hooks before copying.
# Never expose the registry token to lifecycle scripts or smoke tests.
export NODE_AUTH_TOKEN=''
export NPM_CONFIG_LOGLEVEL=error
export npm_config_tag="$tag"
cd "$source_dir"
npm run prepublishOnly --if-present >&2
npm run prepack --if-present >&2
npm run prepare --if-present >&2

mkdir "$work_dir/package"
# -a intentionally omits -H: every hard-linked name becomes an independent file.
# A fresh destination is essential; updating an old staging tree is not sufficient.
rsync -a --exclude='/.git' --exclude='/.npmrc' "$source_dir/" "$work_dir/package/"
(
  cd "$work_dir/package"
  npm pack --ignore-scripts --json --pack-destination "$work_dir" > "$work_dir/pack.json"
)
filename=$(node -e 'const p = require(process.argv[1]); if (p.length !== 1 || require("node:path").basename(p[0].filename) !== p[0].filename) process.exit(1); process.stdout.write(p[0].filename);' "$work_dir/pack.json")
archive="$work_dir/$filename"
python3 "$script_dir/validate.py" "$archive" "$source_dir/package.json" >&2
npm run postpack --if-present >&2

if [[ -n "$smoke_script" ]]; then
  mkdir "$work_dir/smoke"
  tar -xzf "$archive" -C "$work_dir/smoke"
  # Run against the extracted artifact, not the original checkout or staging tree.
  (cd "$work_dir/smoke/package" && npm run "$smoke_script") >&2
fi

# Only expose a completed, validated artifact. The caller owns output_dir cleanup.
if [[ -e "$output_dir/$filename" ]]; then
  echo "Refusing to overwrite an existing artifact: $output_dir/$filename" >&2
  exit 1
fi
cp "$archive" "$output_dir/$filename"
printf '%s\n' "$output_dir/$filename"
