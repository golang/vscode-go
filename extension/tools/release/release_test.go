// Copyright 2024 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

//go:build go1.23

package main

import (
	"archive/zip"
	"bytes"
	"debug/buildinfo"
	"flag"
	"io"
	"log"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/go-cmp/cmp"
)

var flagUpdate = flag.Bool("update", false, "update golden files")

var moduleRoot string

func TestMain(m *testing.M) {
	cmd := exec.Command("go", "list", "-m", "-f", "{{.Dir}}")
	cmd.Env = append(os.Environ(), "GOWORK=off")
	out, err := cmd.Output()
	if err != nil {
		log.Fatalf("failed to get module root for testing: %v\n", err)
	}
	moduleRoot = string(bytes.TrimSpace(out))
	os.Exit(m.Run())
}

func TestRelease(t *testing.T) {
	if _, err := exec.LookPath("npx"); err != nil {
		if value, found := os.LookupEnv("VSCODE_GO_TEST_ALL"); found && value == "true" {
			t.Errorf("required tool npx not found: %v", err)
		} else {
			t.Skipf("npx is not found (%v), skipping...", err)
		}
	}
	for _, fullCommand := range []string{
		"build-vscgo -out=/tmp/artifacts",
		"package -out=/tmp/artifacts",
		"publish -in=/tmp/artifacts",
	} {
		args := strings.Fields(fullCommand)
		// v0.43.0: prerelease
		// v0.44.0-rc.1: release candidate of stable release
		// v0.44.0: stable release
		// TODO(hyangah): skip rc in favor of prerelease versions.
		for _, tagName := range []string{"v0.43.0", "v0.44.0-rc.1", "v0.44.0"} {
			t.Run(args[0]+"-"+tagName, func(t *testing.T) {
				testRelease(t, moduleRoot, args[0], tagName, args[1:]...)
			})
		}
	}
}

func testRelease(t *testing.T, moduleRoot, command, tagName string, extraArgs ...string) {
	args := []string{"run", "-C", moduleRoot, "tools/release/release.go", command, "-n"}
	args = append(args, extraArgs...)

	cmd := exec.Command("go", args...)
	cmd.Env = append(os.Environ(),
		// Provide dummy environment variables required to run release.go commands.
		"TAG_NAME="+tagName,  // release tag
		"GITHUB_TOKEN=dummy", // github token needed to post release notes
		"VSCE_PAT=dummy",     // vsce token needed to publish the extension
		"COMMIT_SHA=4893cd984d190bdf2cd65e11c425b42819ae6f57", // bogus commit SHA used to post release notes
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		t.Fatalf("failed to run release %s: %v\n%s", command, err, output)
	}
	if *flagUpdate {
		if err := os.WriteFile(filepath.Join("testdata", command+"-"+tagName+".golden"), output, 0644); err != nil {
			t.Fatal("failed to write golden file:", err)
		}
		return
	}
	golden, err := os.ReadFile(filepath.Join("testdata", command+"-"+tagName+".golden"))
	if err != nil {
		t.Fatal("failed to read golden file:", err)
	}
	if diff := cmp.Diff(golden, output); diff != "" {
		t.Error("release package output mismatch (-want +got):\n", diff)
	}
}

func TestBuildVSCGO(t *testing.T) {
	modulePath := "github.com/golang/vscode-go"
	version := "v0.0.1"
	proxyURI := createTestModuleProxy(t, modulePath, version)

	gomodcache := t.TempDir()
	t.Cleanup(func() {
		cleanModuleCache(t, gomodcache)
	})

	outDir := t.TempDir()
	cmd := exec.Command("go", "run", "-C", moduleRoot, "tools/release/release.go", "build-vscgo", "-out", outDir)
	cmd.Env = append(os.Environ(),
		"GOPROXY="+proxyURI,
		"GOMODCACHE="+gomodcache,
		"GONOSUMDB="+modulePath,
		"TAG_NAME="+version,
	)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("failed to run build-vscgo: %v\n%s", err, out)
	}

	file, err := os.Open(filepath.Join(outDir, "vscgo.zip"))
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()

	stat, err := file.Stat()
	if err != nil {
		t.Fatal(err)
	}
	zipReader, err := zip.NewReader(file, stat.Size())
	if err != nil {
		t.Fatal(err)
	}

	want := map[string]bool{}
	for _, platform := range targetPlatforms {
		want[platform.goos+"_"+platform.goarch] = true
	}
	for _, f := range zipReader.File {
		dirname := path.Base(path.Dir(f.Name))
		if !want[dirname] {
			t.Errorf("unexpected file in zip: %v", f.Name)
			continue
		}
		// dirname must encode goos/goarch
		goos, goarch, _ := strings.Cut(path.Base(path.Dir(f.Name)), "_")

		bin, err := f.Open()
		if err != nil {
			t.Fatal(err)
		}
		defer bin.Close()
		data, err := io.ReadAll(bin)
		if err != nil {
			t.Fatal(err)
		}
		bi, err := buildinfo.Read(bytes.NewReader(data))
		if err != nil {
			t.Fatal(err)
		}
		var gotGOOS, gotGOARCH string
		for _, s := range bi.Settings {
			switch s.Key {
			case "GOOS":
				gotGOOS = s.Value
			case "GOARCH":
				gotGOARCH = s.Value
			}
		}
		if bi.Path != "github.com/golang/vscode-go/vscgo" ||
			bi.Main.Path != "github.com/golang/vscode-go" ||
			bi.Main.Version != version ||
			gotGOOS != goos ||
			gotGOARCH != goarch {
			t.Errorf("%v: got %+v; want GOOS=%v/GOARCH=%v", f.Name, bi, goos, goarch)
		}
	}
}

func createTestModuleProxy(t *testing.T, modulePath string, version string) string {
	dirPath := modulePath + "@" + version + "/"
	files := map[string][]byte{
		dirPath + "go.mod":        []byte("module " + modulePath + "\n\ngo 1.20\n"),
		dirPath + "vscgo/main.go": []byte("package main\n\nfunc main() {\n\tprintln(\"hello world\")\n}"),
	}
	proxyURI, err := WriteProxy(t.TempDir(), files)
	if err != nil {
		t.Fatal("failed to write proxy:", err)
	}
	return proxyURI
}

func cleanModuleCache(t *testing.T, gomodcache string) {
	cmd := exec.Command("go", "clean", "-modcache")
	cmd.Env = append(os.Environ(), "GOMODCACHE="+gomodcache)
	if err := cmd.Run(); err != nil {
		t.Errorf("failed to clean module cache: %v\n", err)
	}
}
