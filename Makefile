# vip-next Makefile

GO           ?= go
GOFLAGS      ?=
LDFLAGS   := -s -w \
             -X github.com/Automattic/vip/internal/version.Version=$(shell GOFLAGS=-mod=mod $(GO) run ./cmd/stamp-version) \
             -X github.com/Automattic/vip/internal/version.Commit=$(shell git rev-parse --short HEAD 2>/dev/null || echo unknown)

BIN_DIR   := bin
BIN_NAME  := vip-next

# The Node CLI entrypoint the differential parity scenario diffs vip-next
# against. It is a BUILT artifact (`npm ci && npm run build`); when it is
# absent the scenario skips with a banner naming what is missing rather than
# failing a developer who has no node_modules.
NODE_VIP_BIN ?= $(CURDIR)/dist/bin/vip.js

.PHONY: build search-replace-bin test test-parity test-parity-unit test-parity-unit-hostile lint tidy tidy-gql verify-gql-stale clean node-vip-bin-status require-node-vip-bin

build:
	mkdir -p $(BIN_DIR)
	CGO_ENABLED=0 $(GO) build -buildvcs=false -trimpath -ldflags="$(LDFLAGS)" -o $(BIN_DIR)/$(BIN_NAME) ./cmd/vip-next
	@$(MAKE) --no-print-directory search-replace-bin

# Bundle the host's go-search-replace binary next to vip-next so `import sql`
# (--search-replace) and `dev-env sync sql` resolve it without a runtime
# download. Uses the real per-platform binaries vendored under __fixtures__;
# proper release-tarball bundling of official binaries is the M8 task.
#
# This FAILS the build on a platform we have no binary for, rather than warning
# and exiting 0. Exiting 0 produced a vip-next that built fine and then died
# only when the user reached `search-replace`, `import sql --search-replace` or
# `dev-env sync sql` — i.e. the discovery moment was moved from `make build` to
# the middle of someone's import. linux/arm64 is the live gap (Graviton, ARM CI,
# Docker on Apple Silicon), and windows/arm64.
#
# Two deliberate escape hatches, because neither case is a broken setup:
#   VIP_SEARCH_REPLACE_BIN=<path>  the user supplied their own binary; that is
#                                  the first entry in searchreplace.ResolveBinary
#                                  and it makes the bundle irrelevant.
#   ALLOW_MISSING_SEARCH_REPLACE=1 the user knowingly wants a build without
#                                  search-replace support.
#
# NOTE: __fixtures__/ is a vendored mirror of Automattic/vip and must stay
# byte-identical to it, so a new architecture CANNOT simply be dropped in there
# — the next sync would revert it. See docs/BUILD-SIGNING.md for the third_party
# plan that fixes this properly.
GSR_DIR := third_party/go-search-replace
GSR_REPO := Automattic/go-search-replace

# Fetch the pinned go-search-replace release into $(GSR_DIR)/<goos>-<goarch>/,
# verifying every file against the sha256 in $(GSR_DIR)/MANIFEST.
#
# Those digests are the SLSA provenance subjects from the upstream release
# (go-search-replace.intoto.jsonl), not values we computed. Upstream ships the
# assets GZIPPED but attests the UNCOMPRESSED binaries, so we gunzip first and
# then hash — verified against release 0.0.11.
#
# Binaries are gitignored; only MANIFEST is tracked. Upgrade by editing
# MANIFEST (tag + digests) then `make vendor-search-replace`.
#
# ALL is the release build's entry point: bundling every platform is what makes
# the shipped tarball self-contained.
vendor-search-replace:
	@if [ -n "$$ALL" ]; then \
		set -- $$(awk '/^(darwin|linux|windows)\//{print $$1}' $(GSR_DIR)/MANIFEST); \
	elif [ -n "$$TARGETS" ]; then \
		set -- $$TARGETS; \
	else \
		set -- "$$($(GO) env GOOS)/$$($(GO) env GOARCH)"; \
	fi; \
	.buildkite/fetch-search-replace.sh "$$@"

search-replace-bin:
	@os=$$($(GO) env GOOS); arch=$$($(GO) env GOARCH); \
	case "$$os/$$arch" in \
		darwin/arm64) f=go-search-replace-test-darwin-arm64;; \
		darwin/amd64) f=go-search-replace-test-darwin-x64;; \
		linux/amd64)  f=go-search-replace-test-linux-x64;; \
		windows/amd64) f=go-search-replace-test-win32-x64.exe;; \
		*) f="";; \
	esac; \
	dest=$(BIN_DIR)/go-search-replace; \
	if [ "$$os" = "windows" ]; then dest=$$dest.exe; fi; \
	vendored=$(GSR_DIR)/$${os}-$${arch}/go-search-replace; \
	if [ "$$os" = "windows" ]; then vendored=$$vendored.exe; fi; \
	src=""; \
	if [ -f "$$vendored" ]; then src=$$vendored; \
	elif [ -n "$$f" ]; then src=__fixtures__/search-replace-binaries/$$f; fi; \
	if [ -n "$$src" ] && [ -f "$$src" ]; then \
		cp "$$src" "$$dest" && chmod +x "$$dest" && echo "bundled go-search-replace -> $$dest (from $$src)"; \
	elif [ -n "$$VIP_SEARCH_REPLACE_BIN" ]; then \
		echo "no bundled go-search-replace for $$os/$$arch; using VIP_SEARCH_REPLACE_BIN=$$VIP_SEARCH_REPLACE_BIN"; \
	elif [ -n "$$ALLOW_MISSING_SEARCH_REPLACE" ]; then \
		echo "WARNING: no go-search-replace for $$os/$$arch; search-replace, import sql --search-replace and dev-env sync sql will fail at runtime (ALLOW_MISSING_SEARCH_REPLACE set)"; \
	else \
		if [ -z "$$f" ]; then \
			echo "ERROR: no bundled go-search-replace for $$os/$$arch." >&2; \
		else \
			echo "ERROR: bundled go-search-replace fixture is missing: $$src" >&2; \
		fi; \
		echo "" >&2; \
		echo "  vip-next would build, then fail at runtime on: search-replace," >&2; \
		echo "  import sql --search-replace, dev-env sync sql." >&2; \
		echo "" >&2; \
		echo "  Fix one of:" >&2; \
		echo "    make vendor-search-replace                  # fetch + verify from upstream" >&2; \
		echo "    VIP_SEARCH_REPLACE_BIN=/path/to/go-search-replace make build" >&2; \
		echo "    ALLOW_MISSING_SEARCH_REPLACE=1 make build   # build without it" >&2; \
		echo "" >&2; \
		echo "  Pinned release: $(GSR_DIR)/MANIFEST" >&2; \
		exit 1; \
	fi

# Proxy variables are scrubbed for the same reason internal/parity's
# scenarioEnvPinned and BuildParkerEnv scrub them: internal/httpproxy honours
# VIP_PROXY unconditionally and applies no loopback exemption (neither does
# Node's proxy-from-env), so a developer with the VIP SOCKS proxy exported would
# have every httptest server in the suite dialled through it. NO_PROXY is
# cleared too — with it set, the ported coveredInNoProxy suppresses a
# SOCKS_PROXY-only configuration, which would mask a real regression.
# `test-parity-unit-hostile` deliberately does the opposite and is a separate
# target; do not scrub there.
PROXY_SCRUB = VIP_PROXY= vip_proxy= SOCKS_PROXY= socks_proxy= \
              HTTPS_PROXY= https_proxy= HTTP_PROXY= http_proxy= \
              ALL_PROXY= all_proxy= NO_PROXY= no_proxy= VIP_USE_SYSTEM_PROXY=

# The Go package list, discovered rather than hardcoded so a new top-level
# tree is picked up automatically, with node_modules removed.
#
# node_modules matters because CI now runs `npm ci` — the parity job diffs
# vip-next against the built Node CLI. An npm dependency ships real Go source,
# node_modules/flatted/golang/pkg/flatted, which lands inside this module, so a
# bare `./...` compiles and vets third-party Go pulled from the npm registry.
# (Verified on Go 1.27: `go list ./...` does include it.)
#
# The empty guard is not paranoia: `go test` with no package arguments tests
# the current directory and exits 0. A silently-empty list would look exactly
# like a passing suite, which is the failure mode this whole area exists to
# remove.
#
# -buildvcs=false keeps `go list` working when the checkout sits under another
# VCS's working copy.
GO_PKG_LIST = pkgs="$$($(GO) list -buildvcs=false ./... | grep -v '/node_modules/')"; \
              [ -n "$$pkgs" ] || { echo 'go list produced no packages; refusing to report success' >&2; exit 1; }

test:
	@$(GO_PKG_LIST); \
	$(PROXY_SCRUB) $(GO) test $$pkgs

# The three host checks that decide whether the Node CLI can be executed.
# Shared verbatim by the warn-only and the fail-hard targets below so the two
# can never disagree about what "ready" means. Mirrors ResolveNodeVipBin in
# internal/parity/nodebin.go (see the comment on LoudSkip for why the check is
# duplicated in shell at all).
define NODE_VIP_BIN_PROBE
missing=''; \
[ -f "$(NODE_VIP_BIN)" ] || missing="$$missing\n    - $(NODE_VIP_BIN) does not exist; run 'npm run build'"; \
[ -d "$(CURDIR)/node_modules" ] || missing="$$missing\n    - $(CURDIR)/node_modules is absent; run 'npm ci'"; \
command -v node >/dev/null 2>&1 || missing="$$missing\n    - 'node' is not on PATH; install Node 22.19+ (package.json engines)";
endef

# Reports whether the Node CLI can be executed, and if not, exactly what is
# missing. `go test` buffers a passing package's output, so a t.Skip inside the
# suite is invisible without -v — this banner is what keeps a skipped
# differential scenario from looking like a passing one.
#
# This target WARNS and succeeds: a contributor who has never run `npm ci` must
# still be able to run `make test-parity-unit`. CI calls require-node-vip-bin
# instead, which fails.
node-vip-bin-status:
	@$(NODE_VIP_BIN_PROBE) \
	if [ -z "$$missing" ]; then \
	  echo "parity: Node-vs-Go differential coverage ON (NODE_VIP_BIN=$(NODE_VIP_BIN))"; \
	else \
	  printf '\n%s\n' "================================================================================"; \
	  printf '  WARNING: Node-vs-Go differential coverage is OFF.\n'; \
	  printf '  The Node-vs-Go differential scenarios are the ONLY tests that run the real\n'; \
	  printf '  Node CLI; they will SKIP. Every other scenario compares vip-next against a\n'; \
	  printf '  mock.\n'; \
	  printf '  Missing:%b\n' "$$missing"; \
	  printf '%s\n\n' "================================================================================"; \
	fi

# The CI counterpart of node-vip-bin-status: same probe, non-zero exit.
#
# Without this, the failure mode that made the differential worthless is
# invisible and permanent — if dist/ stops being built, every Node-vs-Go
# scenario silently skips and the job still goes green. A skipped differential
# must never be indistinguishable from a passing one in CI.
require-node-vip-bin:
	@$(NODE_VIP_BIN_PROBE) \
	if [ -n "$$missing" ]; then \
	  printf '\n%s\n' "================================================================================"; \
	  printf '  ERROR: the Node CLI cannot be executed, so every Node-vs-Go differential\n'; \
	  printf '  scenario would SKIP. In CI that is a failure, not a degradation.\n'; \
	  printf '  Missing:%b\n' "$$missing"; \
	  printf '%s\n\n' "================================================================================"; \
	  exit 1; \
	fi; \
	echo "parity: Node-vs-Go differential coverage ON (NODE_VIP_BIN=$(NODE_VIP_BIN))"

# Lists the scenarios whose Node-vs-Go divergence has been accepted as
# intentional, straight from the YAML that records the decision.
#
# It exists for the same reason node-vip-bin-status does: `go test` without -v
# discards a PASSING package's output, so the banner the differential writes
# when it meets a blessed divergence is invisible in a green run. A divergence
# nobody ever sees is indistinguishable from parity, and this list is the thing
# a reviewer should be arguing with.
.PHONY: blessed-drift-status
blessed-drift-status:
	@names=$$(grep -l '^expected_drift:' testdata/parity/*.yaml 2>/dev/null | \
	          sed 's|testdata/parity/||; s|\.yaml$$||' | sort); \
	if [ -n "$$names" ]; then \
	  printf 'parity: %s scenario(s) carry an accepted Node-vs-Go divergence:\n' "$$(echo "$$names" | wc -l | tr -d ' ')"; \
	  echo "$$names" | sed 's/^/    - /'; \
	  printf '  Each records its reason and normalized-output signature in testdata/parity/<name>.yaml (expected_drift).\n'; \
	fi

# -count=1 disables the test cache: these scenarios spawn the built binaries
# and read the environment, so a cached "ok" would hide exactly the ambient
# dependence this suite is meant to detect.
test-parity-unit: node-vip-bin-status blessed-drift-status
	NODE_VIP_BIN="$(NODE_VIP_BIN)" \
	$(GO) test -tags=parity -count=1 ./internal/parity/...

# Proof that the fixture suite is ambient-independent (see internal/parity/env.go).
# Exports credentials, an API host, and proxies that would break or falsely
# satisfy scenarios if any of them leaked into a subprocess; results MUST be
# identical to `make test-parity-unit`. Run both after touching the harness.
#
# NODE_VIP_BIN is passed through deliberately: the Node-vs-Go scenario must
# stay ambient-independent too.
test-parity-unit-hostile:
	VIP_TOKEN_OVERRIDE=hostile.ambient.token \
	WPVIP_DEPLOY_TOKEN=hostile-ambient-deploy-token \
	API_HOST=https://hostile.invalid \
	HTTP_PROXY=http://127.0.0.1:9 HTTPS_PROXY=http://127.0.0.1:9 ALL_PROXY=socks5://127.0.0.1:9 \
	http_proxy=http://127.0.0.1:9 https_proxy=http://127.0.0.1:9 all_proxy=socks5://127.0.0.1:9 \
	VIP_PROXY=socks5://127.0.0.1:9 SOCKS_PROXY=socks5://127.0.0.1:9 VIP_USE_SYSTEM_PROXY=1 \
	NODE_ENV=production DO_NOT_TRACK=0 NO_COLOR=1 DEBUG='*' \
	XDG_DATA_HOME=/nonexistent/vip-parity-hostile \
	VIP_SEARCH_REPLACE_BIN=/nonexistent/go-search-replace \
	$(MAKE) --no-print-directory test-parity-unit

test-parity:
	npm run build
	@$(MAKE) --no-print-directory build
	NODE_VIP_BIN="$(NODE_VIP_BIN)" \
	GO_VIP_BIN=$(CURDIR)/bin/vip-next \
	$(GO) test -tags='parity parker_parity' ./internal/parity \
		-run '^TestLocalParkerParity$$' -count=1 -v

lint:
	@$(GO_PKG_LIST); \
	$(GO) vet $$pkgs

tidy:
	$(GO) mod tidy

clean:
	rm -rf $(BIN_DIR)

# Regenerate internal/gql/generated.go from schema.gql + operations/*.graphql.
tidy-gql:
	cd internal/gql && $(GO) run github.com/Khan/genqlient

# Fail if internal/gql/generated.go on disk doesn't match what genqlient
# would produce from schema.gql + operations/*.graphql. The recipe never
# leaves the on-disk file altered: it stashes the contributor's copy to a
# temp file, runs genqlient (which writes to the configured generated.go),
# compares, and ALWAYS restores the stashed copy via a shell trap -- so
# even on errors or interrupts the working tree is left exactly as the
# contributor had it. (genqlient v0.8.1 does not support --output, so we
# can't redirect codegen directly; the trap-based restore is reliable
# because it always uses the saved file, unlike the prior recipe which
# restored from the post-regen file.)
verify-gql-stale:
	@cd internal/gql && \
	  stash=$$(mktemp) && fresh=$$(mktemp) && \
	  trap 'mv -f "$$stash" generated.go 2>/dev/null; rm -f "$$fresh"' EXIT INT TERM HUP; \
	  cp generated.go "$$stash" && \
	  $(GO) run github.com/Khan/genqlient && \
	  cp generated.go "$$fresh" && \
	  if cmp -s "$$stash" "$$fresh"; then \
	    echo "internal/gql/generated.go is up to date"; \
	  else \
	    echo ""; \
	    echo "ERROR: internal/gql/generated.go is stale relative to schema.gql / operations/*.graphql."; \
	    echo "Run 'make tidy-gql' and commit the regenerated file."; \
	    exit 1; \
	  fi
