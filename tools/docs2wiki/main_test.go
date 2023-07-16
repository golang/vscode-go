//go:build !windows
// +build !windows

// Tool docs2wiki rewrites links in ./docs/* to wiki link format.
package main

import (
	"io/ioutil"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestRewriteLinks(t *testing.T) {
	for _, tt := range []struct{ filename, in, want string }{
		{filename: "doc.md", in: markdownStyle, want: wikiStyle},
		{filename: "hasTitle.md", in: "# Redundant Title \n" + markdownStyle, want: wikiStyle},
		{filename: "sub/doc.md", in: markdownStyle, want: wikiStyle},
		{filename: "doc.txt", in: markdownStyle, want: markdownStyle},
	} {
		t.Run(tt.filename, func(t *testing.T) {
			// prepareTestData writes tt.in to tt.filename.
			dir := prepareTestData(t, tt.filename, tt.in)
			defer os.RemoveAll(dir)

			// Use overwrite=true so `rewriteLinks` overwrite the original file
			// which we will read back for comparison against tt.want.
			// With overwrite=false, rewriteLinks just prints out the diff
			// which will be difficult to test.
			genFooter := func(string) []byte { return nil }
			err := rewriteLinks(dir, genFooter, true)
			if err != nil {
				t.Fatal(err)
			}
			// rewriteLinks overwrites the original file,
			// so reread the content for comparison.
			got, err := ioutil.ReadFile(filepath.Join(dir, tt.filename))
			if err != nil {
				t.Fatal(err)
			}
			if diff := cmp.Diff(tt.want, string(got)); diff != "" {
				t.Errorf("(-want +got): %v", diff)
			}
		})
	}
}

// prepareTestData writes a file in a temp directory and returns the temp
// directory path.
func prepareTestData(t *testing.T, file, content string) (dir string) {
	dir, err := ioutil.TempDir("", "docs2wiki_test")
	if err != nil {
		t.Fatal(err)
	}

	fname := filepath.Join(dir, filepath.FromSlash(file))
	os.MkdirAll(filepath.Dir(fname), 0755) // create intermediate dirs
	if err := ioutil.WriteFile(fname, []byte(content), 0644); err != nil {
		os.RemoveAll(dir)
		t.Fatal(err)
	}
	return dir
}

var markdownStyle = `
[This changes](doc.md)
 [This changes too](./doc.md)
   [This also changes](foo/doc.md)
[Fragment works](foo.md#this-is-a-title)
[A](doc.md)  [B](doc.md)  [C](doc.txt)

[This doesn't change](https://go.dev/foo.md)
[Untouchable.md](foo)`

var wikiStyle = `
[This changes](doc)
 [This changes too](./doc)
   [This also changes](foo/doc)
[Fragment works](foo#this-is-a-title)
[A](doc)  [B](doc)  [C](doc.txt)

[This doesn't change](https://go.dev/foo.md)
[Untouchable.md](foo)`

func TestGenFooter(t *testing.T) {
	const editURLPrefix = "https://source.com/edit/docs/"

	for _, tt := range []struct{ filename, wantURL string }{
		{filename: "doc.md", wantURL: editURLPrefix + "doc.md"},
		{filename: "sub/doc.md", wantURL: editURLPrefix + "sub/doc.md"},
	} {
		dir := prepareTestData(t, tt.filename, "")
		defer os.RemoveAll(dir)

		genFooter := footerGenerator(editURLPrefix)
		err := rewriteLinks(dir, genFooter, true)
		if err != nil {
			t.Fatal(err)
		}
		// rewriteLinks overwrites the original file,
		// so reread the content for comparison.
		got, err := ioutil.ReadFile(filepath.Join(dir, tt.filename))
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(got), tt.wantURL) {
			t.Errorf("missing %s, got:\n%s", tt.wantURL, got)
		}
	}
}
