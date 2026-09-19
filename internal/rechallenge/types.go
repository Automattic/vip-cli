// Package rechallenge implements the Rechallenge v2 step-up authentication
// flow. Mirrors src/lib/rechallenge/* in the Node implementation.
//
// Contract guarantees (load-bearing per project_rechallenge_v2.md):
//   - Parker path templates and the elevated-header name come from
//     extensions.rechallenge ON EACH response, never hardcoded.
//   - Only mutations are eligible for step-up; queries surface errors unchanged.
//   - The elevated-token cache uses a single keychain entry shared with the
//     Node binary so logged-in state crosses binaries.
package rechallenge

import "time"

const (
	// ElevatedPermissionErrorCode matches src/lib/rechallenge/types.ts.
	ElevatedPermissionErrorCode = "elevated-permission-required"
	// Version is the rechallenge protocol version this client supports.
	Version = "v2"
	// ClientType is sent in createSession to identify the caller.
	ClientType = "cli"
)

// Status mirrors RechallengeStatus from types.ts.
type Status string

const (
	StatusPending   Status = "pending"
	StatusVerified  Status = "verified"
	StatusExpired   Status = "expired"
	StatusFailed    Status = "failed"
	StatusCancelled Status = "cancelled"
)

// IsTerminal reports whether the status indicates the flow should stop polling.
func (s Status) IsTerminal() bool {
	switch s {
	case StatusVerified, StatusExpired, StatusFailed, StatusCancelled:
		return true
	}
	return false
}

// Extension is the shape of errors[0].extensions.rechallenge from the API.
type Extension struct {
	Version              string `json:"version"`
	CreateSessionPath    string `json:"createSessionPath"`
	StatusPathTemplate   string `json:"statusPathTemplate"`
	ExchangePathTemplate string `json:"exchangePathTemplate"`
	ElevatedHeaderName   string `json:"elevatedHeaderName"`
}

// IsValid reports whether the extension has all required template fields.
// Mirrors the typeof checks in link.ts:extractElevatedPermission.
func (e Extension) IsValid() bool {
	return e.CreateSessionPath != "" &&
		e.StatusPathTemplate != "" &&
		e.ExchangePathTemplate != "" &&
		e.ElevatedHeaderName != ""
}

// Session is the response from POST {createSessionPath}.
type Session struct {
	ChallengeID         string    `json:"challengeId"`
	Status              Status    `json:"status"`
	VerificationURL     string    `json:"verificationUrl"`
	PollIntervalSeconds int       `json:"pollIntervalSeconds"`
	ExpiresAt           time.Time `json:"expiresAt"`
}

// StatusReason is the optional explanation returned with a terminal status.
type StatusReason struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

// SessionStatus is the response from GET {statusPathTemplate}.
type SessionStatus struct {
	ChallengeID         string        `json:"challengeId"`
	Status              Status        `json:"status"`
	ExpiresAt           time.Time     `json:"expiresAt"`
	VerifiedAt          *time.Time    `json:"verifiedAt,omitempty"`
	Provider            string        `json:"provider,omitempty"`
	PollIntervalSeconds int           `json:"pollIntervalSeconds"`
	StatusReason        *StatusReason `json:"statusReason,omitempty"`
}

// ExchangeResponse is the response from POST {exchangePathTemplate}.
type ExchangeResponse struct {
	ElevatedToken ElevatedToken `json:"elevatedToken"`
}

// ElevatedToken is the elevated bearer issued after successful step-up.
// HeaderName is set by the flow orchestrator (copied from Extension.ElevatedHeaderName)
// so the link layer doesn't need to consult the Extension during replay.
type ElevatedToken struct {
	Token      string    `json:"token"`
	ExpiresAt  time.Time `json:"expiresAt"`
	Purpose    string    `json:"purpose"`
	HeaderName string    `json:"headerName,omitempty"`
}
