package main

import (
	"fmt"
	"io/ioutil"
)

func main() {
	dat, _ := ioutil.ReadFile("hello.txt")
	strdat := string(dat)
	fmt.Println(strdat)
}
