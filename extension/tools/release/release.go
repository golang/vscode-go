// Copyright 2023 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

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
//	// package the extension (based on TAG_NAME).
//	go run ./tools/release package
//	// publish the extension.
//	go run ./tools/release publish
package main

import (
	"bytes"
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

	allCommands = []*command{cmdPackage, cmdPublish}
)

func init() {
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

// runPackage implements the "package" subcommand.
func runPackage(cmd *command, args []string) {
	cmd.flags.Parse(args) // will exit on error

	checkWD()

	requireTools("jq", "npx", "gh", "git")

	tagName := requireEnv("TAG_NAME")

	version, isPrerelease := releaseVersionInfo(tagName)
	checkPackageJSON(tagName, isPrerelease)
	outDir := prepareOutputDir(cmd.lookupFlag("out").String())
	vsix := filepath.Join(outDir, fmt.Sprintf("go-%s.vsix", version))
	buildPackage(version, tagName, isPrerelease, vsix)
}

// runPublish implements the "publish" subcommand.
func runPublish(cmd *command, args []string) {
	cmd.flags.Parse(args) // will exit on error

	checkWD()

	requireTools("jq", "npx", "gh", "git")

	requireEnv("VSCE_PAT")
	requireEnv("GITHUB_TOKEN")
	tagName := requireEnv("TAG_NAME")

	version, isPrerelease := releaseVersionInfo(tagName)
	checkPackageJSON(tagName, isPrerelease)
	inDir := prepareInputDir(cmd.lookupFlag("in").String())
	vsix := filepath.Join(inDir, fmt.Sprintf("go-%s.vsix", version))
	publish(tagName, vsix, isPrerelease)
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format, args...)
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
		fatalf("required environment variable %q not set", v)
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

// checkPackageJSON checks if package.json has the expected version value.
// If prerelease, the major/minor version should match.
// Otherwise, major/minor/patch version should match.
func checkPackageJSON(tagName string, isPrerelease bool) {
	if !strings.HasPrefix(tagName, "v") {
		fatalf("unexpected tagName in checkPackageJSON: %q", tagName)
	}

	if flagN {
		tracef("jq -r .version package.json")
		return
	}
	cmd := exec.Command("jq", "-r", ".version", "package.json")
	cmd.Stderr = os.Stderr
	var buf bytes.Buffer
	cmd.Stdout = &buf
	if err := commandRun(cmd); err != nil {
		fatalf("failed to read package.json version")
	}

	versionInPackageJSON := string(bytes.TrimSpace(buf.Bytes()))
	if !isPrerelease {
		if got, want := versionInPackageJSON, tagName[1:]; got != want {
			fatalf("package.json version %q does not match wanted string %q", got, want)
		}
		return
	}
	// Check only major.minor for prerelease.
	major, minor, _, _ := parseVersionTagName(tagName)
	if want := fmt.Sprintf("%d.%d.", major, minor); strings.HasPrefix(versionInPackageJSON, want) {
		fatalf("package.json version %q does not match wanted string %q", versionInPackageJSON, want)
	}
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

// buildPackage builds the extension of the given version, using npx vsce package.
func buildPackage(version, tagName string, isPrerelease bool, output string) {
	if err := copy("README.md", filepath.Join("..", "README.md")); err != nil {
		fatalf("failed to copy README.md: %v", err)
	}
	// build the package.
	args := []string{"vsce", "package",
		"-o", output,
		"--baseContentUrl", "https://github.com/golang/vscode-go/raw/" + tagName,
		"--baseImagesUrl", "https://github.com/golang/vscode-go/raw/" + tagName,
		"--no-update-package-json",
		"--no-git-tag-version",
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

// publish publishes the extension to the VS Code Marketplace and GitHub, using npx vsce and gh release create.
func publish(tagName, packageFile string, isPrerelease bool) {
	// check if the package file exists.
	if flagN {
		tracef("stat %s", packageFile)
	} else {
		if _, err := os.Stat(packageFile); os.IsNotExist(err) {
			fatalf("package file %q does not exist. Did you run 'go run build/release.go package'?", packageFile)
		}
	}
	isRC := strings.Contains(tagName, "-rc.")

	// publish release to GitHub. This will create a draft release - manually publish it after reviewing the draft.
	// TODO(hyangah): populate the changelog (the first section of CHANGELOG.md) and pass it using --notes-file instead of --generate-notes.
	ghArgs := []string{"release", "create", "--generate-notes", "--target", commitSHA(), "--title", "Release " + tagName, "--draft"}
	fmt.Printf("%s\n", strings.Join(ghArgs, " "))
	if isRC || isPrerelease {
		ghArgs = append(ghArgs, "--prerelease")
	}
	ghArgs = append(ghArgs, "-R", "github.com/golang/vscode-go")
	ghArgs = append(ghArgs, tagName, packageFile)
	cmd := exec.Command("gh", ghArgs...)
	cmd.Stderr = os.Stderr
	if err := commandRun(cmd); err != nil {
		fatalf("failed to publish release: %v", err)
	}

	if isRC { // Do not publish RC versions to the marketplace.
		return
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

func tracef(format string, args ...any) {
	str := fmt.Sprintf(format, args...)
	fmt.Fprintln(os.Stderr, str)
}
