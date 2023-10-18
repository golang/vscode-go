package main

import (
	"fmt"

	"golang.org/x/text/language"
)

func main() {
	tag, _ := language.Parse("hello")
	fmt.Println(tag)
}
