package main

func run1() {
	x := 0
	for {
		x++
		x *= 4
	}
}

func run2() {
	x := 0
	for {
		x++
		x *= 4
	}
}

func main() {
	go run1()
	go run2()
	for {
	}
}
