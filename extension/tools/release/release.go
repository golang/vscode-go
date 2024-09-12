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
//	go run build/release.go package
//	// publish the extension.
//	go run build/release.go publish
package main

import (
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var flagN = flag.Bool("n", false, "print the underlying commands but do not run them")

func main() {
	flag.Parse()
	if flag.NArg() != 1 {
		usage()
		os.Exit(1)
	}
	cmd := flag.Arg(0)

	checkWD()
	requireEnvVars("TAG_NAME")

	tagName, version, isRC := releaseVersionInfo()
	vsix := fmt.Sprintf("go-%s.vsix", version)

	switch cmd {
	case "package":
		requireTools("npx")
		buildPackage(version, tagName, vsix)
	case "publish":
		requireTools("npx", "gh", "git")
		requireEnvVars("VSCE_PAT", "GITHUB_TOKEN")
		publish(tagName, vsix, isRC)
	default:
		usage()
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintf(os.Stderr, "Usage: %s <flags> [package|publish]\n\n", os.Args[0])
	fmt.Fprintln(os.Stderr, "Flags:")
	flag.PrintDefaults()
}

func fatalf(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format, args...)
	fmt.Fprintf(os.Stderr, "\n")
	os.Exit(1)
}

func requireTools(tools ...string) {
	for _, tool := range tools {
		if _, err := exec.LookPath(tool); err != nil {
			fatalf("required tool %q not found", tool)
		}
	}
}

func requireEnvVars(vars ...string) {
	for _, v := range vars {
		if os.Getenv(v) == "" {
			fatalf("required environment variable %q not set", v)
		}
	}
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
func releaseVersionInfo() (tagName, version string, isPrerelease bool) {
	tagName = os.Getenv("TAG_NAME")
	if tagName == "" {
		fatalf("TAG_NAME environment variable is not set")
	}
	// versionTag should be of the form vMajor.Minor.Patch[-rc.N].
	// e.g. v1.1.0-rc.1, v1.1.0
	// The MajorMinorPatch part should match the version in package.json.
	// The optional `-rc.N` part is captured as the `Label` group
	// and the validity is checked below.
	versionTagRE := regexp.MustCompile(`^v(?P<MajorMinorPatch>\d+\.\d+\.\d+)(?P<Label>\S*)$`)
	m := versionTagRE.FindStringSubmatch(tagName)
	if m == nil {
		fatalf("TAG_NAME environment variable %q is not a valid version", tagName)
	}
	mmp := m[versionTagRE.SubexpIndex("MajorMinorPatch")]
	label := m[versionTagRE.SubexpIndex("Label")]
	if label != "" {
		if !strings.HasPrefix(label, "-rc.") {
			fatalf("TAG_NAME environment variable %q is not a valid release candidate version", tagName)
		}
		isPrerelease = true
	}
	return tagName, mmp + label, isPrerelease
}

func commandRun(cmd *exec.Cmd) error {
	if *flagN {
		if cmd.Dir != "" {
			fmt.Fprintf(os.Stderr, "cd %v\n", cmd.Dir)
		}
		fmt.Fprintf(os.Stderr, "%v\n", strings.Join(cmd.Args, " "))
		return nil
	}
	return cmd.Run()
}

func copy(dst, src string) error {
	if *flagN {
		fmt.Fprintf(os.Stderr, "cp %s %s\n", src, dst)
		return nil
	}
	data, err := os.ReadFile(src)
	if err != nil {
		return err
	}
	return os.WriteFile(dst, data, 0644)
}

// buildPackage builds the extension of the given version, using npx vsce package.
func buildPackage(version, tagName, output string) {
	if err := copy("README.md", filepath.Join("..", "README.md")); err != nil {
		fatalf("failed to copy README.md: %v", err)
	}
	// build the package.
	cmd := exec.Command("npx", "vsce", "package",
		"-o", output,
		"--baseContentUrl", "https://github.com/golang/vscode-go/raw/"+tagName,
		"--baseImagesUrl", "https://github.com/golang/vscode-go/raw/"+tagName,
		"--no-update-package-json",
		"--no-git-tag-version",
		version)

	cmd.Stderr = os.Stderr
	if err := commandRun(cmd); err != nil {
		fatalf("failed to build package: %v", err)
	}
}

// publish publishes the extension to the VS Code Marketplace and GitHub, using npx vsce and gh release create.
func publish(tagName, packageFile string, isPrerelease bool) {
	// check if the package file exists.
	if *flagN {
		fmt.Fprintf(os.Stderr, "stat %s\n", packageFile)
	} else {
		if _, err := os.Stat(packageFile); os.IsNotExist(err) {
			fatalf("package file %q does not exist. Did you run 'go run build/release.go package'?", packageFile)
		}
	}

	// publish release to GitHub. This will create a draft release - manually publish it after reviewing the draft.
	// TODO(hyangah): populate the changelog (the first section of CHANGELOG.md) and pass it using --notes-file instead of --generate-notes.
	ghArgs := []string{"release", "create", "--generate-notes", "--target", commitSHA(), "--title", "Release " + tagName, "--draft"}
	fmt.Printf("%s\n", strings.Join(ghArgs, " "))
	if isPrerelease {
		ghArgs = append(ghArgs, "--prerelease")
	}
	ghArgs = append(ghArgs, "-R", "github.com/golang/vscode-go")
	ghArgs = append(ghArgs, tagName, packageFile)
	cmd := exec.Command("gh", ghArgs...)
	cmd.Stderr = os.Stderr
	if err := commandRun(cmd); err != nil {
		fatalf("failed to publish release: %v", err)
	}

	if isPrerelease {
		return // TODO: release with the -pre-release flag if isPrerelease is set.
	}

	npxVsceArgs := []string{"vsce", "publish", "-i", packageFile}
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
