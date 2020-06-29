#!/bin/bash

# Copyright 2020 The Go Authors. All rights reserved.
# Licensed under the MIT License. See LICENSE in the project root for license information.

set -euo pipefail

root_dir() {
  local script_name="${0}"
  local script_dir=$(dirname "${script_name}")
  local parent_dir=$(cd "${script_dir}/.." && pwd)
  echo "${parent_dir}"
}

ROOT="$(root_dir)"
cd "${ROOT}"  # always run from the root directory.

WORKTREE="$(mktemp -d)"
BRANCH="license-gen-$(date +%Y%m%d%H%M%S)"

git fetch
git worktree add --track -b "${BRANCH}" "${WORKTREE}" origin/master

cd "${WORKTREE}"
export GIT_GOFMT_HOOK=off

YARN="${ROOT}/node_modules/.bin/yarn"

ALL_LICENSES=$(
  $YARN licenses list --json --no-progress 2>/dev/null|
  jq 'select(.type == "table") | .data.body | map( {name: .[0], version: .[1], license: .[2], url: .[3], verndor: .[4], vendorName: .[5]} )')

NG=$(echo "${ALL_LICENSES}" | jq '
{
  "Apache-2.0": 1,
  "BSD-2-Clause": 1,
  "BSD-3-Clause": 1,
  "ISC": 1,
  "MIT": 1,
  "Unlicense": 1,
  "0BSD": 1,
  "(Unlicense OR Apache-2.0)": 1,
} as $allowed_licenses |
{
  "json-schema@0.2.3": 1,
} as $allow_list |
.[] | select(.license | in($allowed_licenses) | not)
| select((.name+"@"+.version) | in($allow_list) | not) ')

if [ -z "${NG}" ];
then
  echo "PASSED license check"
else
  echo "FAILED license check. The following dependencies need manual check: ${NG}" &&
  echo "WORKTREE=${WORKTREE}" &&
  exit 1
fi

LICENSEFILE="LICENSE.prod"
cat LICENSE > "${LICENSEFILE}"
printf "\n\n" >> "${LICENSEFILE}"
"${YARN}" licenses generate-disclaimer --prod >> "${LICENSEFILE}"

if [[ -f thirdpartynotices.txt ]]
then
  printf "\n" >> "${LICENSEFILE}"
  cat thirdpartynotices.txt >> "${LICENSEFILE}"
fi

cd - && mv "${WORKTREE}/${LICENSEFILE}" . && git worktree remove "${WORKTREE}" -f
