package linterTest

import (
	"fmt"
)

func ExportedFunc() {
	x := compute()
	if x == nil {
		fmt.Println("nil pointer received")
	}
	// if x is nil, the next line will panic.
	foo(*x)
}

func compute() **int { return nil }
func foo(x *int)     { fmt.Println(*x) }
