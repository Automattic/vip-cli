// Package gql is the typed GraphQL client for the vip-cli Go rewrite.
//
// The schema is vendored from the Node project (see SCHEMA.md). Operations
// live in operations/*.graphql. Run `go generate ./internal/gql/...` to
// regenerate the typed client into generated.go.
//
// The client is composed of stacked middleware (transport -> retry ->
// rechallenge -> error-handling, applied outermost-first). Each middleware
// is a Doer that wraps a next Doer. The rechallenge slot is a no-op in
// M2; M3 will fill it in with the step-up flow per project_rechallenge_v2.md.
package gql

//go:generate genqlient
