package gql

import "testing"

func TestParseOperationMutation(t *testing.T) {
	body := `{"operationName":"UpdateThing","query":"mutation UpdateThing($x:Int!){updateDefensiveModeStatus(input:{id:$x}){success}}"}`
	op, err := ParseOperationFromBody([]byte(body))
	if err != nil {
		t.Fatalf("ParseOperationFromBody: %v", err)
	}
	if !op.IsMutation {
		t.Error("IsMutation must be true")
	}
	if op.PrimaryFieldName != "updateDefensiveModeStatus" {
		t.Errorf("PrimaryFieldName = %q, want updateDefensiveModeStatus", op.PrimaryFieldName)
	}
	if op.OperationName != "UpdateThing" {
		t.Errorf("OperationName = %q", op.OperationName)
	}
}

func TestParseOperationQuery(t *testing.T) {
	body := `{"operationName":"Me","query":"query Me{me{id displayName}}"}`
	op, err := ParseOperationFromBody([]byte(body))
	if err != nil {
		t.Fatalf("ParseOperationFromBody: %v", err)
	}
	if op.IsMutation {
		t.Error("IsMutation must be false for a query")
	}
}

func TestParseOperationAnonymousMutation(t *testing.T) {
	body := `{"query":"mutation{updateDefensiveModeStatus(input:{}){success}}"}`
	op, err := ParseOperationFromBody([]byte(body))
	if err != nil {
		t.Fatalf("ParseOperationFromBody: %v", err)
	}
	if !op.IsMutation {
		t.Error("IsMutation must be true")
	}
	if op.PrimaryFieldName != "updateDefensiveModeStatus" {
		t.Errorf("PrimaryFieldName = %q", op.PrimaryFieldName)
	}
}

func TestParseOperationMalformedBody(t *testing.T) {
	_, err := ParseOperationFromBody([]byte("not json"))
	if err == nil {
		t.Error("expected error on malformed body")
	}
}

func TestParseOperationMalformedQuery(t *testing.T) {
	body := `{"query":"mutation { broken"}`
	_, err := ParseOperationFromBody([]byte(body))
	if err == nil {
		t.Error("expected error on malformed GraphQL")
	}
}
