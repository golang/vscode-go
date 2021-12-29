package subTest

import "testing"

func TestMain(t *testing.T) {
	t.Log("Main")
	t.Run("Sub", func(t *testing.T) { t.Log("Sub") })
}

func TestOther(t *testing.T) {
	t.Log("Other")
}
