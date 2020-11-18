package main

import (
	"testing"
)

func TestA(t *testing.T) {
	t.Log("log")
	t.Errorf("error")
}
