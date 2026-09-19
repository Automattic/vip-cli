package edgeworkers

import (
	"context"
	"errors"
	"fmt"
	"strings"
)

type ArtifactBuilder interface {
	Build(context.Context, string, LocalWorker) (Artifact, error)
}
type Service struct {
	API     API
	Builder ArtifactBuilder
}
type PlanOptions struct {
	AppID, EnvID                                int64
	ProjectDir                                  string
	Workers                                     []LocalWorker
	SkipBuild, SkipValidate, SkipSource, Enable bool
}
type PlanItem struct {
	Action                            string
	Worker                            LocalWorker
	Existing                          *Worker
	Artifact                          Artifact
	Validation                        string
	Phases                            []string
	Input                             WriteInput
	CurrentLocation, ProposedLocation *Location
	SourceMode                        string
	EnableAfterDeploy, IntendedActive bool
}
type ApplyError struct {
	AppliedNames      []string
	FailedName        string
	UnappliedNames    []string
	Cause             error
	Stage             string
	UploadCompleted   bool
	ActiveAfterUpload *bool
}

func (e *ApplyError) Error() string {
	if e.Cause != nil {
		return e.Cause.Error()
	}
	return "Deployment failed."
}
func (e *ApplyError) Unwrap() error { return e.Cause }

func (s Service) PreparePlan(ctx context.Context, opts PlanOptions) ([]PlanItem, error) {
	remote, err := s.API.List(ctx, opts.AppID, opts.EnvID)
	if err != nil {
		return nil, err
	}
	byName := map[string]*Worker{}
	for i := range remote {
		byName[remote[i].Name] = &remote[i]
	}
	items := make([]PlanItem, 0, len(opts.Workers))
	for _, w := range opts.Workers {
		item := PlanItem{Action: "create", Worker: w, Existing: byName[w.Manifest.Name], Validation: "skipped", Phases: []string{}, SourceMode: "store", EnableAfterDeploy: opts.Enable, IntendedActive: opts.Enable}
		if opts.SkipBuild {
			item.Artifact, err = ReadPrebuilt(opts.ProjectDir, w)
		} else if s.Builder != nil {
			item.Artifact, err = s.Builder.Build(ctx, opts.ProjectDir, w)
		} else {
			return nil, errors.New("No worker compiler configured.")
		}
		if err != nil {
			return nil, err
		}
		if !opts.SkipValidate {
			result, e := s.API.Validate(ctx, opts.EnvID, item.Artifact.Base64)
			if e != nil {
				return nil, e
			}
			if !result.Valid {
				details := strings.Join(result.Errors, "; ")
				if details == "" {
					details = "unknown error"
				}
				return nil, fmt.Errorf("worker \"%s\" failed validation: %s", w.Manifest.Name, details)
			}
			item.Validation = "passed"
			item.Phases = result.Phases
		}
		item.Input = WriteInput{Name: w.Manifest.Name, WASMBinary: item.Artifact.Base64, OnFailure: w.Manifest.OnFailure, Location: w.Manifest.Location}
		if !opts.SkipSource {
			source, e := ReadWorkerSource(w)
			if e != nil {
				return nil, e
			}
			item.Input.Source = &source
		} else {
			item.SourceMode = "omit"
		}
		item.ProposedLocation = w.Manifest.Location.Value
		if item.Existing != nil {
			item.Action = "update"
			item.CurrentLocation = item.Existing.Location
			item.IntendedActive = opts.Enable || item.Existing.Active
			if !w.Manifest.Location.Present {
				item.ProposedLocation = item.CurrentLocation
			}
			if opts.SkipSource {
				item.SourceMode = "preserve"
			}
		} else if item.Input.Location.Value == nil {
			item.Input.Location = LocationValue{}
		}
		items = append(items, item)
	}
	return items, nil
}

func newApplyError(items []PlanItem, index int, applied []string, stage string, uploaded bool, active *bool, cause error) *ApplyError {
	e := &ApplyError{AppliedNames: append([]string{}, applied...), FailedName: items[index].Worker.Manifest.Name, UnappliedNames: []string{}, Stage: stage, UploadCompleted: uploaded, ActiveAfterUpload: active, Cause: cause}
	for _, item := range items[index+1:] {
		e.UnappliedNames = append(e.UnappliedNames, item.Worker.Manifest.Name)
	}
	return e
}
func (s Service) ApplyPlan(ctx context.Context, envID int64, items []PlanItem, onApplied func(PlanItem, Worker) error) error {
	applied := []string{}
	for i, item := range items {
		var result Worker
		var err error
		if item.Action == "create" {
			result, err = s.API.Create(ctx, envID, item.Input)
		} else if item.Existing == nil {
			err = fmt.Errorf("Update plan for \"%s\" has no existing worker.", item.Worker.Manifest.Name)
		} else {
			result, err = s.API.Update(ctx, envID, item.Existing.ID, item.Input)
		}
		if err != nil {
			return newApplyError(items, i, applied, "upload", false, nil, err)
		}
		if item.EnableAfterDeploy && !result.Active {
			active := result.Active
			result, err = s.API.SetActive(ctx, envID, result.ID, true)
			if err != nil {
				return newApplyError(items, i, applied, "enable", true, &active, err)
			}
		}
		applied = append(applied, item.Worker.Manifest.Name)
		if onApplied != nil {
			if err := onApplied(item, result); err != nil {
				return err
			}
		}
	}
	return nil
}
