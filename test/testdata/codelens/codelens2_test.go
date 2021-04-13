package main

import (
	"testing"
)

// As of Go1.16, `go test -list` returns
//   TestFunction
//   Test1Function
//   TestΣυνάρτηση
//   Test함수
//   Test_foobar
func TestFunction(t *testing.T) {
	t.Log("this is a valid test function")
}

func Testfunction(t *testing.T) {
	t.Fatal("this is not a valid test function")
}

func Test1Function(t *testing.T) {
	t.Log("this is an acceptable test function")
}

func TestΣυνάρτηση(t *testing.T) {
	t.Log("this is a valid test function")
}

func Testσυνάρτηση(t *testing.T) {
	t.Fatal("this is not a valid test function")
}

func Test함수(t *testing.T) {
	t.Log("this is a valid test function")
}

func Test_foobar(t *testing.T) {
	t.Log("this is an acceptable test function")
}