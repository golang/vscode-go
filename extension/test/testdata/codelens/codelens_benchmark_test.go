package main

import (
	"testing"
)

func BenchmarkSample(b *testing.B) {
	b.Run("sample test passing", func(t *testing.B) {

	})

	b.Run("sample test failing", func(t *testing.B) {
		t.FailNow()
	})

	testName := "dynamic test name"
	b.Run(testName, func(t *testing.B) {
		t.FailNow()
	})
}
