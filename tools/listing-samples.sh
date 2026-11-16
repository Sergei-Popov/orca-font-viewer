#!/bin/sh
# Puts the listing demo fonts into .orca/listing/samples/ (git-ignored) for tools/listing.json:
# downloads them first with tools/get-listing-fonts.sh (sha256-pinned OFL fonts), then copies the
# files the cover and screenshots open, with their licences. The fonts are shown unmodified.
#
#   tools/listing-samples.sh
#   ../../scripts/listing-image.sh font-viewer --dry-run --check --sheet   # from the hub: scripts/…
set -eu
cd "$(dirname "$0")/.."
tools/get-listing-fonts.sh
from=.test-files/listing
out=.orca/listing/samples
mkdir -p "$out"
for f in Recursive_VF_1.085.ttf LXGWWenKai-Regular.ttf Inter.ttc InterVariable.ttf \
  OFL-Recursive.txt OFL-LXGWWenKai.txt OFL-Inter.txt; do
  cp "$from/$f" "$out/$f"
done
ls -l "$out"
