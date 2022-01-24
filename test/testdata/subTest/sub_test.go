package subTest

import "testing"

func TestMain(t *testing.T) {
	t.Log("Main")
	t.Run("Sub", func(t *testing.T) { t.Log("Sub") })
	t.Run("Sub", func(t *testing.T) { t.Log("Sub#01") })
	t.Run("Sub#01", func(t *testing.T) { t.Log("Sub#01#01") })
}

func TestOther(t *testing.T) {
	t.Log("Other")
}
