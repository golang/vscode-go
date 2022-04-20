//go:build !windows
// +build !windows

// Tool docs2wiki rewrites links in ./docs/* to wiki link format.
// This program may call the 'diff' tool which may be missing on Windows.
package main

import (
	"bytes"
	"flag"
	"fmt"
	"io/fs"
	"io/ioutil"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
)

var writeFlag = flag.Bool("w", false, "Overwrite new file contents to disk.")

func main() {
	flag.Parse()

	if len(flag.Args()) != 1 {
		errorf("Usage: %v <dir>", os.Args[0])
		os.Exit(1)
	}
	if err := rewriteLinks(flag.Arg(0), *writeFlag); err != nil {
		errorf("failed to rewrite links: %v", err)
		os.Exit(1)
	}
}

func rewriteLinks(dir string, overwrite bool) error {
	return filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		if d.IsDir() {
			return nil
		}
		name := d.Name()
		if filepath.Ext(name) != ".md" {
			return nil
		}

		errorf("processing %v... %v", name, path)

		data, err := ioutil.ReadFile(path)
		if err != nil {
			return fmt.Errorf("failed to read file %v: %w", name, err)
		}
		converted := stripTitleInPage(data)
		converted = markdownLink2WikiLink(converted)
		if overwrite {
			return ioutil.WriteFile(path, converted, 0644)
		}
		tmp, err := writeToTempFile(converted)
		if err != nil {
			return fmt.Errorf("failed to write to temp file for diff: %w", err)
		}
		defer os.Remove(tmp)
		diff(path, tmp)
		return nil
	})
}

func diff(f1, f2 string) {
	cmd := exec.Command("diff", f1, f2)
	cmd.Stderr = os.Stderr
	cmd.Stdout = os.Stdout
	if err := cmd.Run(); err != nil {
		errorf("failed diff %v %v: %v", f1, f2, err)
	}
}

func writeToTempFile(content []byte) (filename string, err error) {
	dst, err := ioutil.TempFile("", "tmp")
	if err != nil {
		return "", fmt.Errorf("failed to write to a temporary file for diff: %v", err)
	}
	defer func() {
		if err == nil {
			err = dst.Close()
		}
	}()

	dst.Write(content)
	return dst.Name(), nil
}

func stripTitleInPage(src []byte) []byte {
	// remove the first line if it starts with "#"
	if len(src) == 0 || src[0] != '#' {
		return src
	}
	index := bytes.Index(src, []byte("\n"))
	if index < 0 {
		return src
	}
	return src[index+1:]
}

// find pattern like '](link.md)'
var markdownLinkRE = regexp.MustCompile(`\]\(\S+(:?\.md|\.md#[^)]*)\)`)

func markdownLink2WikiLink(src []byte) []byte {
	return markdownLinkRE.ReplaceAllFunc(src, func(s []byte) []byte {

		part := string(s[2 : len(s)-1]) // remove leading `](` and ending `)`
		u, err := url.Parse(part)
		if err != nil {
			return s
		}
		if u.Scheme != "" {
			return s
		}
		u.Path = strings.TrimSuffix(u.Path, ".md")
		b := &bytes.Buffer{}
		fmt.Fprintf(b, "](%s)", u.String())
		return b.Bytes()
	})
}

func errorf(format string, a ...interface{}) {
	fmt.Fprintf(os.Stderr, format+"\n", a...)
}
