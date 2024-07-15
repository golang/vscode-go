// Copyright 2021 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Binary installtools is a helper that installs Go tools extension tests depend on.
package main

import (
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strings"
)

// finalVersion encodes the fact that the specified tool version
// is the known last version that can be buildable with goMinorVersion.
type finalVersion struct {
	goMinorVersion int
	version        string
}

var tools = []struct {
	path          string
	dest          string
	preferPreview bool
	// versions is a list of supportedVersions sorted by
	// goMinorVersion. If we want to pin a tool's version
	// add a fake entry with a large goMinorVersion
	// value and the pinned tool version as the last entry.
	// Nil of empty list indicates we can use the `latest` version.
	versions []finalVersion
}{
	// TODO: auto-generate based on allTools.ts.in.
	{"golang.org/x/tools/gopls", "", true, nil},
	{"github.com/cweill/gotests/gotests", "", false, nil},
	{"github.com/haya14busa/goplay/cmd/goplay", "", false, nil},
	{"honnef.co/go/tools/cmd/staticcheck", "", false, []finalVersion{{18, "v0.3.3"}, {20, "v0.4.7"}}},
	{"github.com/go-delve/delve/cmd/dlv", "", false, []finalVersion{{16, "v1.8.3"}, {17, "v1.9.1"}, {18, "v1.20.2"}, {20, "v1.22.1"}}},
}

// pickVersion returns the version to install based on the supported
// version list.
func pickVersion(goMinorVersion int, versions []finalVersion, defaultVersion string) string {
	for _, v := range versions {
		if goMinorVersion <= v.goMinorVersion {
			return v.version
		}
	}
	return defaultVersion
}

func main() {
	ver, err := goVersion()
	if err != nil {
		exitf("failed to find go version: %v", err)
	}
	if ver < 1 {
		exitf("unsupported go version: 1.%v", ver)
	}

	bin, err := goBin()
	if err != nil {
		exitf("failed to determine go tool installation directory: %v", err)
	}
	err = installTools(bin, ver)
	if err != nil {
		exitf("failed to install tools: %v", err)
	}
}

func exitf(format string, args ...interface{}) {
	fmt.Fprintf(os.Stderr, format, args...)
	os.Exit(1)
}

// goVersion returns an integer N if go's version is 1.N.
func goVersion() (int, error) {
	cmd := exec.Command("go", "list", "-e", "-f", `{{context.ReleaseTags}}`, "--", "unsafe")
	cmd.Env = append(os.Environ(), "GO111MODULE=off")
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
	for i := len(tags) - 1; i >= 0; i-- {
		var version int
		if _, err := fmt.Sscanf(tags[i], "go1.%d", &version); err != nil {
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
	out, err := exec.Command("go", "env", "GOPATH").Output()
	if err != nil {
		return "", err
	}
	gopaths := filepath.SplitList(strings.TrimSpace(string(out)))
	if len(gopaths) == 0 {
		return "", fmt.Errorf("invalid GOPATH: %s", out)
	}
	return filepath.Join(gopaths[0], "bin"), nil
}

func installTools(binDir string, goMinorVersion int) error {
	installCmd := "install"
	if goMinorVersion < 16 {
		installCmd = "get"
	}

	dir := ""
	if installCmd == "get" { // run `go get` command from an empty directory.
		dir = os.TempDir()
	}
	env := append(os.Environ(), "GO111MODULE=on")
	for _, tool := range tools {
		ver := pickVersion(goMinorVersion, tool.versions, pickLatest(tool.path, tool.preferPreview))
		path := tool.path + "@" + ver
		cmd := exec.Command("go", installCmd, path)
		cmd.Env = env
		cmd.Dir = dir
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
	out, err := exec.Command("go", "list", "-m", "--versions", toolPath).Output()
	if err != nil {
		exitf("failed to find a suitable version for %q: %v", toolPath, err)
	}
	versions := bytes.Split(out, []byte(" "))
	if len(versions) == 0 {
		exitf("failed to find a suitable version for %q: %s", toolPath, out)
	}
	return string(bytes.TrimSpace(versions[len(versions)-1]))
}
