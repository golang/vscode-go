package b

import (
	"fmt"
	"os"
)

func main() {
	v := os.Env()
	fmt.Print(v)
}
