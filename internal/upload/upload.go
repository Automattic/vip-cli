// Package upload ports src/lib/client-file-uploader.ts: streamed S3
// uploads via presigned requests obtained from the VIP API. Strict Node
// parity: no resume cache; 3 network-error retries with 1s/2s/4s backoff;
// gzip-compress files >= CompressThreshold before upload; PutObject below
// MultipartThreshold, S3 multipart at/above it with 5 concurrent part
// workers.
package upload

const (
	mbInBytes = 1024 * 1024

	// CompressThreshold — client-file-uploader.ts:32. Files at/above this
	// size that are not already compressed get gzipped before upload.
	CompressThreshold = 16 * mbInBytes
	// MultipartThreshold — client-file-uploader.ts:35. Files below this
	// size use PutObject; at/above use the S3 multipart API.
	MultipartThreshold = 32 * mbInBytes
	// UploadPartSize — client-file-uploader.ts:38.
	UploadPartSize = 16 * mbInBytes
	// MaxConcurrentPartUploads — client-file-uploader.ts:41.
	MaxConcurrentPartUploads = 5
)
