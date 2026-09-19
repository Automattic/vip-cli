// Package logsapi wraps the GetAppLogs genqlient operation behind a flat
// Go-friendly surface. The schema field is `AppEnvironment.logs(type,
// limit, after)` and returns `AppEnvironmentLogsList` (`nodes`,
// `nextCursor`, `pollingDelaySeconds`).
//
// The Node parity source is src/lib/app-logs/app-logs.ts (getRecentLogs).
//
// We walk the genqlient response via reflection — mirroring the envvar
// package — so callers don't need to know the deeply-nested generated
// type names (e.g. GetAppLogsAppEnvironmentsAppEnvironmentLogsAppEnvironmentLogsList).
package logsapi

import (
	"context"
	"reflect"

	"github.com/Khan/genqlient/graphql"

	"github.com/Automattic/vip/internal/gql"
)

// LIMIT_MAX is the server-side ceiling for the `limit` argument on the
// logs query. Mirrors Node's app-logs.ts export. Callers (the polling
// loop in particular) use this as the cap on subsequent fetches.
const LIMIT_MAX = 5000

// LogNode is one log line: a timestamp + message.
type LogNode struct {
	Timestamp string
	Message   string
}

// Page is a single response page from the logs endpoint.
type Page struct {
	Nodes               []LogNode
	NextCursor          *string
	PollingDelaySeconds int
}

// RecentLogs runs GetAppLogs and flattens the response into a Page. The
// logType must be one of `app` or `batch` — validation lives at the
// command-line layer to match Node's exact error wording.
func RecentLogs(ctx context.Context, c graphql.Client, appID, envID int64, logType string, limit int, after *string) (*Page, error) {
	resp, err := gql.GetAppLogs(ctx, c, appID, envID, gql.AppEnvironmentLogType(logType), int64(limit), after)
	if err != nil {
		return nil, err
	}
	return reflectLogsResponse(resp), nil
}

// reflectLogsResponse walks app → environments[0] → logs → {nodes,
// nextCursor, pollingDelaySeconds}. Uses reflection to avoid coupling
// to genqlient's verbose generated type names (which change whenever
// the operation shape changes). Returns an empty Page (non-nil) on any
// missing field — the command layer treats len(Nodes)==0 as the
// "no logs found" case.
func reflectLogsResponse(v any) *Page {
	p := &Page{Nodes: []LogNode{}}
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
	logs := env.FieldByName("Logs")
	for logs.Kind() == reflect.Ptr {
		if logs.IsNil() {
			return p
		}
		logs = logs.Elem()
	}
	if !logs.IsValid() || logs.Kind() != reflect.Struct {
		return p
	}
	if nc := logs.FieldByName("NextCursor"); nc.IsValid() {
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
	if pd := logs.FieldByName("PollingDelaySeconds"); pd.IsValid() {
		switch pd.Kind() {
		case reflect.Ptr:
			if !pd.IsNil() {
				p.PollingDelaySeconds = int(pd.Elem().Int())
			}
		case reflect.Int, reflect.Int8, reflect.Int16, reflect.Int32, reflect.Int64:
			p.PollingDelaySeconds = int(pd.Int())
		}
	}
	nodes := logs.FieldByName("Nodes")
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
		var item LogNode
		if f := n.FieldByName("Timestamp"); f.IsValid() {
			switch f.Kind() {
			case reflect.Ptr:
				if !f.IsNil() {
					item.Timestamp = f.Elem().String()
				}
			case reflect.String:
				item.Timestamp = f.String()
			}
		}
		if f := n.FieldByName("Message"); f.IsValid() {
			switch f.Kind() {
			case reflect.Ptr:
				if !f.IsNil() {
					item.Message = f.Elem().String()
				}
			case reflect.String:
				item.Message = f.String()
			}
		}
		p.Nodes = append(p.Nodes, item)
	}
	return p
}
