package gql

import (
	"fmt"

	json "encoding/json/v2"

	"github.com/vektah/gqlparser/v2/ast"
	"github.com/vektah/gqlparser/v2/parser"
)

// Operation describes the relevant shape of a GraphQL request as inspected
// by the rechallenge middleware.
type Operation struct {
	OperationName    string
	IsMutation       bool
	PrimaryFieldName string // first FIELD in the operation's selection set
}

// ParseOperationFromBody decodes the JSON request body, parses the contained
// "query" string, and reports whether it's a mutation along with its primary
// field name (the rechallenge "scope").
func ParseOperationFromBody(body []byte) (*Operation, error) {
	var raw struct {
		OperationName string `json:"operationName"`
		Query         string `json:"query"`
	}
	if err := json.Unmarshal(body, &raw); err != nil {
		return nil, fmt.Errorf("decode body: %w", err)
	}
	if raw.Query == "" {
		return nil, fmt.Errorf("body has no query field")
	}
	doc, err := parser.ParseQuery(&ast.Source{Input: raw.Query})
	if err != nil {
		return nil, fmt.Errorf("parse query: %w", err)
	}
	op := selectOperation(doc, raw.OperationName)
	if op == nil {
		return nil, fmt.Errorf("no operations in query")
	}
	out := &Operation{
		OperationName: op.Name,
		IsMutation:    op.Operation == ast.Mutation,
	}
	for _, sel := range op.SelectionSet {
		if f, ok := sel.(*ast.Field); ok {
			out.PrimaryFieldName = f.Name
			break
		}
	}
	return out, nil
}

func selectOperation(doc *ast.QueryDocument, opName string) *ast.OperationDefinition {
	if opName != "" {
		for _, op := range doc.Operations {
			if op.Name == opName {
				return op
			}
		}
	}
	if len(doc.Operations) > 0 {
		return doc.Operations[0]
	}
	return nil
}
