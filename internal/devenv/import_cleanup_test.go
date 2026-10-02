package devenv

import (
	"context"
	"errors"
	"strings"
	"testing"
)

type sanitationRunner struct {
	fakeImportRunner
	events []string
	fail   bool
}

func (r *sanitationRunner) Compose(ctx context.Context, slug string, args ...string) error {
	event := strings.Join(args, " ")
	r.events = append(r.events, event)
	if strings.Contains(event, "php /dev-tools/import-cleanup.php") && r.fail {
		return errors.New("cleanup failed")
	}
	return r.fakeImportRunner.Compose(ctx, slug, args...)
}

func TestImportSanitizesBeforeWordPress(t *testing.T) {
	for _, fail := range []bool{false, true} {
		t.Run(map[bool]string{false: "success", true: "failure"}[fail], func(t *testing.T) {
			seedImportEnv(t)
			r := &sanitationRunner{fail: fail}
			err := importSQL(context.Background(), r, "e", writeDump(t), ImportOptions{Quiet: true})
			events := strings.Join(r.events, "\n")
			if fail {
				if err == nil || !strings.Contains(err.Error(), "credential cleanup attempt failed") {
					t.Fatalf("error = %v", err)
				}
				if strings.Contains(events, "cache flush") || strings.Contains(events, "dev-env-add-admin") {
					t.Fatalf("bootstrapped after failure: %s", events)
				}
			} else if err != nil {
				t.Fatal(err)
			}
			sanitize := strings.Index(events, "php /dev-tools/import-cleanup.php")
			if sanitize < 0 {
				t.Fatalf("no sanitation: %s", events)
			}
			if first := strings.Index(events, "cache flush"); first >= 0 && first < sanitize {
				t.Fatalf("too late: %s", events)
			}
		})
	}
}

func TestMyDumperSanitizesBeforeSearchReplace(t *testing.T) {
	for _, fail := range []bool{false, true} {
		seedImportEnv(t)
		r := &sanitationRunner{fail: fail}
		err := importMyDumperDump(context.Background(), r, "e", writeDump(t), "wordpress", ImportOptions{SearchReplace: []string{"old,new"}})
		events := strings.Join(r.events, "\n")
		sanitize, search := strings.Index(events, "php /dev-tools/import-cleanup.php"), strings.Index(events, "search-replace")
		if sanitize < 0 {
			t.Fatalf("no sanitation: %s", events)
		}
		if fail {
			if err == nil || search >= 0 {
				t.Fatalf("bootstrapped after failure: %v %s", err, events)
			}
		} else if err != nil || search < sanitize {
			t.Fatalf("order: %v %s", err, events)
		}
	}
}
