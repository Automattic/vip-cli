package upload

import "errors"

// PartBoundary mirrors Node's PartBoundaries (client-file-uploader.ts:479).
// End is inclusive, like Node's createReadStream({start, end}) range.
type PartBoundary struct {
	Start    int64
	End      int64
	Index    int
	PartSize int64
}

// GetPartBoundaries ports getPartBoundaries (client-file-uploader.ts:485).
func GetPartBoundaries(fileSize int64) ([]PartBoundary, error) {
	return getPartBoundariesWithSize(fileSize, UploadPartSize)
}

// getPartBoundariesWithSize is GetPartBoundaries with an explicit part
// size so tests don't need 16MB fixtures.
func getPartBoundariesWithSize(fileSize, partSize int64) ([]PartBoundary, error) {
	if fileSize < 1 {
		return nil, errors.New("fileSize must be greater than zero")
	}
	numParts := (fileSize + partSize - 1) / partSize
	parts := make([]PartBoundary, 0, numParts)
	for i := int64(0); i < numParts; i++ {
		start := i * partSize
		remaining := fileSize - start
		end := start + partSize - 1
		if remaining <= partSize {
			end = start + remaining - 1
		}
		parts = append(parts, PartBoundary{
			Start: start, End: end, Index: int(i), PartSize: end + 1 - start,
		})
	}
	return parts, nil
}
