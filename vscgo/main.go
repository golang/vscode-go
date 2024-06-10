// Copyright 2023 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// The binary vscgo is a helper of the VS Code Go extension.
// The source is distributed with the extension and compiled when
// the extension is first activated.
package main

import (
	"fmt"
	"os"
)

func main() {
	fmt.Fprintln(os.Stderr, "This is a deprecated version of vscgo. Please reinstall:")
	fmt.Fprintln(os.Stderr, "  go install github.com/golang/vscode-go/vscgo@latest")
}
