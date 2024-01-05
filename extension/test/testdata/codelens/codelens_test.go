package main

import (
	"testing"
)

func TestSample(t *testing.T) {
	t.Run("sample test passing", func(t *testing.T) {

	})

	t.Run("sample test failing", func(t *testing.T) {
		t.FailNow()
	})

	testName := "dynamic test name"
	t.Run(testName, func(t *testing.T) {
		t.FailNow()
	})
}
