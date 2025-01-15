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
	root := filepath.Dir(dir)

	// Build docker image.
	// TODO(hxjiang): use Go in PATH instead of env GOVERSION. LUCI will prepare
	// the Go in different version so vscode-go test don't need to worry.
	dockerBuild := exec.Command("docker", "build", "-q", "-f", "./build/Dockerfile", ".")
	// The docker build must be executed at the root of the vscode-go repository
	// to ensure the entire repository is copied into the image.
	dockerBuild.Dir = root
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

	// Run integration test using previous build docker image.
	// For debug tests, we need ptrace.
	// TODO(hxjiang): migrate the shell based ci test with go test.
	// TODO(hxjiang): remove ANSI escape codes from npm log.
	dockerRun := exec.Command("docker", "run", "--cap-add", "SYS_PTRACE", "--shm-size=8G", "--workdir=/workspace", imageID, "ci")
	output, err = dockerRun.CombinedOutput()
	t.Logf("integration test log:\n%s\n", output)
	if err != nil {
		t.Errorf("failed to run integration test: %v", err)
	}
}
