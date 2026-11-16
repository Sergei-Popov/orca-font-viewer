#!/bin/sh
# Downloads the OFL fonts the listing images show into .test-files/listing/ (git-ignored), checking
# each download against its sha256. Fonts from type projects only, never a company's own fonts:
#
#   Recursive 1.085      github.com/arrowtype/recursive   OFL 1.1, no Reserved Font Name
#   LXGW WenKai 1.530    github.com/lxgw/LxgwWenKai       OFL 1.1 (Reserved Font Names: shown unmodified)
#   Inter 4.1            github.com/rsms/inter            OFL 1.1
#
# Never commit a TTF, OTF or TTC: the orca.dev directory rejects plugins that carry one.
set -eu
cd "$(dirname "$0")/.."
dir=.test-files/listing
mkdir -p "$dir"

# fetch <url> <file> <sha256>: downloads unless the file is already there with that sha256.
fetch() {
  if [ -f "$dir/$2" ] && [ "$(shasum -a 256 "$dir/$2" | cut -d' ' -f1)" = "$3" ]; then return; fi
  echo "downloading $2"
  curl -fsSL --retry 3 --retry-all-errors -o "$dir/$2.part" "$1"
  got=$(shasum -a 256 "$dir/$2.part" | cut -d' ' -f1)
  if [ "$got" != "$3" ]; then
    echo "$2: sha256 $got, expected $3" >&2
    rm -f "$dir/$2.part"
    exit 1
  fi
  mv "$dir/$2.part" "$dir/$2"
}

fetch https://github.com/arrowtype/recursive/releases/download/v1.085/ArrowType-Recursive-1.085.zip \
  ArrowType-Recursive-1.085.zip cbcbdf7a0e181d284a9235e09ed5f3873e527bc5dd1d977df71cdc1ff937da02
fetch https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip \
  Inter-4.1.zip 9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e
fetch https://github.com/lxgw/LxgwWenKai/releases/download/v1.530/LXGWWenKai-Regular.ttf \
  LXGWWenKai-Regular.ttf 2d73eea94ad808999d90c0000c239a84a33b09d4bc6ab6c5b8bbf1eda8a7fc8b
fetch https://raw.githubusercontent.com/lxgw/LxgwWenKai/v1.530/OFL.txt \
  OFL-LXGWWenKai.txt 1a25e35da1031c6c3436fde545bb9cb5aca954e9873afe510c834b8b79bd21a0

unzip -o -j -q "$dir/ArrowType-Recursive-1.085.zip" \
  ArrowType-Recursive-1.085/Recursive_Desktop/Recursive_VF_1.085.ttf -d "$dir"
unzip -p -q "$dir/ArrowType-Recursive-1.085.zip" ArrowType-Recursive-1.085/LICENSE.txt > "$dir/OFL-Recursive.txt"
unzip -o -j -q "$dir/Inter-4.1.zip" Inter.ttc InterVariable.ttf -d "$dir"
unzip -p -q "$dir/Inter-4.1.zip" LICENSE.txt > "$dir/OFL-Inter.txt"
