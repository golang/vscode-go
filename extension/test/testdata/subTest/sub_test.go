package subTest

import "testing"

func TestMain(t *testing.T) {
	t.Log("Main")
	t.Run("Sub|Test", func(t *testing.T) { t.Log("Sub") })
	t.Run("Sub|Test", func(t *testing.T) { t.Log("Sub#01") })
	t.Run("Sub|Test#01", func(t *testing.T) { t.Log("Sub#01#01") })

	t.Run("1 + 1", func(t *testing.T) {
		t.Run("Nested", func(t *testing.T) { t.Log("1 + 1 = 2") })
	})
}

func TestOther(t *testing.T) {
	t.Log("Other")
}
