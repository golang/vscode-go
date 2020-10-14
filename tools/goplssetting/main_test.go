// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

package main

import (
	"bytes"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestRun(t *testing.T) {
	if _, err := exec.LookPath("gopls"); err != nil {
		t.Skipf("gopls is not found (%v), skipping...", err)
	}
	if _, err := exec.LookPath("jq"); err != nil {
		t.Skipf("jq is not found (%v), skipping...", err)
	}
	testfile := filepath.Join("..", "..", "package.json")
	got, err := run(testfile)
	if err != nil {
		t.Fatalf("run failed: %v", err)
	}
	t.Logf("%s", got)
}

func TestWriteAsVSCodeSettings(t *testing.T) {
	if _, err := exec.LookPath("jq"); err != nil {
		t.Skipf("jq is not found (%v), skipping...", err)
	}
	testCases := []struct {
		name string
		in   *OptionJSON
		out  string
	}{
		{
			name: "boolean",
			in: &OptionJSON{
				Name:    "verboseOutput",
				Type:    "bool",
				Doc:     "verboseOutput enables additional debug logging.\n",
				Default: "false",
			},
			out: `"gopls.verboseOutput": {
					"type": "boolean",
					"markdownDescription": "verboseOutput enables additional debug logging.\n",
					"default": false,
					"scope": "resource"
				}`,
		},
		{
			name: "time",
			in: &OptionJSON{
				Name:    "completionBudget",
				Type:    "time.Duration",
				Default: "\"100ms\"",
			},
			out: `"gopls.completionBudget": {
					"type": "string",
					"markdownDescription": "",
					"default": "100ms",
					"scope": "resource"
				}`,
		},
		{
			name: "map",
			in: &OptionJSON{
				Name:    "analyses",
				Type:    "map[string]bool",
				Default: "{}",
			},
			out: `"gopls.analyses":{
					"type": "object",
					"markdownDescription": "",
					"default": {},
					"scope": "resource"
		  		}`,
		},
		{
			name: "enum",
			in: &OptionJSON{
				Name: "matcher",
				Type: "enum",
				EnumValues: []EnumValue{
					{
						Value: "\"CaseInsensitive\"",
						Doc:   "",
					},
					{
						Value: "\"CaseSensitive\"",
						Doc:   "",
					},
					{
						Value: "\"Fuzzy\"",
						Doc:   "",
					},
				},
				Default: "\"Fuzzy\"",
			},
			out: `"gopls.matcher": {
 					"type": "string",
					"markdownDescription": "",
					"enum": [ "CaseInsensitive", "CaseSensitive", "Fuzzy" ],
					"markdownEnumDescriptions": [ "","","" ],
					"default": "Fuzzy",
					"scope": "resource"
				}`,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			options := []*OptionJSON{tc.in}
			buf := &bytes.Buffer{}
			writeAsVSCodeSettings(buf, options)
			if got, want := normalize(t, buf.String()), normalize(t, "{ "+tc.out+" }"); got != want {
				t.Errorf("writeAsVSCodeSettings = %v, want %v", got, want)
			}
		})
	}
}

func normalize(t *testing.T, in string) string {
	t.Helper()
	cmd := exec.Command("jq")
	cmd.Stdin = strings.NewReader(in)
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("failed to run jq: %v", err)
	}
	return string(out)
}
