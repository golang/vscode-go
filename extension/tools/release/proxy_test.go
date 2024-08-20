// Copyright 2024 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Copied from golang.org/x/telemetry/internal/proxy
package main

import (
	"archive/zip"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"golang.org/x/mod/module"
)

// WriteProxy creates a new proxy file tree using the provided content,
// and returns its URL.
func WriteProxy(tmpdir string, files map[string][]byte) (string, error) {
	type moduleVersion struct {
		modulePath, version string
	}
	// Transform into the format expected by the proxydir package.
	filesByModule := make(map[moduleVersion]map[string][]byte)
	for name, data := range files {
		modulePath, version, suffix := splitModuleVersionPath(name)
		mv := moduleVersion{modulePath, version}
		if _, ok := filesByModule[mv]; !ok {
			filesByModule[mv] = make(map[string][]byte)
		}
		filesByModule[mv][suffix] = data
	}
	for mv, files := range filesByModule {
		if err := writeModuleVersion(tmpdir, mv.modulePath, mv.version, files); err != nil {
			return "", fmt.Errorf("error writing %s@%s: %v", mv.modulePath, mv.version, err)
		}
	}
	return toURL(tmpdir), nil
}

// splitModuleVersionPath extracts module information from files stored in the
// directory structure modulePath@version/suffix.
// For example:
//
//	splitModuleVersionPath("mod.com@v1.2.3/package") = ("mod.com", "v1.2.3", "package")
func splitModuleVersionPath(path string) (modulePath, version, suffix string) {
	parts := strings.Split(path, "/")
	var modulePathParts []string
	for i, p := range parts {
		if strings.Contains(p, "@") {
			mv := strings.SplitN(p, "@", 2)
			modulePathParts = append(modulePathParts, mv[0])
			return strings.Join(modulePathParts, "/"), mv[1], strings.Join(parts[i+1:], "/")
		}
		modulePathParts = append(modulePathParts, p)
	}
	// Default behavior: this is just a module path.
	return path, "", ""
}

// writeModuleVersion creates a directory in the proxy dir for a module.
func writeModuleVersion(rootDir, mod, ver string, files map[string][]byte) (rerr error) {
	dir := filepath.Join(rootDir, mod, "@v")
	if err := os.MkdirAll(dir, 0755); err != nil {
		return err
	}
	// The go command checks for versions by looking at the "list" file.  Since
	// we are supporting multiple versions, create this file if it does not exist
	// or append the version number to the preexisting file.
	f, err := os.OpenFile(filepath.Join(dir, "list"), os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer checkClose("list file", f, &rerr)
	if _, err := f.WriteString(ver + "\n"); err != nil {
		return err
	}
	// Serve the go.mod file on the <version>.mod url, if it exists. Otherwise,
	// serve a stub.
	modContents, ok := files["go.mod"]
	if !ok {
		modContents = []byte("module " + mod)
	}
	if err := os.WriteFile(filepath.Join(dir, ver+".mod"), modContents, 0644); err != nil {
		return err
	}
	// info file, just the bare bones.
	infoContents := []byte(fmt.Sprintf(`{"Version": "%v", "Time":"2017-12-14T13:08:43Z"}`, ver))
	if err := os.WriteFile(filepath.Join(dir, ver+".info"), infoContents, 0644); err != nil {
		return err
	}
	// zip of all the source files.
	f, err = os.OpenFile(filepath.Join(dir, ver+".zip"), os.O_CREATE|os.O_WRONLY, 0644)
	if err != nil {
		return err
	}
	defer checkClose("zip file", f, &rerr)
	z := zip.NewWriter(f)
	defer checkClose("zip writer", z, &rerr)
	for name, contents := range files {
		zf, err := z.Create(mod + "@" + ver + "/" + name)
		if err != nil {
			return err
		}
		if _, err := zf.Write(contents); err != nil {
			return err
		}
	}
	// Populate the /module/path/@latest that is used by @latest query.
	if module.IsPseudoVersion(ver) {
		latestFile := filepath.Join(rootDir, mod, "@latest")
		if err := os.WriteFile(latestFile, infoContents, 0644); err != nil {
			return err
		}
	}
	return nil
}
func checkClose(name string, closer io.Closer, err *error) {
	if cerr := closer.Close(); cerr != nil && *err == nil {
		*err = fmt.Errorf("closing %s: %v", name, cerr)
	}
}

// toURL returns the file uri for a proxy directory.
func toURL(dir string) string {
	// file URLs on Windows must start with file:///. See golang.org/issue/6027.
	path := filepath.ToSlash(dir)
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	return "file://" + path
}
