package main

import "fmt"

type Foo struct { // Foo => struct
	Bar string
}

func main() {
	f := &Foo{Bar: "hello"}          // f => pointer
	fmt.Printf("%s %d\n", f.Bar, 42) // %d => format
}
