package sqlvalidation

import (
	"os"
	"strings"
	"testing"
)

func TestOptionsInsertFiltering(t *testing.T) {
	input := "INSERT INTO wp_postmeta VALUES (1, 'home', 'https://wrong.example');\n" +
		"INSERT INTO wp_posts VALUES (1); /*\n" +
		"INSERT INTO wp_options VALUES (1, 'home', 'https://comment.example');\n*/\n" +
		"REPLACE INTO `db`.`wp_2_options`\n (`option_value`,\n `option_name`) VALUES\n" +
		"('https://first.example', 'SITEURL'),\n" +
		"('ending\\'', 'blogdescription'), ('https://second.example/#fragment', 'home');\n" +
		"INSERT INTO wp_options (option_name, option_value) VALUES ('blogdescription', 'first line;\n" +
		"second line'),\n('home', 'https://third.example');\n" +
		"INSERT INTO wp_options VALUE (1, 'home', '/relative');\n"
	res, err := ValidateWith(strings.NewReader(input), devEnvOptions("local.test"), nil)
	if err != nil {
		t.Fatal(err)
	}
	info := findCheck(t, res, "siteHomeUrl").Results
	want := []string{"siteurl https://first.example", "home https://second.example/#fragment", "home https://third.example"}
	if len(info) != len(want) {
		t.Fatalf("got %#v; want %v", info, want)
	}
	for i := range want {
		if info[i].Text != want[i] {
			t.Errorf("result %d = %q; want %q", i, info[i].Text, want[i])
		}
	}
	if got := findCheck(t, res, CheckSiteHomeURLLando).Results; len(got) != len(want) {
		t.Errorf("lando results = %#v", got)
	}
}

func TestOptionsInsertDevEnvFixture(t *testing.T) {
	file, err := os.Open("../../__fixtures__/validations/bad-sql-dev-env.sql")
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	res, err := ValidateWith(file, devEnvOptions("test.domain"), nil)
	if err != nil {
		t.Fatal(err)
	}
	var text strings.Builder
	for _, result := range findCheck(t, res, CheckSiteHomeURLLando).Results {
		if !result.FalsePositive {
			text.WriteString(result.Recommendation + "\n")
		}
	}
	for _, domain := range []string{"full-order.example", "singular-default.example", "split-header.example", "multi-line-columns.example", "multi-line-tuple.example", "escaped-quote.example/#fragment", "after-semicolon.example", "after-multiline-quote.example/#fragment", "after-unrelated-multiline.example"} {
		if !strings.Contains(text.String(), domain) {
			t.Errorf("missing %s", domain)
		}
	}
	for _, domain := range []string{"unrelated-table.example", "embedded.example", "commented-insert.example", "non-options-comment.example", "trailing-clause.example", "embedded-multiline.example"} {
		if strings.Contains(text.String(), domain) {
			t.Errorf("unexpected %s", domain)
		}
	}
}
