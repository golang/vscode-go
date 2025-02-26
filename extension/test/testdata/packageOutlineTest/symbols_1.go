package package_outline_test

import (
	"fmt"
)

func print(txt string) {
	fmt.Println(txt)
}
func main() {
	print("Hello")
}

type TestReceiver struct {
	field1 int
	field2 string
	field3 bool
}

func (*TestReceiver) method1() {

}
