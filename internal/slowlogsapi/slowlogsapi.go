// Package slowlogsapi wraps the GetAppSlowlogs genqlient operation behind
// a flat Go-friendly surface. The schema field is
// `AppEnvironment.slowlogs(limit, after)` and returns
// `AppEnvironmentSlowlogsList` (`nodes`, `nextCursor`,
// `pollingDelaySeconds`).
//
// Node parity: src/lib/app-slowlogs/app-slowlogs.ts (getRecentSlowlogs).
// The reflection walker matches internal/logsapi but yields a richer row
// shape: timestamp, rowsSent, rowsExamined, queryTime, requestUri, query.
package slowlogsapi

import (
	"context"
	"reflect"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/gql"
)

// LIMIT_MAX is the server-side ceiling for the `limit` argument on the
// slowlogs query. Node's vip-slowlogs.ts uses 500 as the validation cap
// (vs 5000 for runtime logs); slowlogs are intentionally smaller-batched
// to keep the MySQL slow-query window manageable.
const LIMIT_MAX = 500

// SlowlogNode is one slow-query log line. All fields are strings on the
// wire (the schema exposes them as String, including rowsSent/rowsExamined
// which are numeric in MySQL but serialized as text to preserve bigint
// precision).
type SlowlogNode struct {
	Timestamp    string
	RowsSent     string
	RowsExamined string
	QueryTime    string
	RequestUri   string
	Query        string
}

// Page is a single response page from the slowlogs endpoint.
type Page struct {
	Nodes               []SlowlogNode
	NextCursor          *string
	PollingDelaySeconds int
}

// RecentSlowlogs runs GetAppSlowlogs and flattens the response. Validation
// (limit bounds, format allow-list) lives at the command-line layer to
// match Node's exact error wording.
func RecentSlowlogs(ctx context.Context, c graphql.Client, appID, envID int64, limit int, after *string) (*Page, error) {
	resp, err := gql.GetAppSlowlogs(ctx, c, appID, envID, int64(limit), after)
	if err != nil {
		return nil, err
	}
	return reflectSlowlogsResponse(resp), nil
}

// reflectSlowlogsResponse mirrors logsapi.reflectLogsResponse but pulls
// the six slowlog-specific fields from each node. Same defensive shape:
// returns an empty Page on any missing parent field.
func reflectSlowlogsResponse(v any) *Page {
	p := &Page{Nodes: []SlowlogNode{}}
	rv := reflect.ValueOf(v)
	for rv.Kind() == reflect.Ptr {
		if rv.IsNil() {
			return p
		}
		rv = rv.Elem()
	}
	if rv.Kind() != reflect.Struct {
		return p
	}
	app := rv.FieldByName("App")
	for app.Kind() == reflect.Ptr {
		if app.IsNil() {
			return p
		}
		app = app.Elem()
	}
	if !app.IsValid() || app.Kind() != reflect.Struct {
		return p
	}
	envs := app.FieldByName("Environments")
	if !envs.IsValid() || envs.Kind() != reflect.Slice || envs.Len() == 0 {
		return p
	}
	env := envs.Index(0)
	for env.Kind() == reflect.Ptr {
		if env.IsNil() {
			return p
		}
		env = env.Elem()
	}
	if env.Kind() != reflect.Struct {
		return p
	}
	sl := env.FieldByName("Slowlogs")
	for sl.Kind() == reflect.Ptr {
		if sl.IsNil() {
			return p
		}
		sl = sl.Elem()
	}
	if !sl.IsValid() || sl.Kind() != reflect.Struct {
		return p
	}
	if nc := sl.FieldByName("NextCursor"); nc.IsValid() {
		switch nc.Kind() {
		case reflect.Ptr:
			if !nc.IsNil() {
				s := nc.Elem().String()
				p.NextCursor = &s
			}
		case reflect.String:
			s := nc.String()
			p.NextCursor = &s
		}
	}
	if pd := sl.FieldByName("PollingDelaySeconds"); pd.IsValid() {
		switch pd.Kind() {
		case reflect.Ptr:
			if !pd.IsNil() {
				p.PollingDelaySeconds = int(pd.Elem().Int())
			}
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			p.PollingDelaySeconds = int(pd.Int())
		}
	}
	nodes := sl.FieldByName("Nodes")
	if !nodes.IsValid() || nodes.Kind() != reflect.Slice {
		return p
	}
	for i := 0; i < nodes.Len(); i++ {
		n := nodes.Index(i)
		for n.Kind() == reflect.Ptr {
			if n.IsNil() {
				n = reflect.Value{}
				break
			}
			n = n.Elem()
		}
		if !n.IsValid() || n.Kind() != reflect.Struct {
			continue
		}
		var item SlowlogNode
		item.Timestamp = readStringField(n, "Timestamp")
		item.RowsSent = readStringField(n, "RowsSent")
		item.RowsExamined = readStringField(n, "RowsExamined")
		item.QueryTime = readStringField(n, "QueryTime")
		item.RequestUri = readStringField(n, "RequestUri")
		item.Query = readStringField(n, "Query")
		p.Nodes = append(p.Nodes, item)
	}
	return p
}

// readStringField yields the string value of a struct field that may be
// either `string` or `*string` (genqlient emits either depending on
// nullability + use_struct_references). Missing or nil pointer fields
// return "".
func readStringField(rv reflect.Value, name string) string {
	f := rv.FieldByName(name)
	if !f.IsValid() {
		return ""
	}
	switch f.Kind() {
	case reflect.Ptr:
		if f.IsNil() {
			return ""
		}
		return f.Elem().String()
	case reflect.String:
		return f.String()
	}
	return ""
}
