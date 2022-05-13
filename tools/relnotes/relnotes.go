// Copyright 2021 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// The relnotes command summarizes the Go changes in Gerrit marked with
// RELNOTE annotations for the release notes.
package main

import (
	"bytes"
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"

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
	milestone           = flag.String("milestone", "", "milestone associated with the release")
	filterDirs          = flag.String("dirs", "", "comma-separated list of directories that should be touched for a CL to be considered relevant")
	sinceCL             = flag.Int("cl", -1, "the gerrit change number of the first CL to include in the output. Only changes submitted more recently than 'cl' will be included.")
	project             = flag.String("project", "vscode-go", "name of the golang project")
	exclFile            = flag.String("exclude-from", "", "optional path to changelog MD file. If specified, any 'CL NNNN' occurence in the content will cause that CL to be excluded from this tool's output.")
	semanticVersion     = flag.String("semver", "", "the semantic version of the new release")
	githubTokenFilePath = flag.String("token", "", "the absolute path to the github token file")
)

func main() {
	flag.Parse()

	if *semanticVersion == "" {
		log.Fatal("Must provide -semver.")
	}

	if *githubTokenFilePath == "" {
		log.Fatal("Must provide -token.")
	}

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
	cls := map[*maintner.GerritCL]bool{}
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
			if isGoplsChangeList(golang.GerritToGenericCL(cl)) {
				changes = append(changes, golang.GerritToGenericCL(cl))
				cls[cl] = true
			}
			return nil
		})
		return nil
	})

	fmt.Printf("# Version: %s\n\n", *semanticVersion)
	fmt.Printf("## TODO: version - ")
	now := time.Now()
	fmt.Printf("%s\n\n", now.Format("2 Jan, 2006"))
	fmt.Printf("### Changes\n\n")
	mdPrintChanges(changes, false)
	fmt.Printf("\n\n")

	fmt.Printf("### Issues\n\n")
	mdPrintIssues(changes, *milestone)
	fmt.Printf("\n\n")

	fmt.Printf("### Release comments\n\n")
	mdPrintReleaseComments(changes)
	fmt.Printf("\n\n")

	fmt.Printf("\n### Thanks\n\n")
	mdPrintContributors(cls)
}

func isGoplsChangeList(cl *generic.Changelist) bool {
	if strings.Contains(cl.Subject, "internal/lsp") || strings.Contains(cl.Subject, "gopls") {
		return true
	}
	for _, issue := range cl.AssociatedIssues {
		if issue.Repo == "golang/vscode-go" {
			return true
		}
		for _, label := range issue.Labels {
			if label == "gopls" {
				return true
			}
		}
	}
	return false
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
					fmt.Printf("[Issue %d](https://%s)", issue.Number, issue.Link)
				} else {
					fmt.Printf(", [%d](https://%s)", issue.Number, issue.Link)
				}
			}
			fmt.Printf(")")
		}
		fmt.Printf(" <!-- CL %d -->\n", change.Number)
	}
	// Group CLs by category or by first associated issue number.
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
		sort.Slice(changes, func(i, j int) bool {
			// Sort first by associated issue, then by CL number.
			var iIssue, jIssue int // first associated issues
			if len(changes[i].AssociatedIssues) > 0 {
				iIssue = changes[i].AssociatedIssues[0].Number
			}
			if len(changes[j].AssociatedIssues) > 0 {
				jIssue = changes[j].AssociatedIssues[0].Number
			}
			if iIssue != 0 && jIssue != 0 {
				return iIssue < jIssue // sort CLs with issues first
			}
			return iIssue != 0 || changes[i].Number < changes[j].Number
		})

		currentChange := -1
		for i, change := range changes {
			if len(change.AssociatedIssues) > 0 && change.AssociatedIssues[0].Number != currentChange {
				currentChange = change.AssociatedIssues[0].Number
				fmt.Printf("CL(s) for issue %d:\n", currentChange)
			} else if len(change.AssociatedIssues) == 0 && (i == 0 || len(changes[i-1].AssociatedIssues) > 0) {
				fmt.Printf("CL(s) not associated with any issue:\n")
			}
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

func mdPrintReleaseComments(changes []*generic.Changelist) {
	type Issue struct {
		repo   string
		number int
	}
	printedIssues := make(map[Issue]bool)
	for _, change := range changes {
		for _, issue := range change.AssociatedIssues {
			if _, ok := printedIssues[Issue{issue.Repo, issue.Number}]; !ok {
				printedIssues[Issue{issue.Repo, issue.Number}] = true
				printIssueReleaseComment(issue.Repo, issue.Number)
			}
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

func mdPrintContributors(cls map[*maintner.GerritCL]bool) {
	var usernames []string
	for changelist := range cls {
		author, err := fetchCLAuthorName(changelist, *project)
		if err != nil {
			log.Fatal("Error fetching Github information for %s: %v\n", changelist.Owner(), err)
		}
		usernames = append(usernames, author)
	}
	usernames = unique(usernames)
	if len(usernames) > 1 {
		usernames[len(usernames)-1] = "and " + usernames[len(usernames)-1]
	}

	fmt.Printf("Thank you for your contribution, %s!\n", strings.Join(usernames, ", "))
}

func getURL(url string) ([]byte, error) {
	req, _ := http.NewRequest("GET", url, nil)
	if token, err := ioutil.ReadFile(*githubTokenFilePath); err == nil {
		req.Header.Set("Authorization", "token "+strings.TrimSpace(string(token)))
	}
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer res.Body.Close()
	body, err := ioutil.ReadAll(res.Body)
	if err != nil {
		log.Fatalf("Error fetching Github information at %s: %v\n", url, err)
	}
	return body, nil
}

func fetchCLAuthorName(changelist *maintner.GerritCL, repo string) (string, error) {
	githubRepoMapping := map[string]string{
		"tools":     "golang/tools",
		"vscode-go": "golang/vscode-go",
	}
	body, err := getURL(fmt.Sprintf("https://api.github.com/repos/%s/commits/%s", githubRepoMapping[repo], changelist.Commit.Hash))
	if err != nil {
		return "", err
	}
	var resp map[string]interface{}
	if err := json.Unmarshal(body, &resp); err != nil {
		return "", err
	}
	if authorInfo, _ := resp["author"].(map[string]interface{}); authorInfo != nil {
		if username, ok := authorInfo["login"].(string); ok {
			return "@" + username, nil
		}
	}
	return changelist.Owner().Name(), nil
}

// printIssueReleaseComment collects the release comments, which marked by the annotation *Release*, from the issues included in this release.
func printIssueReleaseComment(repo string, issueNumber int) {
	body, err := getURL(fmt.Sprintf("https://api.github.com/repos/%s/issues/%d/comments", repo, issueNumber))
	if err != nil {
		log.Fatal(err)
	}
	var issueComments []interface{}
	if err := json.Unmarshal(body, &issueComments); err != nil {
		log.Fatalf("Error fetching Github information for issue %d:\n", issueNumber)
	}
	for _, comment := range issueComments {
		c, _ := comment.(map[string]interface{})
		if str, ok := c["body"].(string); ok && strings.Contains(str, "*Release*") {
			fmt.Println(str)
			return
		}
	}
}

// unique returns a ascendingly sorted set of unique strings among its input
func unique(input []string) []string {
	m := make(map[string]bool)
	for _, entry := range input {
		m[entry] = true
	}
	var list []string
	for key, _ := range m {
		list = append(list, key)
	}
	sort.Strings(list)
	return list
}
