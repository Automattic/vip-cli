package edgeworkerinput

import (
	json "encoding/json/v2"
	"reflect"
	"testing"
)

func TestWriteFieldPresence(t *testing.T) {
	empty, failure := "", "error"
	for _, tc := range []struct {
		name      string
		location  LocationValue
		source    *string
		onFailure *string
		want      map[string]any
	}{
		{"omitted", LocationValue{}, nil, nil, map[string]any{}},
		{"clear location", LocationValue{Present: true}, nil, nil, map[string]any{"location": nil}},
		{"replace location", LocationValue{Present: true, Value: &Location{"starts_with", "/api/"}}, nil, nil, map[string]any{"location": map[string]any{"operator": "starts_with", "value": "/api/"}}},
		{"empty source", LocationValue{}, &empty, nil, map[string]any{"source": ""}},
		{"failure policy", LocationValue{}, nil, &failure, map[string]any{"onFailure": "error"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			fields := Fields{Name: "headers", WASMBinary: "AGFzbQ==", Location: tc.location, Source: tc.source, OnFailure: tc.onFailure}
			for _, update := range []bool{false, true} {
				var input any = Create{EnvironmentID: 7, Fields: fields}
				want := map[string]any{"environmentId": float64(7), "name": "headers", "wasmBinary": "AGFzbQ=="}
				for k, v := range tc.want {
					if k != "location" || update || v != nil {
						want[k] = v
					}
				}
				if update {
					input = Update{EnvironmentID: 7, EdgeWorkerID: 9, Fields: fields}
					want["edgeWorkerId"] = float64(9)
				}
				data, err := json.Marshal(input)
				if err != nil {
					t.Fatal(err)
				}
				var got map[string]any
				if err := json.Unmarshal(data, &got); err != nil {
					t.Fatal(err)
				}
				if !reflect.DeepEqual(got, want) {
					t.Fatalf("update=%v: got %s, want %#v", update, data, want)
				}
			}
		})
	}
}
