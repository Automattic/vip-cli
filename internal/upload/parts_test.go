package upload

import "testing"

func TestGetPartBoundaries(t *testing.T) {
	// Node client-file-uploader.ts:485. UploadPartSize = 16 MiB.
	const mb = int64(1024 * 1024)
	cases := []struct {
		name     string
		fileSize int64
		want     []PartBoundary
	}{
		{"one byte", 1, []PartBoundary{{Start: 0, End: 0, Index: 0, PartSize: 1}}},
		{"exactly one part", 16 * mb, []PartBoundary{{Start: 0, End: 16*mb - 1, Index: 0, PartSize: 16 * mb}}},
		{"one part plus one byte", 16*mb + 1, []PartBoundary{
			{Start: 0, End: 16*mb - 1, Index: 0, PartSize: 16 * mb},
			{Start: 16 * mb, End: 16 * mb, Index: 1, PartSize: 1},
		}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := GetPartBoundaries(tc.fileSize)
			if err != nil {
				t.Fatal(err)
			}
			if len(got) != len(tc.want) {
				t.Fatalf("len = %d, want %d", len(got), len(tc.want))
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Errorf("part %d = %+v, want %+v", i, got[i], tc.want[i])
				}
			}
		})
	}
	if _, err := GetPartBoundaries(0); err == nil {
		t.Error("fileSize 0 should error (Node: 'fileSize must be greater than zero')")
	}
}
