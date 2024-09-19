// Copyright 2023 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

//go:build go1.23

// This script is used to build and publish VS Code Go extension.
// The script should be run from the root of the repository where package.json is located.
//
// The script requires the following environment variables to be set:
//
//	TAG_NAME: the name of the tag to be released.
//	COMMIT_SHA: the commit SHA to be released (optional. if not set, it will be retrieved from git)
//	VSCE_PAT: the Personal Access Token for the VS Code Marketplace.
//	GITHUB_TOKEN: the GitHub token for the Go repository.
//
// This script requires the following tools to be installed:
//
//	jq, npx, gh, git
//
// Usage:
//
//	// build vscgo@TAG_NAME (based on TAG_NAME).
//	go run ./tools/release build-vscgo -out=/tmp/artifacts
//	// package the extension (based on TAG_NAME).
//	go run ./tools/release package
//	// publish the extension.
//	go run ./tools/release publish
package main

import (
	"archive/zip"
	"encoding/json"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
)

var (
	flagN = false
)

var (
	cmdBuildVSCGO = &command{
		usage: "build-vscgo",
		short: "build github.com/golang/vscode-go/vscgo@TAG_NAME",
		long:  "build-vscgo command cross-compiles the vscgo binaries and produces vscgo.zip in -out dir",
		run:   runBuildVSCGO,
	}
	cmdPackage = &command{
		usage: "package",
		short: "package the extension to vsix file",
		long:  `package command builds the extension and produces .vsix file in -out`,
		run:   runPackage,
	}
	cmdPublish = &command{
		usage: "publish",
		short: "publish the packaged extension (vsix) to the Visual Studio Code marketplace",
		long:  `publish command publishes all the extension files in -in to the Visual Studio Code marketplace`,
		run:   runPublish,
	}

	allCommands = []*command{cmdBuildVSCGO, cmdPackage, cmdPublish}
)

func init() {
	cmdBuildVSCGO.flags.String("out", ".", "directory where the vscgo.zip file is written")
	cmdPackage.flags.String("out", ".", "directory where the artifacts are written")
	cmdPublish.flags.String("in", ".", "directory where the artifacts to be published are")

	addCommonFlags := func(cmd *command) {
		cmd.flags.BoolVar(&flagN, "n", flagN, "print the underlying commands but do not run them")
	}
	for _, cmd := range allCommands {
		addCommonFlags(cmd)
		name := cmd.name()
		cmd.flags.Usage = func() {
			help(name)
		}
	}
}

func main() {
	flag.Usage = usage
	flag.Parse()

	args := flag.Args()
	if flag.NArg() == 0 {
		flag.Usage()
		os.Exit(2)
	}
	// len(args) > 0

	if args[0] == "help" {
		flag.CommandLine.SetOutput(os.Stdout)
		switch len(args) {
		case 1:
			flag.Usage()
		case 2:
			help(args[1])
		default:
			flag.Usage()
			fatalf(`too many arguments to "help"`)
		}
		os.Exit(0)
	}

	cmd := findCommand(args[0])
	if cmd == nil {
		flag.Usage()
		os.Exit(2)
	}

	cmd.run(cmd, args[1:])
}

func usage() {
	printCommand := func(cmd *command) {
		output(fmt.Sprintf("\t%s\t%s", cmd.name(), cmd.short))
	}
	output("go run release.go [command]")
	output("The commands are:")
	output()
	for _, cmd := range allCommands {
		printCommand(cmd)
	}
	output()
}

func output(msgs ...any) {
	fmt.Fprintln(flag.CommandLine.Output(), msgs...)
}

func findCommand(name string) *command {
	for _, cmd := range allCommands {
		if cmd.name() == name {
			return cmd
		}
	}
	return nil
}

func help(name string) {
	cmd := findCommand(name)
	if cmd == nil {
		fatalf("unknown command %q", name)
	}
	output(fmt.Sprintf("Usage: release %s", cmd.usage))
	output()
	if cmd.long != "" {
		output(cmd.long)
	} else {
		output(fmt.Sprintf("release %s is used to %s.", cmd.name(), cmd.short))
	}
	anyflags := false
	cmd.flags.VisitAll(func(*flag.Flag) {
		anyflags = true
	})
	if anyflags {
		output()
		output("Flags:")
		output()
		cmd.flags.PrintDefaults()
	}
}

type command struct {
	usage string
	short string
	long  string
	flags flag.FlagSet
	run   func(cmd *command, args []string)
}

func (c command) name() string {
	name, _, _ := strings.Cut(c.usage, " ")
	return name
}

func (c command) lookupFlag(name string) flag.Value {
	f := c.flags.Lookup(name)
	if f == nil {
		fatalf("flag %q not found", name)
	}
	return f.Value
}

// runBuildVSCGO implements the "build-vscgo" subcommand.
func runBuildVSCGO(cmd *command, args []string) {
	cmd.flags.Parse(args) // will exit on error

	checkWD()

	requireTools("go")

	tagName := requireEnv("TAG_NAME")
	outDir := prepareOutputDir(cmd.lookupFlag("out").String())
	buildVSCGO(tagName, outDir)
}

// runPackage implements the "package" subcommand.
func runPackage(cmd *command, args []string) {
	cmd.flags.Parse(args) // will exit on error

	checkWD()

	requireTools("npx")

	tagName := requireEnv("TAG_NAME")

	version, isPrerelease := releaseVersionInfo(tagName)
	outDir := prepareOutputDir(cmd.lookupFlag("out").String())
	vsix := filepath.Join(outDir, fmt.Sprintf("go-%s.vsix", version))
	buildPackage(version, tagName, isPrerelease, vsix)
}

// runPublish implements the "publish" subcommand.
func runPublish(cmd *command, args []string) {
	cmd.flags.Parse(args) // will exit on error

	checkWD()

	requireTools("npx")

	// npx vsce directly reads VSCE_PAT, so no parsing is needed.
	// See https://github.com/microsoft/vscode-vsce/blob/ba6681809080ee8685fb86d4b4fca765f1d82708/src/main.ts#L186
	requireEnv("VSCE_PAT")
	tagName := requireEnv("TAG_NAME")

	version, isPrerelease := releaseVersionInfo(tagName)
	inDir := prepareInputDir(cmd.lookupFlag("in").String())
	publish(tagName, filepath.Join(inDir, fmt.Sprintf("go-%s.vsix", version)), isPrerelease)
}

func fatalf(format string, args ...any) {
	if len(args) == 0 {
		fmt.Fprint(os.Stderr, format)
	} else {
		fmt.Fprintf(os.Stderr, format, args...)
	}
	fmt.Fprintf(os.Stderr, "\n")
	os.Exit(1)
}

// prepareOutputDir normalizes --output-dir. If the directory doesn't exist,
// prepareOutputDir creates it.
func prepareOutputDir(outDir string) string {
	if outDir == "" {
		outDir = "."
	}

	if flagN {
		// -n used for testing. don't create the directory nor try to resolve.
		return outDir
	}

	// resolve to absolute path so output dir can be consitent
	// even when child processes accessing it need to run in a different directory.
	dir, err := filepath.Abs(outDir)
	if err != nil {
		fatalf("failed to get absolute path of output directory: %v", err)
	}

	if err := os.MkdirAll(dir, 0755); err != nil {
		fatalf("failed to create output directory: %v", err)
	}
	return dir
}

// prepareInputDir normalizes --input-dir.
func prepareInputDir(inDir string) string {
	if inDir == "" {
		inDir = "."
	}
	if flagN {
		// -n used for testing. don't create the directory nor try to resolve.
		return inDir
	}

	// resolve to absolute path so input dir can be consitent
	// even when child processes accessing it need to run in a different directory.
	dir, err := filepath.Abs(inDir)
	if err != nil {
		fatalf("failed to get absolute path of output directory: %v", err)
	}
	return dir
}

func requireTools(tools ...string) {
	for _, tool := range tools {
		if _, err := exec.LookPath(tool); err != nil {
			fatalf("required tool %q not found", tool)
		}
	}
}

func requireEnv(name string) string {
	v := os.Getenv(name)
	if v == "" {
		fatalf("required environment variable %q not set", name)
	}
	return v
}

// checkWD checks if the working directory is the extension directory where package.json is located.
func checkWD() {
	wd, err := os.Getwd()
	if err != nil {
		fatalf("failed to get working directory")
	}
	// check if package.json is in the working directory
	if _, err := os.Stat("package.json"); os.IsNotExist(err) {
		fatalf("package.json not found in working directory %q", wd)
	}
}

// releaseVersionInfo computes the version and label information for this release.
// It requires the TAG_NAME environment variable to be set and the tag matches the version info embedded in package.json.
func releaseVersionInfo(tagName string) (version string, isPrerelease bool) {
	// Odd numbered minor version -> prerelease, after v0.42.
	major, minor, patch, label := parseVersionTagName(tagName)
	if (major != 0 || minor > 42) && minor%2 == 1 {
		isPrerelease = true
	}
	if label != "" {
		if !strings.HasPrefix(label, "-rc.") {
			fatalf("TAG_NAME environment variable %q is not a valid release candidate version", tagName)
		}
		isPrerelease = true
	}
	return fmt.Sprintf("%d.%d.%d", major, minor, patch) + label, isPrerelease
}

func parseVersionTagName(tagName string) (major, minor, patch int, label string) {
	versionTagRE := regexp.MustCompile(`^v(?P<Major>\d+)\.(?P<Minor>\d+)\.(?P<Patch>\d+)(?P<Label>\S*)$`)
	m := versionTagRE.FindStringSubmatch(tagName)
	if m == nil {
		fatalf("TAG_NAME environment variable %q is not a valid version", tagName)
	}
	atoi := func(key string) int {
		val, err := strconv.Atoi(m[versionTagRE.SubexpIndex(key)])
		if err != nil {
			fatalf("%v in %v (%q) is not valid", key, tagName, m[versionTagRE.SubexpIndex(key)])
		}
		return val
	}
	return atoi("Major"), atoi("Minor"), atoi("Patch"), m[versionTagRE.SubexpIndex("Label")]
}

func commandRun(cmd *exec.Cmd) error {
	if flagN {
		if cmd.Dir != "" {
			tracef("cd %v", cmd.Dir)
		}
		fmt.Fprintf(os.Stderr, "%v\n", strings.Join(cmd.Args, " "))
		return nil
	}
	return cmd.Run()
}

func copy(dst, src string) error {
	if flagN {
		tracef("cp %s %s", src, dst)
		return nil
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}

func rm(file string) error {
	if flagN {
		tracef("rm %s", file)
		return nil
	}
	return os.Remove(file)
}

// buildPackage builds the extension of the given version, using npx vsce package.
func buildPackage(version, tagName string, isPrerelease bool, output string) {
	// We want to embed the README.md file of the repo root to the extension,
	// but vsce does not allow to include a file outside the node.js module directory.
	// So, let's copy the file temporarily.
	if err := copy("README.md", filepath.Join("..", "README.md")); err != nil {
		fatalf("failed to copy README.md: %v", err)
	}
	defer func() {
		if err := rm("README.md"); err != nil {
			fatalf("failed to delete the temporarily created README.md file: %v", err)
		}
	}()
	// build the package.
	args := []string{"vsce", "package",
		"-o", output,
		"--baseContentUrl", "https://github.com/golang/vscode-go/raw/" + tagName,
		"--baseImagesUrl", "https://github.com/golang/vscode-go/raw/" + tagName,
	}
	if isPrerelease || strings.Contains(tagName, "-rc.") {
		// Do not update of the version field in packages.json for prerelease or rc.
		// relui will create a cl to update package.json during stable release only.
		args = append(args, "--no-update-package-json", "--no-git-tag-version")
	}
	if isPrerelease {
		args = append(args, "--pre-release")
	}
	args = append(args, version)

	// build the package.
	cmd := exec.Command("npx", args...)
	cmd.Stderr = os.Stderr
	if err := commandRun(cmd); err != nil {
		fatalf("failed to build package: %v", err)
	}
}

// publish publishes the extension to the VS Code Marketplace using npx vsce.
func publish(tagName, packageFile string, isPrerelease bool) {
	// Skip prerelease versions, as they are not published to the marketplace.
	if strings.Contains(tagName, "-rc.") {
		return
	}

	// check if the package file exists.
	if flagN {
		tracef("stat %s", packageFile)
	} else {
		if _, err := os.Stat(packageFile); os.IsNotExist(err) {
			fatalf("package file %q does not exist. Did you run 'go run tools/release/release.go package'?", packageFile)
		}
	}

	npxVsceArgs := []string{"vsce", "publish", "-i", packageFile}
	if isPrerelease {
		npxVsceArgs = append(npxVsceArgs, "--pre-release")
	}
	cmd2 := exec.Command("npx", npxVsceArgs...)
	cmd2.Stderr = os.Stderr
	if err := commandRun(cmd2); err != nil {
		fatalf("failed to publish release")
	}
}

// commitSHA returns COMMIT_SHA environment variable, or the commit SHA of the current branch.
func commitSHA() string {
	if commitSHA := os.Getenv("COMMIT_SHA"); commitSHA != "" {
		return commitSHA
	}

	cmd := exec.Command("git", "rev-parse", "HEAD")
	cmd.Stderr = os.Stderr
	commitSHA, err := cmd.Output()
	if err != nil {
		fatalf("failed to get commit SHA")
	}
	return strings.TrimSpace(string(commitSHA))
}

// The followings are the platforms we ship precompiled vscgo binaries for.
// On other platforms not in this list, the extension will fall back to
// install vscgo using `go install`.
//
// The full list of platforms officially supported by VS Code is:
// https://code.visualstudio.com/api/working-with-extensions/publishing-extension#platformspecific-extensions
var targetPlatforms = []struct {
	name         string
	goos, goarch string
}{
	{name: "linux-x64", goos: "linux", goarch: "amd64"},
	{name: "linux-arm64", goos: "linux", goarch: "arm64"},
	{name: "darwin-x64", goos: "darwin", goarch: "amd64"},
	{name: "darwin-arm64", goos: "darwin", goarch: "arm64"},
	{name: "win32-x64", goos: "windows", goarch: "amd64"},
	{name: "win32-arm64", goos: "windows", goarch: "arm64"},
}

func buildVSCGO(tagName, outdir string) {
	tmpDir, err := mkdirTemp("", "buildVSCGO")
	if err != nil {
		fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	for _, target := range targetPlatforms {
		base := "vscgo"
		if target.goos == "windows" {
			base += ".exe"
		}
		outfile := filepath.Join(tmpDir, target.goos+"_"+target.goarch, base)
		if err := goinstall(outfile, target.goos, target.goarch, "github.com/golang/vscode-go/vscgo@"+tagName); err != nil {
			fatalf("failed to build %s/%s: %v", target.goos, target.goarch, err)
		}
	}

	artifact := filepath.Join(outdir, "vscgo.zip")
	if err := zipAll(tmpDir, artifact); err != nil {
		fatalf("failed to zip: %v", err)
	}
}

func zipAll(srcDir, dstFile string) (err error) {
	if flagN {
		tracef("cd %s; zip -r %s *", srcDir, dstFile)
		return nil
	}
	// zip all files in srcDir
	w, err := os.Create(dstFile)
	if err != nil {
		return err
	}
	defer func() {
		cerr := w.Close()
		if err == nil {
			err = cerr
		}
	}()
	zw := zip.NewWriter(w)
	defer func() {
		cerr := zw.Close()
		if err == nil {
			err = cerr
		}
	}()

	return zw.AddFS(os.DirFS(srcDir))
}

// goinstall runs 'go install' with the given GOOS/GOARCH,
// and renames the produced binary as outfile. Since the binary
// is built with 'go install', the binary contains complete
// build info.
// This is a workaround for the limitation of `go install`
// (go.dev/issue/57485) and `go build` (go.dev/issue/50603)
func goinstall(outfile, goOS, goArch string, args ...string) error {
	if flagN {
		// -o is proposed in go.dev/issue/57485, but not yet
		// a supported go install flag. So, it's a lie.
		tracef("go install -o %s %s", outfile, strings.Join(args, " "))
		return nil
	}

	env := goenv("GOHOSTOS", "GOHOSTARCH", "GOMODCACHE")

	hostOS, hostArch := env["GOHOSTOS"], env["GOHOSTARCH"]
	gomodcache := env["GOMODCACHE"]

	outGOPATH, err := mkdirTemp("", "goinstall")
	if err != nil {
		fatalf("failed to create temp for go install: %v", err)
	}
	defer os.RemoveAll(outGOPATH)

	args = append([]string{"install"}, args...)

	cmd := exec.Command("go", args...)
	cmd.Env = append(os.Environ(),
		"GOOS="+goOS,
		"GOARCH="+goArch,
		"GOPATH="+outGOPATH,
		"GOMODCACHE="+gomodcache, // reuse the process's module cache
		"CGO_ENABLED=0",
	)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		return err
	}

	from, err := searchGoinstallOutput(outGOPATH, goOS, goArch, hostOS, hostArch)
	if err != nil {
		return err
	}

	if outfile == "" {
		outfile = filepath.Join(".", filepath.Base(outfile))
	}
	if err := mv(from, outfile); err != nil {
		return err
	}
	return nil
}

// searchGoinstallOutput returns the path to the binary produced by go install command.
func searchGoinstallOutput(outGOPATH, goOS, goArch, hostOS, hostArch string) (string, error) {
	// binary will be written in GOPATH/bin/ or GOPATH/bin/<goos>_<goarch>.
	installDir := filepath.Join(outGOPATH, "bin")
	if goOS != hostOS || goArch != hostArch {
		installDir = filepath.Join(outGOPATH, "bin", goOS+"_"+goArch)
	}
	// since we do not know the target binary name, we assume any executable file found in installDir
	// is the target binary we just built. It's ok since we are working with temporary GOPATH.
	files, err := os.ReadDir(installDir)
	if err != nil {
		return "", err
	}
	for _, f := range files {
		if f.IsDir() {
			continue
		}
		if i, err := f.Info(); err != nil {
			return "", err
		} else if i.Mode().Perm()&0111 == 0 { // not executable, skip.
			continue
		}
		return filepath.Join(installDir, f.Name()), nil
	}
	return "", fmt.Errorf("failed to find the installed binary in %q", installDir)
}

func mv(from, to string) error {
	if err := os.MkdirAll(filepath.Dir(to), 0777); err != nil {
		return err
	}
	if err := os.Rename(from, to); err != nil {
		return err
	}
	return nil
}

func goenv(keys ...string) map[string]string {
	args := append([]string{"env", "-json"}, keys...)
	res, err := exec.Command("go", args...).Output()
	if err != nil {
		fatalf("failed go env: %v", err)
	}
	var ret map[string]string
	if err := json.Unmarshal(res, &ret); err != nil {
		fatalf("failed to unmarshal go env output: %v", err)
	}
	return ret
}

// mkdirTemp wraps os.MkdirTemp, and records the created directory
// to tempDirs. tracef uses tempDirs to replace any references to temporarily
// created directories with short names.
func mkdirTemp(dir, pattern string) (string, error) {
	dir, err := os.MkdirTemp(dir, pattern)
	if err != nil {
		return "", err
	}
	tempDirs = append(tempDirs, replaceRule{from: dir, to: strings.ToUpper(pattern)})
	return dir, nil
}

var tempDirs []replaceRule

type replaceRule struct{ from, to string }

func tracef(format string, args ...any) {
	str := format
	if len(args) > 0 {
		str = fmt.Sprintf(format, args...)
	}
	for _, tmpdir := range tempDirs {
		str = strings.ReplaceAll(str, tmpdir.from, tmpdir.to)
	}
	fmt.Fprintln(os.Stderr, str)
}
