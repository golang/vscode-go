// Copyright 2024 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package main_test

import (
	"bytes"
	"flag"
	"os"
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/google/go-cmp/cmp"
)

var flagUpdate = flag.Bool("update", false, "update golden files")

func TestRelease(t *testing.T) {
	cmd := exec.Command("go", "list", "-m", "-f", "{{.Dir}}")
	cmd.Env = append(os.Environ(), "GOWORK=off")
	out, err := cmd.Output()
	if err != nil {
		t.Fatal("failed to get module root:", err)
	}
	moduleRoot := string(bytes.TrimSpace(out))

	for _, command := range []string{"package", "publish"} {
		t.Run(command, func(t *testing.T) {
			testRelease(t, moduleRoot, command)
		})
	}
}

func testRelease(t *testing.T, moduleRoot, command string) {
	cmd := exec.Command("go", "run", "-C", moduleRoot, "tools/release/release.go", "-n", command)
	cmd.Env = append(os.Environ(),
		// Provide dummy environment variables required to run release.go commands.
		"TAG_NAME=v0.0.0",    // release tag
		"GITHUB_TOKEN=dummy", // github token needed to post release notes
		"VSCE_PAT=dummy",     // vsce token needed to publish the extension
		"COMMIT_SHA=4893cd984d190bdf2cd65e11c425b42819ae6f57", // bogus commit SHA used to post release notes
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("failed to run release package: %v", err)
	}
	if *flagUpdate {
		if err := os.WriteFile(filepath.Join("testdata", command+".golden"), output, 0644); err != nil {
			t.Fatal("failed to write golden file:", err)
		}
		return
	}
	golden, err := os.ReadFile(filepath.Join("testdata", command+".golden"))
	if err != nil {
		t.Fatal("failed to read golden file:", err)
	}
	if diff := cmp.Diff(golden, output); diff != "" {
		t.Error("release package output mismatch (-want +got):\n", diff)
	}
}
