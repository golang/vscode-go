// Copyright 2021 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// Binary installtools is a helper that installs Go tools extension tests depend on.
package main

import "testing"

func Test_pickVersion(t *testing.T) {
	tests := []struct {
		name     string
		versions []finalVersion
		want     map[int]string
	}{
		{
			name:     "nil",
			versions: nil,
			want:     map[int]string{15: "latest", 16: "latest", 17: "latest", 18: "latest"},
		},
		{
			name: "one_entry",
			versions: []finalVersion{
				{16, "v0.2.2"},
			},
			want: map[int]string{15: "v0.2.2", 16: "v0.2.2", 17: "latest", 18: "latest"},
		},
		{
			name: "two_entries",
			versions: []finalVersion{
				{16, "v0.2.2"},
				{17, "v0.3.0"},
			},
			want: map[int]string{15: "v0.2.2", 16: "v0.2.2", 17: "v0.3.0", 18: "latest"},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			for goMinorVersion, want := range tt.want {
				if got := pickVersion(goMinorVersion, tt.versions, "latest"); got != want {
					t.Errorf("pickVersion(go 1.%v) = %v, want %v", goMinorVersion, got, want)
				}
			}
		})
	}
}
