package linterTest

import (
	"errors"
	"fmt"
)

func secondFunc() error {
	return errors.New(fmt.Sprint("Errors"))
}
