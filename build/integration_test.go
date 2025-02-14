// Copyright 2025 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package integration_test

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestIntegration(t *testing.T) {
	dir, err := os.Getwd()
	if err != nil {
		t.Fatalf("failed to read current dir: %v", err)
	}

	// Build docker image.
	// TODO(hxjiang): use Go in PATH instead of env GOVERSION. LUCI will prepare
	// the Go in different version so vscode-go test don't need to worry.
	dockerBuild := exec.Command("docker", "build", "-q", "-f", "./build/Dockerfile", ".")
	// The docker build must be executed at the root of the vscode-go repository
	// to ensure the entire repository is copied into the image.
	dockerBuild.Dir = filepath.Dir(dir)
	output, err := dockerBuild.Output()
	if err != nil {
		t.Fatalf("failed to build docker image: %v", err)
	}
	imageID := strings.TrimSpace(string(output))

	// Cleanup the image if built successfully.
	defer func() {
		dockerRmi := exec.Command("docker", "rmi", "-f", imageID)
		output, err := dockerRmi.CombinedOutput()
		if err != nil {
			t.Errorf("failed to remove image %v", imageID)
		}
		t.Logf("image cleanup log:\n%s\n", output)
	}()

	// Run tests using previous build docker image.
	//
	// Coloring is disabled for integration tests but preserved for manual
	// triggers.
	// Use "npm config set color false" to disable npm color output globally,
	// and because we cannot access the Mocha command directly in this script,
	// we use env "FORCE_COLOR=0" to disable its color output.
	script := `set -e;

npm config set color false;
npm ci;

echo "**** Set up virtual display ****";
/usr/bin/Xvfb :99 -screen 0 1024x768x24 > /dev/null 2>&1 &
trap "kill \"\$(jobs -p)\"" EXIT;
export DISPLAY=:99;
sleep 3;

echo "**** Run settings generator ****";
go run ./tools/generate.go -w=false -gopls=true;

echo "**** Test build ****";
npm run compile;

echo "**** Run Go tests ****";
go test ./...;

echo "**** Run test ****";
FORCE_COLOR=0 npm run unit-test;
FORCE_COLOR=0 npm test --silent;

echo "**** Run lint ****";
npm run lint`
	// For debug tests, we need ptrace.
	cmd := exec.Command("docker", "run", "--cap-add", "SYS_PTRACE", "--shm-size=8G", "--workdir=/workspace/extension", "--entrypoint", "/bin/bash", imageID, "-c", script)
	output, err = cmd.CombinedOutput()
	t.Logf("integration test log:\n%s\n", output)
	if err != nil {
		t.Errorf("failed to run integration test in docker: %v", err)
	}
}
