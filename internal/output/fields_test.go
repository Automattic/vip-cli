package output

import "testing"

func TestHumanizeFieldMatchesNodeCamelCaseSplit(t *testing.T) {
	tests := map[string]string{
		"appId":         "app id",
		"appID":         "app i d",
		"currentCommit": "current commit",
		"name":          "name",
		"Name":          "name",
		"ID":            "i d",
	}
	for input, want := range tests {
		t.Run(input, func(t *testing.T) {
			if got := HumanizeField(input); got != want {
				t.Fatalf("HumanizeField(%q) = %q, want %q", input, got, want)
			}
		})
	}
}
