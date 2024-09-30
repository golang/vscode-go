// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

package goplssetting

import (
	"os/exec"
	"path/filepath"
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestRun(t *testing.T) {
	if _, err := exec.LookPath("gopls"); err != nil {
		t.Skipf("gopls is not found (%v), skipping...", err)
	}
	if _, err := exec.LookPath("jq"); err != nil {
		t.Skipf("jq is not found (%v), skipping...", err)
	}
	testfile := filepath.Join("..", "..", "package.json")
	got, err := Generate(testfile, false)
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
		in   *Option
		want map[string]*Object
	}{
		{
			name: "boolean",
			in: &Option{
				Name:    "verboseOutput",
				Type:    "bool",
				Doc:     "verboseOutput enables additional debug logging.\n",
				Default: "false",
			},
			want: map[string]*Object{
				"verboseOutput": {
					Type:                "boolean",
					MarkdownDescription: "verboseOutput enables additional debug logging.\n",
					Default:             false,
					Scope:               "resource",
				},
			},
		},
		{
			name: "time",
			in: &Option{
				Name:    "completionBudget",
				Type:    "time.Duration",
				Default: "\"100ms\"",
			},
			want: map[string]*Object{
				"completionBudget": {
					Type:    "string",
					Default: "100ms",
					Scope:   "resource",
				},
			},
		},
		{
			name: "map",
			in: &Option{
				Name:    "analyses",
				Type:    "map[string]bool",
				Default: "{}",
			},
			want: map[string]*Object{
				"analyses": {
					Type:  "object",
					Scope: "resource",
				},
			},
		},
		{
			name: "enum",
			in: &Option{
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
			want: map[string]*Object{
				"matcher": {
					Type:                     "string",
					Enum:                     []any{"CaseInsensitive", "CaseSensitive", "Fuzzy"},
					MarkdownEnumDescriptions: []string{"", "", ""},
					Default:                  "Fuzzy",
					Scope:                    "resource",
				},
			},
		},
		{
			name: "mixedEnum",
			in: &Option{
				Name: "linksInHover",
				Type: "enum",
				EnumValues: []EnumValue{
					{
						Value: "false",
						Doc:   "`false`: ...",
					},
					{
						Value: "true",
						Doc:   "`true`: ...",
					},
					{
						Value: "\"gopls\"",
						Doc:   "`\"gopls\"`: ...",
					},
				},
				Default: "true",
			},
			want: map[string]*Object{
				"linksInHover": {
					Type:                     []string{"boolean", "string"},
					Enum:                     []any{false, true, "gopls"},
					MarkdownEnumDescriptions: []string{"`false`: ...", "`true`: ...", "`\"gopls\"`: ..."},
					Scope:                    "resource",
					Default:                  true,
				},
			},
		},
		{
			name: "array",
			in: &Option{
				Name:    "directoryFilters",
				Type:    "[]string",
				Default: "[\"-node_modules\", \"-vendor\"]",
			},
			want: map[string]*Object{
				"directoryFilters": {
					Type:    "array",
					Default: []string{"-node_modules", "-vendor"},
					Scope:   "resource",
				},
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			options := []*Option{tc.in}
			got, err := asVSCodeSettings(options)
			if err != nil {
				t.Fatal(err)
			}
			want := map[string]*Object{
				"gopls": {
					Type:                "object",
					MarkdownDescription: "Configure the default Go language server ('gopls'). In most cases, configuring this section is unnecessary. See [the documentation](https://github.com/golang/tools/blob/master/gopls/doc/settings.md) for all available settings.",
					Scope:               "resource",
					Properties:          tc.want,
				},
			}
			if diff := cmp.Diff(want, got); diff != "" {
				t.Errorf("writeAsVSCodeSettings = %v; diff = %v", got, diff)
			}
		})
	}
}
