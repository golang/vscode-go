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
	"bytes"
	"fmt"
	"os"
	"os/exec"
	"regexp"
	"strings"
)

func main() {
	if len(os.Args) != 2 {
		fatalf("usage: %s [package|publish]", os.Args[0])
	}
	cmd := os.Args[1]

	checkWD()
	requireTools("jq", "npx", "gh", "git")
	requireEnvVars("TAG_NAME")

	tagName, version, isRC := releaseVersionInfo()
	vsix := fmt.Sprintf("go-%s.vsix", version)

	switch cmd {
	case "package":
		buildPackage(version, vsix)
	case "publish":
		requireEnvVars("VSCE_PAT", "GITHUB_TOKEN")
		publish(tagName, vsix, isRC)
	default:
		fatalf("usage: %s [package|publish]", os.Args[0])
	}
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

	cmd := exec.Command("jq", "-r", ".version", "package.json")
	cmd.Stderr = os.Stderr
	versionInPackageJSON, err := cmd.Output()
	if err != nil {
		fatalf("failed to read package.json version")
	}
	if got := string(bytes.TrimSpace(versionInPackageJSON)); got != mmp {
		fatalf("package.json version %q does not match TAG_NAME %q", got, tagName)
	}

	return tagName, mmp + label, isPrerelease
}

// buildPackage builds the extension of the given version, using npx vsce package.
func buildPackage(version, output string) {
	cmd := exec.Command("npx", "vsce", "package",
		"-o", output,
		"--baseContentUrl", "https://github.com/golang/vscode-go",
		"--baseImagesUrl", "https://github.com/golang/vscode-go",
		"--no-update-package-json",
		"--no-git-tag-version",
		version)

	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fatalf("failed to build package")
	}

	cmd = exec.Command("git", "add", output)
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		fatalf("failed to build package")
	}
}

// publish publishes the extension to the VS Code Marketplace and GitHub, using npx vsce and gh release create.
func publish(tagName, packageFile string, isPrerelease bool) {
	// check if the package file exists.
	if _, err := os.Stat(packageFile); os.IsNotExist(err) {
		fatalf("package file %q does not exist. Did you run 'go run build/release.go package'?", packageFile)
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
	if err := cmd.Run(); err != nil {
		fatalf("failed to publish release")
	}

	if isPrerelease {
		return // TODO: release with the -pre-release flag if isPrerelease is set.
	}

	/* TODO(hyangah): uncomment this to finalize the release workflow migration.
	npxVsceArgs := []string{"vsce", "publish", "-i", packageFile}

	cmd2 := exec.Command("npx", npxVsceArgs...)
	cmd2.Stderr = os.Stderr
	if err := cmd2.Run(); err != nil {
		fatalf("failed to publish release")
	}
	*/
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
