package sqlvalidation

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestEngineScannerSharedCases(t *testing.T) {
	data, err := os.ReadFile("../../__fixtures__/validations/sql-engine-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name  string
		Lines []string
		Want  []int
	}
	if err := json.Unmarshal(data, &cases); err != nil {
		t.Fatal(err)
	}
	for _, tc := range cases {
		t.Run(tc.Name, func(t *testing.T) {
			var scanner engineScanner
			got := []int{}
			for i, line := range tc.Lines {
				got = append(got, scanner.scan(line, i+1)...)
			}
			if !reflect.DeepEqual(got, tc.Want) {
				t.Fatalf("got %v, want %v", got, tc.Want)
			}
		})
	}
}
