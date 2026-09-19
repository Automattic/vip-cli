// Package edgeworkers implements local projects and the Edge Workers lifecycle.
package edgeworkers

import (
	"context"
	"github.com/Automattic/vip/internal/gql/edgeworkerinput"
)

type Location = edgeworkerinput.Location
type LocationValue = edgeworkerinput.LocationValue
type WriteInput = edgeworkerinput.Fields

type Worker struct {
	ID                   int64
	Name                 string
	Location             *Location
	Phases               []string
	OnFailure            string
	Active               bool
	CreatedAt, UpdatedAt string
	Source               *string
}

type ValidationResult struct {
	Valid          bool
	Phases, Errors []string
}

type API interface {
	List(context.Context, int64, int64) ([]Worker, error)
	Get(context.Context, int64, int64, string, bool) (*Worker, error)
	Create(context.Context, int64, WriteInput) (Worker, error)
	Update(context.Context, int64, int64, WriteInput) (Worker, error)
	SetActive(context.Context, int64, int64, bool) (Worker, error)
	Delete(context.Context, int64, int64) error
	Validate(context.Context, int64, string) (ValidationResult, error)
}
