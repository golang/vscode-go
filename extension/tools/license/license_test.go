// Copyright 2024 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package license

import (
	"bytes"
	"flag"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/go-cmp/cmp"
)

var (
	update = flag.Bool("update", false, "If true, overwrite the LICENSE file with the new one.")
)

// TestLicense checks the extension's LICENSE file is up to date.
func TestLicense(t *testing.T) {
	if testing.Short() {
		t.Skip("TestLicense is skipped in short test mode")
	}
	extensionModuleRoot, err := moduleRoot("github.com/golang/vscode-go/extension")
	if err != nil {
		t.Fatal(err)
	}
	vscgoModuleRoot, err := moduleRoot("github.com/golang/vscode-go")
	if err != nil {
		t.Fatal(err)
	}

	// Check package.json is present in the extensionModuleRoot.
	if _, err := os.Stat(filepath.Join(extensionModuleRoot, "package.json")); err != nil {
		t.Fatalf("failed to find package.json in the github.com/golang/vscode-go/extension module root: %v", err)
	}

	// Checks below require to run tools (jsgl and yarn) using `npx`.
	npx, err := exec.LookPath("npx")
	if err != nil {
		if *update {
			t.Fatalf("this test requires npx but npx is missing: %v", err)
		}
		t.Skipf("license check requires npx: %v", err)
	}

	// Check if licenses of dependencies pass js-green-license check.
	jsglCmd := exec.Command(npx, "--", "jsgl", "--local", ".")
	jsglCmd.Dir = extensionModuleRoot

	if output, err := jsglCmd.CombinedOutput(); err != nil {
		t.Errorf("js-green-license check (%s) failed: %v\n%s", jsglCmd, err, output)
	}

	// Check if new and old LICENSE files agree.
	newLICENSE, err := generateLicense(vscgoModuleRoot, extensionModuleRoot, npx)
	if err != nil {
		t.Fatalf("generating new LICENSE file failed: %v\nDid you run `npm ci` to install all necessary tools?", err)
	}
	if *update {
		os.WriteFile(filepath.Join(extensionModuleRoot, "LICENSE"), newLICENSE, 0644)
		return
	}
	oldLICENSE, err := os.ReadFile(filepath.Join(extensionModuleRoot, "LICENSE"))
	if err != nil {
		t.Fatalf("reading old LICENSE file failed: %v", err)
	}
	if diff := cmp.Diff(oldLICENSE, newLICENSE); diff != "" {
		t.Fatalf("extension/LICENSE is outdated: run 'go generate' from extension/tools/license directory\ndiff: %s", diff)
	}
}

func generateLicense(vscgoModuleRoot, extensionModuleRoot, npx string) (_ []byte, err error) {
	// Extension's LICENSE file (extension/LICENSE) should contain
	//  - the vscode-go extension's own license (as in github.com/golang/vscode-go/LICENSE), and
	//  - the compiled license notices from its dependencies (yarn licenses generate-disclaimer --prod)

	vscgoLICENSE, err := os.ReadFile(filepath.Join(vscgoModuleRoot, "LICENSE"))
	if err != nil {
		return nil, fmt.Errorf("reading vscode-go LICENSE file failed: %v", err)
	}

	// Remove yarn.lock if any - we use npm, so if there is yarn.lock that's likely
	// a left-over file from license checking.
	if err := os.Remove(filepath.Join(extensionModuleRoot, "yarn.lock")); err != nil && !os.IsNotExist(err) {
		return nil, fmt.Errorf("failed to remove yarn.lock: %v", err)
	}
	// Convert npm package-lock.json to yarn.lock.
	lockCmd := exec.Command(npx, "--", "yarn", "import")
	lockCmd.Dir = extensionModuleRoot
	if out, err := lockCmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("%s import failed: %v\n%s", lockCmd, err, out)
	}
	// Clean up yarn.lock.
	defer func() {
		if err2 := os.Remove(filepath.Join(extensionModuleRoot, "yarn.lock")); err2 != nil && err == nil {
			err = fmt.Errorf("failed to remove yarn.lock: %v", err2)
		}
	}()
	yarnCmd := exec.Command(npx, "--", "yarn", "licenses", "generate-disclaimer", "--prod")
	yarnCmd.Dir = extensionModuleRoot
	stderr := new(bytes.Buffer)
	yarnCmd.Stderr = stderr
	thirdPartyLicenses, err := yarnCmd.Output()
	if err != nil {
		return nil, fmt.Errorf("%s failed: %v\n%s", yarnCmd, err, stderr)
	}

	newLICENSE := new(bytes.Buffer)
	fmt.Fprintf(newLICENSE, "%s\n\n%s", vscgoLICENSE, thirdPartyLicenses)
	return newLICENSE.Bytes(), nil
}

func moduleRoot(module string) (string, error) {
	out, err := exec.Command("go", "list", "-f", "{{.Dir}}", module).Output()
	if err != nil {
		return "", fmt.Errorf("failed to look up module root directory: %v", err)
	}
	return strings.TrimSpace(string(out)), nil
}
