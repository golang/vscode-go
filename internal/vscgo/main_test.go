// Copyright 2023 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// The binary vscgo is a helper of the VS Code Go extension.
// The source is distributed with the extension and compiled when
// the extension is first activated.
package vscgo

import (
	"bufio"
	"reflect"
	"strings"
	"testing"
)

func Test_runIncCounters(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    map[string]int64
		wantErr bool
	}{
		{
			name: "empty",
			in:   "",
			want: map[string]int64{},
		},
		{
			name: "single",
			in:   "foo 7",
			want: map[string]int64{"foo": 7},
		},
		{
			name: "single",
			in:   "\nfoo 7",
			want: map[string]int64{"foo": 7},
		},
		{
			name: "multiple",
			in:   "foo 7\nbar 8\n",
			want: map[string]int64{"foo": 7, "bar": 8},
		},
		{
			name: "trim_space_in_name",
			in:   " foo 1\n bar 3\n",
			want: map[string]int64{"foo": 1, "bar": 3},
		},
		{
			name: "nongraphic_char_in_name",
			in:   "foo\u200b 1\nfoo 3\n",
			want: map[string]int64{"foo\u200b": 1, "foo": 3},
		},
		{
			name:    "invalid:missing_count",
			in:      "\nfoo\nbar 1",
			want:    map[string]int64{incCountersBadInput: 1},
			wantErr: true,
		},
		{
			name:    "invalid:missing_count2",
			in:      "foo 1\n1",
			want:    map[string]int64{"foo": 1, incCountersBadInput: 1},
			wantErr: true,
		},
		{
			name:    "invalid:negative_count",
			in:      "foo 2\nbar -1\nbaz 8\n",
			want:    map[string]int64{"foo": 2, incCountersBadInput: 1},
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := map[string]int64{}
			incCounter := func(name string, count int64) {
				if name != incCountersBadInput && strings.HasPrefix(name, "inc_counters_") {
					// ignore our own counters, except the bad input counter.
					return
				}
				got[name] = count
			}
			err := runIncCountersImpl(bufio.NewScanner(strings.NewReader(tt.in)), incCounter)
			if (err != nil) != tt.wantErr {
				t.Errorf("runIncCountersImpl(%q) = %v, wantErr=%v", tt.in, err, tt.wantErr)
				return
			}
			if !reflect.DeepEqual(got, tt.want) {
				t.Errorf("counters after runIncCountersImpl = %+v, want %+v", got, tt.want)
			}
		})
	}
}
