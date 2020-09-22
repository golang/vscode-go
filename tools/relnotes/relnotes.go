// Copyright 2021 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package main

import (
	"bytes"
	"context"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"regexp"
	"sort"
	"strings"
	"time"

	"golang.org/x/build/maintner"
	"golang.org/x/build/maintner/godata"
)

var (
	sinceCl  = flag.Int("cl", -1, "the gerrit change number of the first CL to include in the output. Only changes submitted more recently than 'cl' will be included.")
	project  = flag.String("project", "vscode-go", "name of the golang project")
	mdMode   = flag.Bool("md", false, "write MD output")
	exclFile = flag.String("exclude-from", "", "optional path to changelog MD file. If specified, any 'CL NNNN' occurence in the content will cause that CL to be excluded from this tool's output.")
)

// change is a change that has occurred since the last release.
type change struct {
	CL     *maintner.GerritCL
	Note   string // the part after RELNOTE=
	Issues []*maintner.GitHubIssue
}

func (c change) TextLine() string {
	subj := c.CL.Subject()
	subj = c.Note + ": " + subj
	return fmt.Sprintf("https://golang.org/cl/%d: %s", c.CL.Number, subj)
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

	ger := corpus.Gerrit()

	// Find the cutoff time for changes to include.
	cutoff := time.Date(2020, time.August, 1, 00, 00, 00, 0, time.UTC)
	ger.ForeachProjectUnsorted(func(gp *maintner.GerritProject) error {
		if gp.Server() != "go.googlesource.com" || gp.Project() != *project {
			return nil
		}
		gp.ForeachCLUnsorted(func(cl *maintner.GerritCL) error {
			if cl.Status != "merged" {
				return nil
			}
			if *sinceCl >= 0 {
				if int(cl.Number) == *sinceCl {
					cutoff = cl.Commit.CommitTime
				}
			} else if cl.Branch() == "release" && cl.Commit.CommitTime.After(cutoff) {
				// Try to figure out when the last release was
				fmt.Println(cl.Commit.CommitTime)
				cutoff = cl.Commit.CommitTime
			}
			return nil
		})
		return nil
	})

	changes := map[string][]change{} // keyed by pkg
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
			if cl.Commit.CommitTime.Before(cutoff) {
				// Was in a previous release; not for this one.
				return nil
			}

			if bytes.Contains(existingMD, []byte(fmt.Sprintf("CL %d ", cl.Number))) {
				return nil
			}

			// try to determine type from issue labels
			var issues []*maintner.GitHubIssue
			for _, ref := range cl.GitHubIssueRefs {
				issues = append(issues, ref.Repo.Issue(ref.Number))
			}

			pkg := clPackage(cl)
			changes[pkg] = append(changes[pkg], change{
				Note:   clRelNote(cl),
				CL:     cl,
				Issues: issues,
			})

			authors[cl.Owner()] = true
			return nil
		})
		return nil
	})

	var pkgs []string
	for pkg, changes := range changes {
		pkgs = append(pkgs, pkg)
		sort.Slice(changes, func(i, j int) bool {
			return changes[i].CL.Number < changes[j].CL.Number
		})
	}
	sort.Strings(pkgs)

	if *mdMode {
		fmt.Printf("## TODO: version - ")
		now := time.Now()
		fmt.Printf("%s\n\n", now.Format("2 Jan, 2006"))
		fmt.Printf("### Changes\n\n")
		mdPrintChanges(pkgs, changes)

		fmt.Printf("\n### Thanks\n\n")
		mdPrintContributers(authors)
	} else {
		for _, pkg := range pkgs {
			for _, change := range changes[pkg] {
				fmt.Printf("  %s\n", change.TextLine())
			}
		}
	}
}

func mdPrintChanges(pkgs []string, changes map[string][]change) {
	for _, pkg := range pkgs {
		for _, change := range changes[pkg] {
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

func mdPrintContributers(authors map[*maintner.GitPerson]bool) {
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
