package upload

import (
	"encoding/xml"
	"fmt"
	"net/http"
)

// s3Error is the body S3 returns on failure (Node parses with xml2js;
// only Code and Message are consumed — client-file-uploader.ts:246).
type s3Error struct {
	XMLName xml.Name `xml:"Error"`
	Code    string   `xml:"Code"`
	Message string   `xml:"Message"`
}

// formatS3Error renders the {"Code":...,"Message":...} fragment Node
// builds with JSON.stringify({ Code, Message }) — client-file-uploader.ts:322.
func formatS3Error(body []byte, resp *http.Response) string {
	var e s3Error
	if err := xml.Unmarshal(body, &e); err == nil && e.Code != "" {
		return fmt.Sprintf(`{"Code":%q,"Message":%q}`, e.Code, e.Message)
	}
	// Node: Code = `HTTP Error <status>`, Message = statusText (ts:318).
	return fmt.Sprintf(`{"Code":%q,"Message":%q}`,
		fmt.Sprintf("HTTP Error %d", resp.StatusCode),
		http.StatusText(resp.StatusCode))
}
