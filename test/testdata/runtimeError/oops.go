package main

func oops() {
	var a *int
	*a++
}

func main() {
	oops()
}
