// Copyright 2024 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

package vscgo

import (
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"os"

	"github.com/google/pprof/profile"
)

func runPprofDump(args []string) error {
	if len(args) != 1 {
		return fmt.Errorf("usage: dump-pprof <profile>")
	}

	p, err := readPprof(args[0])
	if err != nil {
		return err
	}

	return json.NewEncoder(os.Stdout).Encode((*Profile)(p))
}

func runPprofServe(args []string) error {
	if len(args) != 2 {
		return fmt.Errorf("usage: serve-pprof <addr> <profile>")
	}

	l, err := net.Listen("tcp", args[0])
	if err != nil {
		return err
	}
	defer l.Close()

	p, err := readPprof(args[1])
	if err != nil {
		return err
	}

	err = json.NewEncoder(os.Stdout).Encode(map[string]any{
		"Listen": l.Addr(),
	})
	if err != nil {
		return err
	}

	return http.Serve(l, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusOK)
			return
		}

		w.Header().Set("Content-Type", "application/json")
		err := json.NewEncoder(w).Encode((*Profile)(p))
		if err != nil {
			log.Println("Error: ", err)
		}
	}))
}

func readPprof(arg string) (*Profile, error) {
	f, err := os.Open(arg)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	p, err := profile.Parse(f)
	if err != nil {
		return nil, err
	}

	return (*Profile)(p), nil
}

type Profile profile.Profile

func (p *Profile) MarshalJSON() ([]byte, error) {
	q := struct {
		SampleType        []*profile.ValueType
		DefaultSampleType string
		Sample            []*Sample
		Mapping           []*profile.Mapping
		Location          []*Location
		Function          []*profile.Function
		Comments          []string
		DropFrames        string
		KeepFrames        string
		TimeNanos         int64
		DurationNanos     int64
		PeriodType        *profile.ValueType
		Period            int64
	}{
		SampleType:        p.SampleType,
		DefaultSampleType: p.DefaultSampleType,
		Sample:            make([]*Sample, len(p.Sample)),
		Mapping:           p.Mapping,
		Location:          make([]*Location, len(p.Location)),
		Function:          p.Function,
		Comments:          p.Comments,
		DropFrames:        p.DropFrames,
		KeepFrames:        p.KeepFrames,
		TimeNanos:         p.TimeNanos,
		DurationNanos:     p.DurationNanos,
		PeriodType:        p.PeriodType,
		Period:            p.Period,
	}
	for i, s := range p.Sample {
		q.Sample[i] = (*Sample)(s)
	}
	for i, l := range p.Location {
		q.Location[i] = (*Location)(l)
	}
	return json.Marshal(q)
}

type Sample profile.Sample

func (p *Sample) MarshalJSON() ([]byte, error) {
	q := struct {
		Location []uint64
		Value    []int64
		Label    map[string][]string
		NumLabel map[string][]int64
		NumUnit  map[string][]string
	}{
		Location: make([]uint64, len(p.Location)),
		Value:    p.Value,
		Label:    p.Label,
		NumLabel: p.NumLabel,
		NumUnit:  p.NumUnit,
	}
	for i, l := range p.Location {
		q.Location[i] = l.ID
	}
	return json.Marshal(q)
}

type Location profile.Location

func (p *Location) MarshalJSON() ([]byte, error) {
	q := struct {
		ID       uint64
		Mapping  uint64
		Address  uint64
		Line     []Line
		IsFolded bool
	}{
		ID:       p.ID,
		Mapping:  p.Mapping.ID,
		Address:  p.Address,
		Line:     make([]Line, len(p.Line)),
		IsFolded: p.IsFolded,
	}
	for i, l := range p.Line {
		q.Line[i] = Line(l)
	}
	return json.Marshal(q)
}

type Line profile.Line

func (p *Line) MarshalJSON() ([]byte, error) {
	q := struct {
		Function uint64
		Line     int64
		Column   int64
	}{
		Function: p.Function.ID,
		Line:     p.Line,
		Column:   p.Column,
	}
	return json.Marshal(q)
}
