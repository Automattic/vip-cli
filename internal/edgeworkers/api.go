package edgeworkers

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/Automattic/vip/internal/gql"
	"github.com/Automattic/vip/internal/gql/edgeworkerinput"
	"github.com/Khan/genqlient/graphql"
	"github.com/vektah/gqlparser/v2/gqlerror"
)

type APIClient struct{ Client graphql.Client }

// APIError retains the server's messages without gqlparser's source/path
// prefixes. The command prints the individual diagnostics like Node's error
// link, then adds its operation-specific context. Rechallenge and 401 handling
// still run in the configured transport before this conversion.
type APIError struct {
	Messages []string
	Cause    error
}

func (e *APIError) Error() string { return strings.Join(e.Messages, "\n") }
func (e *APIError) Unwrap() error { return e.Cause }
func apiError(err error) error {
	var list gqlerror.List
	if !errors.As(err, &list) {
		return err
	}
	messages := make([]string, len(list))
	for i, item := range list {
		messages[i] = item.Message
	}
	return &APIError{Messages: messages, Cause: err}
}

var errInvalidRead = errors.New("EdgeWorkers query returned an invalid response.")

func workerFromFields(f gql.EdgeWorkerFields) Worker {
	w := Worker{ID: f.Id, Name: f.Name, Active: f.Active, Phases: phaseStrings(f.Phases), OnFailure: string(f.OnFailure), CreatedAt: f.CreatedAt, UpdatedAt: f.UpdatedAt}
	if f.Location != nil {
		w.Location = &Location{Operator: string(f.Location.Operator), Value: f.Location.Value}
	}
	return w
}

func phaseStrings(phases []gql.EdgeWorkerPhase) []string {
	out := make([]string, len(phases))
	for i, p := range phases {
		out[i] = string(p)
	}
	return out
}

func (a APIClient) List(ctx context.Context, appID, envID int64) ([]Worker, error) {
	r, err := gql.EdgeWorkers(gql.WithAllowGQLErrors(ctx), a.Client, appID, envID)
	if err != nil {
		return nil, apiError(err)
	}
	if r == nil || r.App == nil || len(r.App.Environments) == 0 || r.App.Environments[0] == nil || r.App.Environments[0].EdgeWorkers == nil {
		return nil, errInvalidRead
	}
	workers := make([]Worker, 0, len(r.App.Environments[0].EdgeWorkers))
	for _, w := range r.App.Environments[0].EdgeWorkers {
		if w == nil {
			return nil, errInvalidRead
		}
		workers = append(workers, workerFromFields(w.EdgeWorkerFields))
	}
	return workers, nil
}

func (a APIClient) Get(ctx context.Context, appID, envID int64, name string, source bool) (*Worker, error) {
	ctx = gql.WithAllowGQLErrors(ctx)
	if source {
		r, err := gql.EdgeWorkerDetailWithSource(ctx, a.Client, appID, envID)
		if err != nil {
			return nil, apiError(err)
		}
		if r == nil || r.App == nil || len(r.App.Environments) == 0 || r.App.Environments[0] == nil || r.App.Environments[0].EdgeWorkers == nil {
			return nil, errInvalidRead
		}
		for _, f := range r.App.Environments[0].EdgeWorkers {
			if f == nil {
				return nil, errInvalidRead
			}
			if f.Name == name {
				w := workerFromFields(f.EdgeWorkerFields)
				w.Source = f.Source
				return &w, nil
			}
		}
		return nil, nil
	}
	r, err := gql.EdgeWorkerDetail(ctx, a.Client, appID, envID)
	if err != nil {
		return nil, apiError(err)
	}
	if r == nil || r.App == nil || len(r.App.Environments) == 0 || r.App.Environments[0] == nil || r.App.Environments[0].EdgeWorkers == nil {
		return nil, errInvalidRead
	}
	for _, f := range r.App.Environments[0].EdgeWorkers {
		if f == nil {
			return nil, errInvalidRead
		}
		if f.Name == name {
			w := workerFromFields(f.EdgeWorkerFields)
			return &w, nil
		}
	}
	return nil, nil
}

func missingResult(operation string) error { return fmt.Errorf("%s returned no result.", operation) }

func (a APIClient) Create(ctx context.Context, envID int64, input WriteInput) (Worker, error) {
	r, err := gql.CreateEdgeWorker(gql.WithAllowGQLErrors(ctx), a.Client, &edgeworkerinput.Create{EnvironmentID: envID, Fields: input})
	if err != nil {
		return Worker{}, apiError(err)
	}
	if r == nil || r.CreateEdgeWorker == nil {
		return Worker{}, missingResult("createEdgeWorker")
	}
	return workerFromFields(r.CreateEdgeWorker.EdgeWorkerFields), nil
}

func (a APIClient) Update(ctx context.Context, envID, workerID int64, input WriteInput) (Worker, error) {
	r, err := gql.UpdateEdgeWorker(gql.WithAllowGQLErrors(ctx), a.Client, &edgeworkerinput.Update{EnvironmentID: envID, EdgeWorkerID: workerID, Fields: input})
	if err != nil {
		return Worker{}, apiError(err)
	}
	if r == nil || r.UpdateEdgeWorker == nil {
		return Worker{}, missingResult("updateEdgeWorker")
	}
	return workerFromFields(r.UpdateEdgeWorker.EdgeWorkerFields), nil
}

func (a APIClient) SetActive(ctx context.Context, envID, workerID int64, active bool) (Worker, error) {
	r, err := gql.SetEdgeWorkerActive(gql.WithAllowGQLErrors(ctx), a.Client, &gql.SetEdgeWorkerActiveInput{EnvironmentId: envID, EdgeWorkerId: workerID, Active: active})
	if err != nil {
		return Worker{}, apiError(err)
	}
	if r == nil || r.SetEdgeWorkerActive == nil {
		return Worker{}, missingResult("setEdgeWorkerActive")
	}
	return workerFromFields(r.SetEdgeWorkerActive.EdgeWorkerFields), nil
}

func (a APIClient) Delete(ctx context.Context, envID, workerID int64) error {
	r, err := gql.DeleteEdgeWorker(gql.WithAllowGQLErrors(ctx), a.Client, &gql.DeleteEdgeWorkerInput{EnvironmentId: envID, EdgeWorkerId: workerID})
	if err != nil {
		return apiError(err)
	}
	if r == nil || r.DeleteEdgeWorker == nil || !*r.DeleteEdgeWorker {
		return errors.New("deleteEdgeWorker did not confirm deletion.")
	}
	return nil
}

func (a APIClient) Validate(ctx context.Context, envID int64, binary string) (ValidationResult, error) {
	r, err := gql.ValidateEdgeWorker(gql.WithAllowGQLErrors(ctx), a.Client, &gql.ValidateEdgeWorkerInput{EnvironmentId: envID, WasmBinary: binary})
	if err != nil {
		return ValidationResult{}, apiError(err)
	}
	if r == nil || r.ValidateEdgeWorker == nil {
		return ValidationResult{}, missingResult("validateEdgeWorker")
	}
	v := r.ValidateEdgeWorker
	return ValidationResult{Valid: v.Valid, Phases: phaseStrings(v.Phases), Errors: v.Errors}, nil
}
