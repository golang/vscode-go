#!/usr/bin/env bash
set -e

# Copyright (C) Microsoft Corporation. All rights reserved.
# Modification copyright 2020 The Go Authors. All rights reserved.
# Licensed under the MIT License. See LICENSE in the project root for license information.

usage() {
  cat <<EOUSAGE
Usage: $0 [subcommand]
Available subcommands:
  help      - display this help message.
  test      - build and test locally. Some tests may fail if vscode is already in use.
  testlocal - build and test in a locally built container.
  ci        - build and test with headless vscode. Requires Xvfb.
EOUSAGE
}

# TODO(hyangah): commands for building docker container and running tests locally with docker run.
root_dir() {
  local script_name=$(readlink -f "${0}")
  local script_dir=$(dirname "${script_name}")
  local parent_dir=$(dirname "${script_dir}")
  echo "${parent_dir}"
}

setup_virtual_display() {
  echo "**** Set up virtual display ****"
  # Start xvfb (an in-memory display server for UNIX-like operating system)
  # so we can launch a headless vscode for testing.
  /usr/bin/Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
  trap 'kill "$(jobs -p)"' EXIT
  export DISPLAY=:99
  sleep 3  # Wait for xvfb to be up.
}

go_binaries_info() {
  echo "**** Go version ****"
  go version
  df -h | grep shm
}

run_doc_test() {
  echo "**** Run settings generator ****"
  go run -C extension ./tools/generate.go -w=false -gopls=true
}

run_test() {
  pushd .
  cd "$(root_dir)/extension"
  echo "**** Test build ****"
  npm ci
  npm run compile

  echo "**** Run Go tests ****"
  VSCODE_GO_TEST_ALL="true" go test ./...

  echo "**** Run test ****"
  npm run unit-test
  npm test --silent
  popd
}

run_lint() {
  pushd .
  cd "$(root_dir)/extension"
  echo "**** Run lint ****"
  npm run lint
  popd
}

run_test_in_docker() {
  echo "**** Building the docker image ***"
  docker build -t vscode-test-env ${GOVERSION:+ --build-arg GOVERSION="${GOVERSION}"} -f ./build/Dockerfile .

  # For debug tests, we need ptrace.
  docker run --cap-add SYS_PTRACE --shm-size=8G --workdir=/workspace vscode-test-env ci
}

main() {
  cd "$(root_dir)"  # always start to run from the extension source root.
  case "$1" in
    "help"|"-h"|"--help")
      usage
      exit 0
      ;;
    "test")
      go_binaries_info
      run_test
      ;;
    "testlocal")
      run_test_in_docker
      ;;
    "ci")
      go_binaries_info
      setup_virtual_display
	    run_doc_test
      run_test
	    run_lint
      ;;
    *)
      usage
      exit 2
  esac
}
main $@
