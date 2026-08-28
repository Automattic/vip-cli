// Package edgeworkerinput preserves omitted, null, and empty write values.
// It is independent of the generated client, which binds its mutation inputs here.
package edgeworkerinput

import json "encoding/json/v2"

type Location struct {
	Operator string `json:"operator"`
	Value    string `json:"value"`
}

type LocationValue struct {
	Present bool
	Value   *Location
}

type Fields struct {
	Name       string
	WASMBinary string
	Location   LocationValue
	OnFailure  *string
	Source     *string
}

type Create struct {
	EnvironmentID int64
	Fields
}

type Update struct {
	EnvironmentID int64
	EdgeWorkerID  int64
	Fields
}

func fieldsMap(envID int64, f Fields, update bool) map[string]any {
	out := map[string]any{"environmentId": envID, "name": f.Name, "wasmBinary": f.WASMBinary}
	if f.OnFailure != nil {
		out["onFailure"] = *f.OnFailure
	}
	if f.Source != nil {
		out["source"] = *f.Source
	}
	if f.Location.Present && (update || f.Location.Value != nil) {
		out["location"] = f.Location.Value
	}
	return out
}

func (in Create) MarshalJSON() ([]byte, error) {
	return json.Marshal(fieldsMap(in.EnvironmentID, in.Fields, false))
}

func (in Update) MarshalJSON() ([]byte, error) {
	out := fieldsMap(in.EnvironmentID, in.Fields, true)
	out["edgeWorkerId"] = in.EdgeWorkerID
	return json.Marshal(out)
}
