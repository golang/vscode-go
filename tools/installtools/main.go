// Binary installtools is a helper that installs Go tools extension tests depend on.
package main

import (
	"fmt"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strings"
)

var tools = []struct {
	path    string
	version string
	dest    string
}{
	// TODO: auto-generate based on allTools.ts.in.
	{"golang.org/x/tools/gopls", "", ""},
	{"github.com/acroca/go-symbols", "", ""},
	{"github.com/cweill/gotests/gotests", "", ""},
	{"github.com/davidrjenni/reftools/cmd/fillstruct", "", ""},
	{"github.com/haya14busa/goplay/cmd/goplay", "", ""},
	{"github.com/stamblerre/gocode", "", "gocode-gomod"},
	{"github.com/mdempsky/gocode", "", ""},
	{"github.com/ramya-rao-a/go-outline", "", ""},
	{"github.com/rogpeppe/godef", "", ""},
	{"github.com/sqs/goreturns", "", ""},
	{"github.com/uudashr/gopkgs/v2/cmd/gopkgs", "", ""},
	{"github.com/zmb3/gogetdoc", "", ""},
	{"honnef.co/go/tools/cmd/staticcheck", "", ""},
	{"golang.org/x/tools/cmd/gorename", "", ""},
	{"github.com/go-delve/delve/cmd/dlv", "master", "dlv-dap"},
	{"github.com/go-delve/delve/cmd/dlv", "", ""},
}

func main() {
	ver, err := goVersion()
	if err != nil {
		exitf("failed to find go version: %v", err)
	}
	bin, err := goBin()
	if err != nil {
		exitf("failed to determine go tool installation directory: %v", err)
	}
	if ver < 1 {
		exitf("unsupported go version: 1.%v", ver)
	} else if ver < 16 {
		err = installTools(bin, "get")
	} else {
		err = installTools(bin, "install")
	}
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

func installTools(binDir, installCmd string) error {
	dir := ""
	if installCmd == "get" { // run `go get` command from an empty directory.
		dir = os.TempDir()
	}
	env := append(os.Environ(), "GO111MODULE=on")
	for _, tool := range tools {
		ver := tool.version
		if ver == "" {
			ver = "latest"
		}
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

func runWithGoInstall() error {
	return nil
}
