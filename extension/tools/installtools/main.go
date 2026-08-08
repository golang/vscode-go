// Copyright 2021 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Binary installtools is a helper that installs Go tools extension tests depend on.
// In order to allow this script to use the go version in the sytem or your choice,
// avoid running this with `go run` (that may auto-upgrade the toolchain to meet
// the go version requirement in extension/go.mod).
// Instead, build this script, and run the compiled executable.
// For example,
//
//	go build -o /tmp/script . && /tmp/script
package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
)

var tools = []struct {
	path          string
	dest          string
	preferPreview bool
	version       string // pinned version, or empty string to use "latest" (or preview if preferPreview)
}{
	// TODO: auto-generate based on allTools.ts.in.
	{"golang.org/x/tools/gopls", "", true, ""},
	{"github.com/cweill/gotests/gotests", "", false, ""},
	{"github.com/haya14busa/goplay/cmd/goplay", "", false, ""},
	{"honnef.co/go/tools/cmd/staticcheck", "", false, ""},
	// For regression test: golang/vscode-go#3511
	{"github.com/golangci/golangci-lint/v2/cmd/golangci-lint", "golangci-lint-v2", false, "v2.12.2"},
	{"github.com/go-delve/delve/cmd/dlv", "", false, ""},
}

func main() {
	ver, err := goVersion()
	if err != nil {
		exitf("failed to find go version: %v", err)
	}
	fmt.Printf("installing tools for go1.%d...\n", ver)

	bin, err := goBin()
	if err != nil {
		exitf("failed to determine go tool installation directory: %v", err)
	}
	err = installTools(bin)
	if err != nil {
		exitf("failed to install tools: %v", err)
	}
}

func exitf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format, args...)
	os.Exit(1)
}

// goVersion returns an integer N if go's version is 1.N.
func goVersion() (int, error) {
	cmd := exec.Command("go", "list", "-e", "-f", `{{context.ReleaseTags}}`, "--", "unsafe")
	// GO111MODULE=off implicitly disables GOTOOLCHAIN switch,
	// but let's make sure it doesn't change.
	cmd.Env = append(os.Environ(), "GO111MODULE=off", "GOTOOLCHAIN=local")
	out, err := cmd.Output()
	if err != nil {
		return 0, fmt.Errorf("go list error: %v", err)
	}
	result := string(out)
	if len(result) < 3 {
		return 0, fmt.Errorf("bad ReleaseTagsOutput: %q", result)
	}
	// Split up "[go1.1 go1.15]"
	tags := strings.Fields(result[1 : len(result)-2])
	for _, tag := range slices.Backward(tags) {
		var version int
		if _, err := fmt.Sscanf(tag, "go1.%d", &version); err != nil {
			continue
		}
		return version, nil
	}
	return 0, fmt.Errorf("no parseable ReleaseTags in %v", tags)
}

// goBin returns the directory where the go command will install binaries.
func goBin() (string, error) {
	if gobin := os.Getenv("GOBIN"); gobin != "" {
		return gobin, nil
	}
	cmd := exec.Command("go", "env", "GOPATH")
	out, err := cmd.Output()
	if err != nil {
		return "", err
	}
	gopaths := filepath.SplitList(strings.TrimSpace(string(out)))
	if len(gopaths) == 0 {
		return "", fmt.Errorf("invalid GOPATH: %s", out)
	}
	return filepath.Join(gopaths[0], "bin"), nil
}

func installTools(binDir string) error {
	installCmd := "install"

	// For tools installation, ensure GOTOOLCHAIN=auto.
	env := append(os.Environ(), "GO111MODULE=on", "GOTOOLCHAIN=auto")
	for _, tool := range tools {
		ver := tool.version
		if ver == "" {
			ver = pickLatest(tool.path, tool.preferPreview)
		}
		path := tool.path + "@" + ver
		cmd := exec.Command("go", installCmd, path)
		cmd.Env = env
		fmt.Println("go", installCmd, path)
		if out, err := cmd.CombinedOutput(); err != nil {
			return fmt.Errorf("installing %v: %s\n%v", path, out, err)
		}
		loc := filepath.Join(binDir, binName(tool.path))
		if tool.dest != "" {
			newLoc := filepath.Join(binDir, binName(tool.dest))
			if err := os.Rename(loc, newLoc); err != nil {
				return fmt.Errorf("copying %v to %v: %v", loc, newLoc, err)
			}
			loc = newLoc
		}
		fmt.Println("\tinstalled", loc)
	}
	return nil
}

func binName(toolPath string) string {
	b := path.Base(toolPath)
	if runtime.GOOS == "windows" {
		return b + ".exe"
	}
	return b
}

func pickLatest(toolPath string, preferPreview bool) string {
	if !preferPreview {
		return "latest" // should we pick the pinned version in allTools.ts.in?
	}

	cmd := exec.Command("go", "list", "-m", "--versions", toolPath)

	// Avoid using module proxy to eliminate flakiness caused by module proxy.
	cmd.Env = append(os.Environ(), "GOPROXY=direct")

	out, err := cmd.Output()
	if err != nil {
		exitf("failed to find a suitable version for %q: %v", toolPath, err)
	}
	versions := bytes.Split(out, []byte(" "))
	if len(versions) == 0 {
		exitf("failed to find a suitable version for %q: %s", toolPath, out)
	}
	return string(bytes.TrimSpace(versions[len(versions)-1]))
}
