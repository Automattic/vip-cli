package edgeworkers

import (
	"context"
	"errors"
	"reflect"
	"testing"
)

type recordingAPI struct {
	API
	calls     []string
	remote    []Worker
	inputs    []WriteInput
	failName  string
	enableErr error
	valid     bool
}

func (a *recordingAPI) List(context.Context, int64, int64) ([]Worker, error) {
	a.calls = append(a.calls, "list")
	return a.remote, nil
}
func (a *recordingAPI) Validate(_ context.Context, _ int64, binary string) (ValidationResult, error) {
	a.calls = append(a.calls, "validate:"+binary)
	return ValidationResult{Valid: a.valid, Phases: []string{"on_client_response"}}, nil
}
func (a *recordingAPI) Create(_ context.Context, _ int64, in WriteInput) (Worker, error) {
	a.calls = append(a.calls, "create:"+in.Name)
	a.inputs = append(a.inputs, in)
	if in.Name == a.failName {
		return Worker{}, errors.New("upload failed")
	}
	return Worker{ID: 9, Name: in.Name}, nil
}
func (a *recordingAPI) Update(_ context.Context, _ int64, id int64, in WriteInput) (Worker, error) {
	a.calls = append(a.calls, "update:"+in.Name)
	a.inputs = append(a.inputs, in)
	for _, w := range a.remote {
		if w.ID == id {
			return w, nil
		}
	}
	return Worker{ID: id, Name: in.Name}, nil
}
func (a *recordingAPI) SetActive(_ context.Context, _, _ int64, active bool) (Worker, error) {
	a.calls = append(a.calls, "enable")
	return Worker{ID: 9, Active: active}, a.enableErr
}

type buildFunc func(context.Context, string, LocalWorker) (Artifact, error)

func (f buildFunc) Build(c context.Context, p string, w LocalWorker) (Artifact, error) {
	return f(c, p, w)
}

func TestApplyStopsAfterEnableFailure(t *testing.T) {
	api := &recordingAPI{enableErr: errors.New("timeout")}
	s := Service{API: api}
	items := []PlanItem{{Action: "create", Worker: LocalWorker{Manifest: Manifest{Name: "a"}}, Input: WriteInput{Name: "a"}, EnableAfterDeploy: true}, {Action: "create", Worker: LocalWorker{Manifest: Manifest{Name: "b"}}, Input: WriteInput{Name: "b"}}}
	err := s.ApplyPlan(context.Background(), 7, items, nil)
	var partial *ApplyError
	if !errors.As(err, &partial) {
		t.Fatalf("error %v", err)
	}
	if !reflect.DeepEqual(api.calls, []string{"create:a", "enable"}) {
		t.Fatalf("calls %v", api.calls)
	}
	if partial.Stage != "enable" || !partial.UploadCompleted || partial.ActiveAfterUpload == nil || *partial.ActiveAfterUpload || !reflect.DeepEqual(partial.UnappliedNames, []string{"b"}) {
		t.Fatalf("partial %#v", partial)
	}
	api = &recordingAPI{failName: "b"}
	items = append(items, PlanItem{Worker: LocalWorker{Manifest: Manifest{Name: "c"}}})
	items[0].EnableAfterDeploy = false
	s.API = api
	err = s.ApplyPlan(context.Background(), 7, items, nil)
	if !errors.As(err, &partial) || !reflect.DeepEqual(partial.AppliedNames, []string{"a"}) || !reflect.DeepEqual(partial.UnappliedNames, []string{"c"}) || partial.Stage != "upload" {
		t.Fatalf("partial %#v %v", partial, err)
	}
}

func TestPrepareAllBeforeMutations(t *testing.T) {
	for _, validationFailure := range []bool{false, true} {
		t.Run(map[bool]string{true: "validation", false: "compile"}[validationFailure], func(t *testing.T) {
			api := &recordingAPI{valid: !validationFailure}
			count := 0
			s := Service{API: api, Builder: buildFunc(func(_ context.Context, _ string, w LocalWorker) (Artifact, error) {
				count++
				if count == 2 && !validationFailure {
					return Artifact{}, errors.New("compile failed")
				}
				return Artifact{Base64: w.Manifest.Name}, nil
			})}
			items, err := s.PreparePlan(context.Background(), PlanOptions{Workers: []LocalWorker{{Manifest: Manifest{Name: "a"}}, {Manifest: Manifest{Name: "b"}}}, SkipSource: true})
			if err == nil || items != nil {
				t.Fatalf("plan %v error %v", items, err)
			}
			for _, call := range api.calls {
				if call != "list" && call != "validate:a" {
					t.Fatalf("unexpected persistent operation: %v", api.calls)
				}
			}
		})
	}
}

func TestPreparePresenceAndActiveState(t *testing.T) {
	dir := t.TempDir()
	writeTestFile(t, dir, "source.ts", "")
	current := &Location{Operator: "contains", Value: "/old"}
	proposed := &Location{Operator: "equals", Value: "/new"}
	for _, existing := range []bool{false, true} {
		for _, active := range []bool{false, true} {
			for _, enable := range []bool{false, true} {
				for _, skipSource := range []bool{false, true} {
					for _, location := range []LocationValue{{}, {Present: true}, {Present: true, Value: proposed}} {
						api := &recordingAPI{valid: true}
						if existing {
							api.remote = []Worker{{ID: 4, Name: "a", Active: active, Location: current}}
						}
						s := Service{API: api, Builder: buildFunc(func(context.Context, string, LocalWorker) (Artifact, error) {
							return Artifact{Base64: "binary", SizeBytes: 6}, nil
						})}
						items, err := s.PreparePlan(context.Background(), PlanOptions{Workers: []LocalWorker{{Dir: dir, Manifest: Manifest{Name: "a", Entry: "source.ts", Location: location}}}, Enable: enable, SkipSource: skipSource})
						if err != nil || len(items) != 1 {
							t.Fatalf("plan %v %v", items, err)
						}
						item := items[0]
						if item.IntendedActive != (enable || existing && active) || item.EnableAfterDeploy != enable || item.Validation != "passed" {
							t.Fatalf("plan %#v", item)
						}
						wantLocation := location.Value
						if existing && !location.Present {
							wantLocation = current
						}
						if !reflect.DeepEqual(item.ProposedLocation, wantLocation) {
							t.Fatalf("scope %#v", item)
						}
						if (item.Input.Source == nil) != skipSource || item.Input.Source != nil && *item.Input.Source != "" {
							t.Fatalf("source %#v", item.Input)
						}
						mode := "store"
						if skipSource {
							mode = "omit"
							if existing {
								mode = "preserve"
							}
						}
						if item.SourceMode != mode {
							t.Fatalf("mode %s", item.SourceMode)
						}
						if err := s.ApplyPlan(context.Background(), 7, items, nil); err != nil {
							t.Fatal(err)
						}
						wantEnable := enable && !(existing && active)
						gotEnable := api.calls[len(api.calls)-1] == "enable"
						if wantEnable != gotEnable {
							t.Fatalf("enable calls %v", api.calls)
						}
					}
				}
			}
		}
	}
}
