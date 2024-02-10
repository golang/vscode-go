// Copyright 2024 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.

// The binary vscgo is a helper of the VS Code Go extension.
// The source is distributed with the extension and compiled when
// the extension is first activated.
package main

import "github.com/golang/vscode-go/internal/vscgo"

func main() {
	vscgo.Main()
}
