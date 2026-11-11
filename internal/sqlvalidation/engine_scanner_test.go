package sqlvalidation

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"strings"
	"testing"
)

func TestEngineScannerSharedCases(t *testing.T) {
	data, err := os.ReadFile("../../__fixtures__/validations/sql-engine-cases.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases []struct {
		Name       string
		Lines      []string
		Want       []int
		Incomplete bool
		Error      string
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
			err := scanner.finish()
			if (err != nil) != (tc.Incomplete || tc.Error != "") {
				t.Fatalf("finish error = %v, want incomplete = %v or error %q", err, tc.Incomplete, tc.Error)
			}
			if tc.Error != "" && err.Error() != "SQL engine validation could not finish: "+tc.Error {
				t.Fatalf("finish error = %v, want %q", err, tc.Error)
			}
		})
	}
}

// Run with -bench BenchmarkEngineScannerExtendedInsert -benchmem. Doubling
// rows should grow runtime proportionally, including with custom delimiters.
func BenchmarkEngineScannerExtendedInsert(b *testing.B) {
	for _, delimiter := range []string{";", "$$"} {
		for _, rows := range []int{8192, 16384, 32768, 65536} {
			b.Run(fmt.Sprintf("%s/%d", delimiter, rows), func(b *testing.B) {
				line := "INSERT INTO t VALUES " + strings.TrimSuffix(strings.Repeat("('hello'),", rows), ",") + delimiter
				b.SetBytes(int64(len(line)))
				b.ResetTimer()
				for b.Loop() {
					scanner := engineScanner{delimiter: delimiter}
					scanner.scan(line, 1)
				}
			})
		}
	}
}
