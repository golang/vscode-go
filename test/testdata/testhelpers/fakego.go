// Copyright 2020 The Go Authors. All rights reserved.
// Licensed under the MIT License.
// See LICENSE in the project root for license information.

// This is a helper used to fake a go binary.
// It currently fakes `go env` and `go version` commands.
// For `go env`, it returns FAKEGOROOT for 'GOROOT', and an empty string for others.
// For `go version`, it returns FAKEGOVERSION or a default dev version string.
package main

import (
	"fmt"
	"os"
)

func main() {
	args := os.Args

	if len(args) <= 1 {
		return
	}
	switch args[1] {
	case "env":
		fakeEnv(args[2:])
	case "version":
		fakeVersion()
	default:
		fmt.Fprintf(os.Stderr, "not implemented")
		os.Exit(1)
	}
	os.Exit(0)
}

func fakeEnv(args []string) {
	for _, a := range args {
		fmt.Println(os.Getenv("FAKE" + a))
	}
}

func fakeVersion() {
	ver := os.Getenv("FAKEGOVERSION")
	if ver != "" {
		fmt.Println(ver)
		return
	}
	fmt.Println("go version devel +a07e2819 Thu Jun 18 20:58:26 2020 +0000 darwin/amd64")
}
