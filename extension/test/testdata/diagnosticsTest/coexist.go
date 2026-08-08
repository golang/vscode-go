package main

import (
	"fmt"
	"os"
)

func Save(v interface{}, path string) { os.WriteFile(path, fmt.Append(nil, v), 0o600) }
