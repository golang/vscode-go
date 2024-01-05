package main

import (
	"fmt"
	"time"
)

func main() {
	for i := 0; i < 3; i++ {
		fmt.Println("Hello!")
		time.Sleep(2 * time.Second)
		fmt.Println("Goodbye!")
	}
}
