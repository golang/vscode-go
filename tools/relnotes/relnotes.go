// Copyright 2021 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// The relnotes command summarizes the Go changes in Gerrit marked with
// RELNOTE annotations for the release notes.
package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/stamblerre/work-stats/generic"
	"github.com/stamblerre/work-stats/golang"
	"golang.org/x/build/maintner"
	"golang.org/x/build/maintner/godata"
)

var (
	milestone  = flag.String("milestone", "", "milestone associated with the release")
	filterDirs = flag.String("dirs", "", "comma-separated list of directories that should be touched for a CL to be considered relevant")
	sinceCL    = flag.Int("cl", -1, "the gerrit change number of the first CL to include in the output. Only changes submitted more recently than 'cl' will be included.")
	project    = flag.String("project", "vscode-go", "name of the golang project")
	mdMode     = flag.Bool("md", false, "write MD output")
	exclFile   = flag.String("exclude-from", "", "optional path to changelog MD file. If specified, any 'CL NNNN' occurence in the content will cause that CL to be excluded from this tool's output.")
)

func main() {
	flag.Parse()

	var existingMD []byte
	if *exclFile != "" {
		var err error
		existingMD, err = ioutil.ReadFile(*exclFile)
		if err != nil {
			log.Fatal(err)
		}
	}

	corpus, err := godata.Get(context.Background())
	if err != nil {
		log.Fatal(err)
	}

	var dirs []string
	for _, dir := range strings.FieldsFunc(*filterDirs, func(r rune) bool {
		return unicode.IsSpace(r) || r == ','
	}) {
		dirs = append(dirs, filepath.ToSlash(dir))
	}

	ger := corpus.Gerrit()

	// Find the cutoff time for changes to include.
	start := time.Date(2020, time.August, 1, 00, 00, 00, 0, time.UTC)
	ger.ForeachProjectUnsorted(func(gp *maintner.GerritProject) error {
		if gp.Server() != "go.googlesource.com" || gp.Project() != *project {
			return nil
		}
		gp.ForeachCLUnsorted(func(cl *maintner.GerritCL) error {
			if cl.Status != "merged" {
				return nil
			}
			if *sinceCL >= 0 {
				if int(cl.Number) == *sinceCL {
					start = cl.Commit.CommitTime
				}
			} else if cl.Branch() == "release" && cl.Commit.CommitTime.After(start) {
				// Try to figure out when the last release was
				fmt.Println(cl.Commit.CommitTime)
				start = cl.Commit.CommitTime
			}
			return nil
		})
		return nil
	})

	var changes []*generic.Changelist
	authors := map[*maintner.GitPerson]bool{}
	ger.ForeachProjectUnsorted(func(gp *maintner.GerritProject) error {
		if gp.Server() != "go.googlesource.com" || gp.Project() != *project {
			return nil
		}
		gp.ForeachCLUnsorted(func(cl *maintner.GerritCL) error {
			// Only include 'master'
			if cl.Branch() != "master" {
				return nil
			}
			if cl.Status != "merged" {
				return nil
			}
			if cl.Commit.CommitTime.Before(start) {
				// Was in a previous release; not for this one.
				return nil
			}

			if bytes.Contains(existingMD, []byte(fmt.Sprintf("CL %d ", cl.Number))) {
				return nil
			}

			// Check that at least one file is in a relevant directory before
			// adding the CL.
			if len(dirs) > 0 {
				var found bool
				for _, file := range cl.Commit.Files {
					for _, dir := range dirs {
						if strings.Contains(file.File, dir) {
							found = true
							break
						}
					}
				}
				if !found {
					return nil
				}
			}
			changes = append(changes, golang.GerritToGenericCL(cl))
			authors[cl.Owner()] = true
			return nil
		})
		return nil
	})

	sort.Slice(changes, func(i, j int) bool {
		return changes[i].Number < changes[j].Number
	})

	if *mdMode {
		fmt.Printf("## TODO: version - ")
		now := time.Now()
		fmt.Printf("%s\n\n", now.Format("2 Jan, 2006"))
		fmt.Printf("### Changes\n\n")
		mdPrintChanges(changes, true)

		fmt.Printf("### Issues\n\n")
		mdPrintIssues(changes, *milestone)

		fmt.Printf("\n### Thanks\n\n")
		mdPrintContributors(authors)
	} else {
		for _, change := range changes {
			fmt.Printf("  %s\n", change.Subject)
		}
	}
}

func mdPrintChanges(changes []*generic.Changelist, byCategory bool) {
	printChange := func(change *generic.Changelist) {
		fmt.Printf("- ")
		content := change.Subject
		note := releaseNote(change)
		if note != "" && note != "yes" && note != "y" {
			// The release note contains content.
			content = note
		}

		fmt.Printf("%s", content)
		if len(change.AssociatedIssues) > 0 {
			fmt.Printf(" (")
			for i, issue := range change.AssociatedIssues {
				if i == 0 {
					fmt.Printf("[Issue %d](%s)", issue.Number, issue.Link)
				} else {
					fmt.Printf(", [%d](%s)", issue.Number, issue.Link)
				}
			}
			fmt.Printf(")")
		}
		fmt.Printf(" <!-- CL %d -->\n", change.Number)
	}
	// Group CLs by category or by number order.
	if byCategory {
		pkgMap := map[string][]*generic.Changelist{}
		for _, change := range changes {
			pkgMap[change.Category()] = append(pkgMap[change.Category()], change)
		}
		for _, changes := range pkgMap {
			for _, change := range changes {
				printChange(change)
			}
		}
	} else {
		for _, change := range changes {
			printChange(change)
		}
	}
}

func mdPrintIssues(changes []*generic.Changelist, milestone string) {
	var issues []*generic.Issue
	for _, change := range changes {
		issues = append(issues, change.AssociatedIssues...)
	}
	sort.Slice(issues, func(i, j int) bool {
		return issues[i].Link < issues[j].Link
	})
	for _, issue := range issues {
		if !issue.Closed() {
			continue
		}
		fmt.Printf("%s: %s\n", issue.Link, issue.Milestone)
	}
}

// clPackage returns the package name from the CL's commit message,
// or "??" if it's formatted unconventionally.
func clPackage(cl *maintner.GerritCL) string {
	subj := cl.Subject()
	if i := strings.Index(subj, ":"); i != -1 {
		return subj[:i]
	}
	return "??"
}

var relNoteRx = regexp.MustCompile(`RELNOTES?=(.+)`)

func parseRelNote(s string) string {
	if m := relNoteRx.FindStringSubmatch(s); m != nil {
		return m[1]
	}
	return ""
}

func releaseNote(cl *generic.Changelist) string {
	if strings.Contains(cl.Message, "RELNOTE") {
		return parseRelNote(cl.Message)
	}
	for _, comment := range cl.Comments {
		if strings.Contains(comment, "RELNOTE") {
			return parseRelNote(comment)
		}
	}
	return ""
}

func mdPrintContributors(authors map[*maintner.GitPerson]bool) {
	var names []string
	for author := range authors {
		// It would be great to look up the GitHub username by using:
		// https://pkg.go.dev/golang.org/x/build/internal/gophers#GetPerson.
		names = append(names, author.Name())
	}
	sort.Strings(names)
	if len(names) > 1 {
		names[len(names)-1] = "and " + names[len(names)-1]
	}

	fmt.Printf("Thank you for your contribution, %s!\n", strings.Join(names, ", "))
}
