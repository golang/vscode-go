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

// change is a change that has occurred since the last release.
type change struct {
	CL     *maintner.GerritCL
	Note   string // the part after RELNOTE=
	Issues []*issue
	pkg    string
}

func (c change) TextLine() string {
	subj := c.CL.Subject()
	subj = c.Note + ": " + subj
	return fmt.Sprintf("https://golang.org/cl/%d: %s", c.CL.Number, subj)
}

type issue struct {
	*maintner.GitHubIssue
	repo  string
	owner string
}

func (i *issue) link() string {
	if i.owner == "golang" && i.repo == "go" {
		return fmt.Sprintf("https://golang.org/issue/%v", i.Number)
	}
	return fmt.Sprintf("https://github.com/%s/%s/issues/%v", i.owner, i.repo, i.Number)
}

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

	var changes []*change
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

			// try to determine type from issue labels
			var issues []*issue
			for _, ref := range cl.GitHubIssueRefs {
				i := ref.Repo.Issue(ref.Number)
				// Don't include pull requests.
				if i.PullRequest {
					continue
				}
				issues = append(issues, &issue{
					repo:        ref.Repo.ID().Repo,
					owner:       ref.Repo.ID().Owner,
					GitHubIssue: i,
				})
			}

			changes = append(changes, &change{
				Note:   clRelNote(cl),
				CL:     cl,
				Issues: issues,
				pkg:    clPackage(cl),
			})

			authors[cl.Owner()] = true
			return nil
		})
		return nil
	})

	sort.Slice(changes, func(i, j int) bool {
		return changes[i].CL.Number < changes[j].CL.Number
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
			fmt.Printf("  %s\n", change.TextLine())
		}
	}
}

func mdPrintChanges(changes []*change, byPackage bool) {
	printChange := func(change *change) {
		fmt.Printf("- ")
		content := change.CL.Subject()
		if change.Note != "" && change.Note != "yes" && change.Note != "y" {
			// Note contains content
			content = change.Note
		}

		fmt.Printf("%s", content)
		if len(change.CL.GitHubIssueRefs) > 0 {
			fmt.Printf(" (")
			for i, ref := range change.CL.GitHubIssueRefs {

				if i == 0 {
					fmt.Printf("[Issue %d](https://github.com/%s/issues/%d)", ref.Number, ref.Repo.ID().String(), ref.Number)
				} else {
					fmt.Printf(", [%d](https://github.com/%s/issues/%d)", ref.Number, ref.Repo.ID().String(), ref.Number)
				}
			}
			fmt.Printf(")")
		}
		fmt.Printf(" <!-- CL %d -->\n", change.CL.Number)
	}
	// Group CLs by package or by number order.
	if byPackage {
		pkgMap := map[string][]*change{}
		for _, change := range changes {
			pkgMap[change.pkg] = append(pkgMap[change.pkg], change)
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

func mdPrintIssues(changes []*change, milestone string) {
	var issues []*issue
	for _, change := range changes {
		issues = append(issues, change.Issues...)
	}
	sort.Slice(issues, func(i, j int) bool {
		return issues[i].Number < issues[j].Number
	})
	for _, issue := range issues {
		if !issue.Closed {
			continue
		}
		fmt.Printf("%s: %s\n", issue.link(), issue.Milestone.Title)
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

func clRelNote(cl *maintner.GerritCL) string {
	msg := cl.Commit.Msg
	if strings.Contains(msg, "RELNOTE") {
		return parseRelNote(msg)
	}
	for _, comment := range cl.Messages {
		if strings.Contains(comment.Message, "RELNOTE") {
			return parseRelNote(comment.Message)
		}
	}
	return ""
}

func mdPrintContributors(authors map[*maintner.GitPerson]bool) {
	var names []string
	for author := range authors {
		names = append(names, author.Name())
	}
	sort.Strings(names)
	if len(names) > 1 {
		names[len(names)-1] = "and " + names[len(names)-1]
	}

	fmt.Printf("Thank you for your contribution, %s!\n", strings.Join(names, ", "))
}
