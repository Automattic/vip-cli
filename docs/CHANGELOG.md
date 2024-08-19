## Changelog

## 3.8.1

* fix(dev-env): clean up data after `vip dev-env sync sql`
* security: fix high severity CVE-2024-39338 in `axios`

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.8.0...3.8.1

## 3.8.0

* build(deps-dev): bump @babel/preset-env from 7.24.8 to 7.25.0 in the babel group
* build(deps): bump debug from 4.3.5 to 4.3.6
* SQL Import: Switch to wpSitesSDS query
* Extract many import-sql functionality to a separate file
* build(deps-dev): bump the babel group across 1 directory with 2 updates
* build(deps): bump adm-zip from 0.5.14 to 0.5.15
* build(deps): bump step-security/harden-runner from 2.9.0 to 2.9.1
* BB8-11630: Add confirmation for production env vars setting/deleting
* Remove querying `fileErrors` in Graphql API while fetching Media import status
* Mydumper integration

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.7.1...3.8.0

## 3.7.1

* build(deps): bump step-security/harden-runner from 2.8.1 to 2.9.0
* build(deps): bump semver from 7.6.2 to 7.6.3
* build(deps-dev): bump @types/node from 18.19.39 to 18.19.41
* refactor(dev-env): do not load SSH keys
* build(deps): bump tar from 7.4.0 to 7.4.1
* build(deps-dev): bump typescript from 5.5.3 to 5.5.4
* build(deps-dev): bump @types/node from 18.19.41 to 18.19.42
* Refactor dev-env sync, dev-env import and export-sql to TypeScript
* build(deps): bump tar from 7.4.1 to 7.4.3
* build(deps-dev): bump @types/dockerode from 3.3.30 to 3.3.31
* Gracefully fail when directory is not detected

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.7.0...3.7.1

## 3.7.0

* build(deps-dev): bump @automattic/eslint-plugin-wpvip from 0.12.0 to 0.13.0
* build(deps-dev): bump the babel group with 3 updates
* build(deps): bump update-notifier from 7.0.0 to 7.1.0
* build(deps): bump actions/dependency-review-action from 4.3.3 to 4.3.4
* build(deps-dev): bump @babel/core from 7.24.8 to 7.24.9 in the babel group
* build(deps-dev): bump @types/dockerode from 3.3.29 to 3.3.30
* update: media import validate-files
  
**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.6.0...3.7.0

## 3.6.0

* build(deps-dev): bump rimraf from 5.0.7 to 5.0.8
* feat(dev-env): add DNS check to health check to ensure domains resolve correctly

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.5.1...3.6.0

## 3.5.1

* fix(dev-env): display cron status in `vip dev-env info --extended`
* build(deps-dev): bump typescript from 5.5.2 to 5.5.3
* fix: case mismatch in environment identifier matcher

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.5.0...3.5.1

### 3.5.0

* feat(dev-env): add support for cron
* build(deps-dev): bump @automattic/eslint-plugin-wpvip from 0.11.0 to 0.12.0
* fix(dev-env): display all port mappings
* refactor(dev-env): migrate from `@lando/phpmyadmin` to `phpmyadmin` Docker image

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.4.2...3.5.0

### 3.4.2

* build(deps-dev): bump @types/node from 18.19.37 to 18.19.38
* build(deps-dev): bump typescript from 5.4.5 to 5.5.2
* build(deps-dev): bump @types/uuid from 9.0.8 to 10.0.0
* build(deps-dev): bump @types/node from 18.19.38 to 18.19.39
* fix(dev-env): ensure that URLs suggested for replacement start with `http(s)://`
* Remove unnecessary y/N choice for confirmations
* Update the vip app command to follow the VIP-CLI style guide
* Add retries to the fetching of jobs data

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.4.1...3.4.2

### 3.4.1

* Updating vip cache commands descriptions and examples to follow the VIP-CLI style guide
* Dev-env: Upgrade WordPress upgrade prompt to "yes" and pre-select latest version not trunk
* build(deps-dev): bump @types/node from 18.19.36 to 18.19.37
* fix(dev-env): retry healthcheck only on 502 and 504 status codes
* fix(dev-env): set the user/group for `nginx` container to `nginx:nginx`

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.4.0...3.4.1

### 3.4.0

* Updating command option descriptions to follow the VIP-CLI style guide
* build(deps-dev): bump @types/node from 18.19.34 to 18.19.36
* Add `vip app deploy validate` command for Custom Deployments
* fix(dev-env): remove debug code
* fix(dev-env): force pull images on environment version update
* chore(deps): update `ws` to fix CVE-2024-37890

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.3.1...3.4.0

### 3.3.1

* build(deps): bump step-security/harden-runner from 2.8.0 to 2.8.1
* build(deps): bump uuid from 9.0.1 to 10.0.0
* fix: CVE-2024-4068 in `braces`
* [dev-env] Update calls to WP-CLI to include --skip-plugins and --skip-themes
* fix(dev-env): use correct domain for environments
* vip app deploy: Deprecate force and add skip-confirmation
* Hide branch for vip app if Custom Deployment

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.3.0...3.3.1

### 3.3.0

* fix(dev-env): make sure wildcard subdomains work with SSL/TLS
* feat(dev-env): add XDebug information to `vip dev-env info --extended`

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.2.0...3.3.0

### 3.2.0

* feat(dev-env): make `domain` configurable
* build(deps): bump actions/dependency-review-action from 4.3.2 to 4.3.3
* build(deps-dev): bump the babel group with 4 updates
* Update the slowlogs command to follow the VIP-CLI styleguide
* feat(dev-env): add `--all` to `vip dev-env stop`
* chore: update lando to 77dad3a
* fix: CVE-2024-29415 in `socks`
* fix(dev-env): allow for unsetting media redirect domain
* fix(dev-env): validate version values

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.1.0...3.2.0

### 3.1.0

* Integrate Media Import v2 flow and expand on media import error report messaging

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/3.0.0...3.1.0

### 3.0.0

* fix(dev-env): demo code is displayed as `[demo-image]`
* build(deps-dev): bump @types/node from 18.19.33 to 18.19.34
* build(deps): bump debug from 4.3.4 to 4.3.5
* ci: remove duplicate check
* Update the dev-env commands to follow the VIP-CLI style guide
* build(deps-dev): bump the babel group with 4 updates
* ci: add publish prerelease workflow
* build(deps): bump step-security/harden-runner from 2.7.1 to 2.8.0
* build(deps): bump ini from 4.1.2 to 4.1.3

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.39.7...3.0.0

### 2.39.7

* Fix promptForBoolean to display the default initial value capitalized
* fix(dev-env): `vip dev-env info --all` should not ask for a slug
* build(deps-dev): bump rimraf from 5.0.5 to 5.0.7
* build(deps): bump cli-table3 from 0.6.4 to 0.6.5
* build(deps): bump semver from 7.6.0 to 7.6.2
* build(deps-dev): bump @types/node from 18.19.31 to 18.19.33
* build(deps-dev): bump @automattic/eslint-plugin-wpvip from 0.9.1 to 0.10/1832
* build(deps-dev): bump @automattic/eslint-plugin-wpvip from 0.10.0 to 0.11l/1835
* fix(dev-env): plugin loading when using yarn to install VIP CLI
* feat(dev-env): track versions of `docker` and `docker-compose`

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.39.6...2.39.7

### 2.39.6
* Custom Deploys: Update deploy validation to run fully off of the custom deploy token. There are breaking changes associated with these updates, so the VIP CLI must be updated to this latest version in order to continue using the custom deploy functionality.

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.39.5...2.39.6

### 2.39.5
* Custom Deploys: Pass in deploy token to StartCustomDeploy mutation and allow `getSignedUploadRequestData()` to accept another bearer token

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.39.4...2.39.5

### 2.39.4
* Dev-env: Hotfix mysql 8.4 being incompatible due to auth plugin deprecation

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.39.3...2.39.4

### 2.39.3

* Update/docs pt vip config
* Updates to descriptions and examples for vip db
* Updates to descriptions and examples for vip backup
* Fix duplicate format option on slowlogs command
* Fix issue with missing CSV output values
* chore(deps): update `tar` to fix CVE-2024-28863

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.39.2...2.39.3

### 2.39.2

* build(deps-dev): bump typescript from 5.4.4 to 5.4.5
* build(deps): bump ejs from 3.1.9 to 3.1.10
* fix: remove unused `cancelCommand`
* fix(dev-env): argument parsing for `vip dev-env sync sql`
* fix: underscore is allowed in environment name
* chore: remove unused files
* fix: superfluous trailing arguments

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.39.1...2.39.2

### 2.39.1

- Fix a crash due to an undefined function when running `export sql` with the `--generate-backup` flag by @noahtallen in https://github.com/Automattic/vip-cli/pull/1769
- refactor(dev-env): reduce noise from preflight checks by @sjinks in https://github.com/Automattic/vip-cli/pull/1758

### 2.39.0

* Updated Docs URLs to current permalinks by @yolih in https://github.com/Automattic/vip-cli/pull/1742
* Updated the export command group according to VIP-CLI style guide by @yolih in https://github.com/Automattic/vip-cli/pull/1741
* build(deps-dev): bump @types/node from 18.19.26 to 18.19.28 by @dependabot in https://github.com/Automattic/vip-cli/pull/1747
* ci: add dependency review workflow by @sjinks in https://github.com/Automattic/vip-cli/pull/1750
* test: fix E2E tests for composer v2 by @sjinks in https://github.com/Automattic/vip-cli/pull/1752
* ci: install docker-compose by @sjinks in https://github.com/Automattic/vip-cli/pull/1751
* build(deps): bump cli-table3 from 0.6.3 to 0.6.4 by @dependabot in https://github.com/Automattic/vip-cli/pull/1739
* Make "importSQLCheckStatus" return immediately when called from the `vip import sql status` command and no import is running by @andrea-sdl in https://github.com/Automattic/vip-cli/pull/1722
* fix(dev-env): regression: stop proxy when there are no running envs by @sjinks in https://github.com/Automattic/vip-cli/pull/1738
* Fixes text so that it doesn't reference "the above tables" when tables are not displayed by @brunobasto in https://github.com/Automattic/vip-cli/pull/1731
* build(deps): bump fetch-retry from 5.0.6 to 6.0.0 by @dependabot in https://github.com/Automattic/vip-cli/pull/1730
* build(deps): bump ini from 4.1.1 to 4.1.2 by @dependabot in https://github.com/Automattic/vip-cli/pull/1717
* chore(deps): update lando by @sjinks in https://github.com/Automattic/vip-cli/pull/1753

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.38.3...2.39.0

### 2.38.3

* Fix triggering publish docs workflow on tag push by @seanlanglands in https://github.com/Automattic/vip-cli/pull/1716
* build(deps-dev): bump nock from 13.5.3 to 13.5.4 by @dependabot in https://github.com/Automattic/vip-cli/pull/1708
* build(deps-dev): bump @types/node from 18.19.18 to 18.19.21 by @dependabot in https://github.com/Automattic/vip-cli/pull/1715
* build(deps-dev): bump the babel group with 2 updates by @dependabot in https://github.com/Automattic/vip-cli/pull/1709
* vip app deploy - Allow passing in a deploy key with env variable by @rebeccahum in https://github.com/Automattic/vip-cli/pull/1718
* build(deps-dev): bump typescript from 5.3.3 to 5.4.2 by @dependabot in https://github.com/Automattic/vip-cli/pull/1721
* build(deps-dev): bump @types/node from 18.19.21 to 18.19.22 by @dependabot in https://github.com/Automattic/vip-cli/pull/1720
* build(deps-dev): bump @types/dockerode from 3.3.24 to 3.3.26 by @dependabot in https://github.com/Automattic/vip-cli/pull/1724
* build(deps): bump open from 10.0.4 to 10.1.0 by @dependabot in https://github.com/Automattic/vip-cli/pull/1725
* Allows user to continue even when the answer doesn't match the expected letter casing by @brunobasto in https://github.com/Automattic/vip-cli/pull/1632
* build(deps-dev): bump the babel group with 4 updates by @dependabot in https://github.com/Automattic/vip-cli/pull/1734
* build(deps-dev): bump @types/node from 18.19.22 to 18.19.26 by @dependabot in https://github.com/Automattic/vip-cli/pull/1733
* build(deps-dev): bump typescript from 5.4.2 to 5.4.3 by @dependabot in https://github.com/Automattic/vip-cli/pull/1735
* build(deps): bump socket.io-client from 4.7.4 to 4.7.5 by @dependabot in https://github.com/Automattic/vip-cli/pull/1729
* Update SQL import prompt message by @iamchughmayank in https://github.com/Automattic/vip-cli/pull/1743

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.38.2...2.38.3

### 2.38.2

* New develop release: 2.38.2-dev.0 by @github-actions in https://github.com/Automattic/vip-cli/pull/1697
* build(deps-dev): bump nock from 13.5.1 to 13.5.3 by @dependabot in https://github.com/Automattic/vip-cli/pull/1701
* build(deps-dev): bump @types/node from 18.19.15 to 18.19.17 by @dependabot in https://github.com/Automattic/vip-cli/pull/1699
* style: fix issues found by ESLint by @sjinks in https://github.com/Automattic/vip-cli/pull/1702
* build(deps-dev): bump eslint from 8.56.0 to 8.57.0 by @dependabot in https://github.com/Automattic/vip-cli/pull/1707
* build(deps): bump open from 10.0.3 to 10.0.4 by @dependabot in https://github.com/Automattic/vip-cli/pull/1705
* build(deps-dev): bump @types/semver from 7.5.7 to 7.5.8 by @dependabot in https://github.com/Automattic/vip-cli/pull/1706
* build(deps-dev): bump @types/dockerode from 3.3.23 to 3.3.24 by @dependabot in https://github.com/Automattic/vip-cli/pull/1704
* build(deps-dev): bump @types/node from 18.19.17 to 18.19.18 by @dependabot in https://github.com/Automattic/vip-cli/pull/1703
* Add environment name to PHPMyAdmin AppQuery by @chriszarate in https://github.com/Automattic/vip-cli/pull/1711
* New package release: v2.38.2 by @github-actions in https://github.com/Automattic/vip-cli/pull/1712


**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.38.1...2.38.2

### 2.38.1

* New develop release: 2.38.1-dev.0 by @github-actions in https://github.com/Automattic/vip-cli/pull/1678
* build(deps-dev): bump @types/node from 18.19.9 to 18.19.14 by @dependabot in https://github.com/Automattic/vip-cli/pull/1680
* build(deps-dev): bump the testing group with 1 update by @dependabot in https://github.com/Automattic/vip-cli/pull/1679
* build(deps-dev): bump @types/uuid from 9.0.7 to 9.0.8 by @dependabot in https://github.com/Automattic/vip-cli/pull/1670
* build(deps-dev): bump nock from 13.5.0 to 13.5.1 by @dependabot in https://github.com/Automattic/vip-cli/pull/1671
* build(deps-dev): bump the babel group with 3 updates by @dependabot in https://github.com/Automattic/vip-cli/pull/1668
* build(deps): bump semver from 7.5.4 to 7.6.0 by @dependabot in https://github.com/Automattic/vip-cli/pull/1684
* BYOR: Update to use renamed CustomDeploy mutation by @rebeccahum in https://github.com/Automattic/vip-cli/pull/1687
* Fix prompt handling causing duplicate messages to be shown for export sql and dev-env sync by @abdullah-kasim in https://github.com/Automattic/vip-cli/pull/1682
* Support default OrbStack Docker socket path by @chriszarate in https://github.com/Automattic/vip-cli/pull/1686
* Update publish docs request parameters by @seanlanglands in https://github.com/Automattic/vip-cli/pull/1688
* build(deps-dev): bump @types/semver from 7.5.6 to 7.5.7 by @dependabot in https://github.com/Automattic/vip-cli/pull/1692
* build(deps): bump @json2csv/plainjs from 7.0.5 to 7.0.6 by @dependabot in https://github.com/Automattic/vip-cli/pull/1691
* build(deps-dev): bump @types/node from 18.19.14 to 18.19.15 by @dependabot in https://github.com/Automattic/vip-cli/pull/1690
* chores (phpmyadmin): Add insufficient-permission message by @aswasif007 in https://github.com/Automattic/vip-cli/pull/1694
* New package release: v2.38.1 by @github-actions in https://github.com/Automattic/vip-cli/pull/1696

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.38.0...2.38.1

### 2.38.0

* New develop release: 2.37.1-dev.0 by @github-actions in https://github.com/Automattic/vip-cli/pull/1663
* fix(dev-env): always lowercase environment slug by @sjinks in https://github.com/Automattic/vip-cli/pull/1659
* Use vip dev-env configuration file from parent directories by @alecgeatches in https://github.com/Automattic/vip-cli/pull/1468
* build(deps): bump @json2csv/plainjs from 7.0.4 to 7.0.5 by @dependabot in https://github.com/Automattic/vip-cli/pull/1664
* build(deps-dev): bump @types/node from 18.19.8 to 18.19.9 by @dependabot in https://github.com/Automattic/vip-cli/pull/1666
* feat(phpmyadmin): Add `vip  db phpmyadmin` command by @aswasif007 in https://github.com/Automattic/vip-cli/pull/1526
* New package release: v2.38.0 by @github-actions in https://github.com/Automattic/vip-cli/pull/1677

**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.37.0...2.38.0

### 2.37.0

- build(deps-dev): bump the babel group with 2 updates
- build(deps): bump @automattic/vip-search-replace from 1.1.1 to 1.1.2
- build(deps): bump Automattic/vip-actions from 0.2.0 to 0.3.0
- build(deps): bump github/codeql-action from 2 to 3
- BYOR: Add `vip app deploy`
- build(deps-dev): bump eslint from 8.55.0 to 8.56.0
- Dev-env: Remove 8.0 & 7.4 from available PHP versions
- build(deps): bump open from 9.1.0 to 10.0.0
- fix(dev-env): use the latest nginx image
- build(deps-dev): bump dockerode from 4.0.0 to 4.0.1
- build(deps): bump open from 10.0.0 to 10.0.1
- build(deps-dev): bump dockerode from 4.0.1 to 4.0.2
- build(deps): bump open from 10.0.1 to 10.0.2
- fix(validate-sql): Display matched site-urls
- build(deps): bump socket.io-client from 4.7.2 to 4.7.3
- build(deps-dev): bump the babel group with 2 updates
- build(deps): bump open from 10.0.2 to 10.0.3
- feat: show detailed error information in debug mode
- build(deps-dev): bump the babel group with 1 update
- fix: issues found by SonarCloud
- build(deps-dev): bump @types/node from 18.19.5 to 18.19.6
- chore(deps): fix CVE-2023-26159 in follow-redirects
- build(deps): bump Automattic/vip-actions from 0.3.0 to 0.5.0
- build(deps): bump @automattic/vip-search-replace from 1.1.2 to 1.1.3
- fix: Properly propagate quotes
- fix(--format=json): Do not print header if specified format is json
- feat(dev-env): add quiet mode for "import sql"
- build(deps): bump socket.io-client from 4.7.3 to 4.7.4
- fix: regex vulnerable to super-linear runtime
- ci: add CodeQL workflow
- ci: remove outdated CodeQL workflow
- BYOR: Change manual-deploy to custom-deploy
- build(deps-dev): bump @types/node from 18.19.6 to 18.19.8
- build(deps-dev): bump nock from 13.4.0 to 13.5.0
- fix(dev-env): CWE-367 in `prepareLandoEnv()`
- fix(dev-env): CWE-367 in `getConfigurationFileOptions()`
- fix(dev-env): CWE-377, CWE-378 originating from `xdgDataDirectory()`
- build(deps): bump Automattic/vip-actions from 0.5.0 to 0.6.0


**Full Changelog**: https://github.com/Automattic/vip-cli/compare/2.36.3...v2.37.0

### 2.36.3

- build(deps): bump @json2csv/plainjs from 7.0.3 to 7.0.4
- build(deps-dev): bump nock from 13.3.8 to 13.4.0
- build(deps-dev): bump the babel group with 2 updates
- build(deps-dev): bump @automattic/eslint-plugin-wpvip from 0.9.0 to 0.9.1
- fix(dev-env): `/lando-entrypoint.sh: exec: line 83: exit: not found`
- build(deps-dev): bump eslint from 8.54.0 to 8.55.0
- build(deps-dev): bump typescript from 5.3.2 to 5.3.3
- build(deps-dev): bump the testing group with 1 update
- chore(deps): update lando to 25fcd83
- build(deps): bump Automattic/vip-actions from 0.1.2 to 0.2.0

### 2.36.2

- #1558 fix(dev-env): Fix typo on suggested start command after updating env
- #1557 fix(dev-env): Fix an issue where dev-env-import-sql command execute event was not being tracked
- #1554 chore(dev-deps): update testing tools
- #1556 chore(dev-deps): update eslint from 8.52.0 to 8.54.0
- #1555 chore(deps): replace the deprecated `opn` with `open`
- #1553 chore(dev-deps): update TypeScript and typings
- #1578 build(deps-dev): bump @types/semver from 7.5.4 to 7.5.6
- #1577 Updating ESLint config
- #1559 Restructure and refine documentation + add missing tests
- #1591 Fix database backup URL in error message
- #1537 Add vip dev-env purge command logic
- #1590 build(deps): bump actions/setup-node from 3 to 4
- #1589 build(deps): bump actions/checkout from 3 to 4
- #1592 chore: group dependencies that should be updated together
- #1594 build(deps-dev): bump the babel group with 4 updates
- #1593 build(deps-dev): bump the testing group with 1 update
- #1595 build(deps-dev): bump typescript from 5.2.2 to 5.3.2
- #1596 build(deps): bump @automattic/vip-go-preflight-checks from 2.0.16 to 2.0.17
- #1580 build(deps): bump ini from 2.0.0 to 4.1.1
- #1598 build(deps-dev): bump @automattic/eslint-plugin-wpvip from 0.8.0 to 0.9.0
- #1597 chore(deps): update Lando

### 2.36.1

- #1550 chore(deps): replace cli-table with cli-table3

### 2.36.0

- #1527 chore(dev-deps): remove @babel/plugin-transform-modules-commonjs and babel-plugin-module-resolver
- #1531 chore(dev-deps): update nock from 13.3.3 to 13.3.4
- #1530 chore(dev-deps): update TypeScript type definitions
- #1529 chore(dev-deps): update eslint from 8.50.0 to 8.51.0
- #1532 chore(dev-deps): update dockerode from 3.3.4 to 4.0.0
- #1528 chore(dev-deps): update Babel-related stuff to 7.23
- #1522 Change default response on WordPress upgrade prompt to 'no'
- #1533 FORNO-1704: SQL Import - Improve handling of compressed files
- #1536 CANTINA-957: Dev-env: Make message after update more clear
- #1534 build: disable promise/no-multiple-resolved
- #1535 FORNO-1677: Fix dev env network site domains
- #1538 style: update @automattic/eslint-plugin-wpvip to 0.8.0 and apply style fixes
- #1539 chore(dev-deps): update TypeScript type definitions
- #1540 chore(deps): update jwt-decode from 3.1.2 to 4.0.0
- #1541 chore(dev-deps): update nock from 13.3.4 to 13.3.7
- #1542 chore: generate and verify provenance statements
- #1544 chore(deps): update update-notifier to 7.0.0
- #1485 feat(dev-env): add PHP 8.3 image
- #1543 chore(deps): update lando
- #1545 chore(deps): replace deprecated `json2csv` with `@json2csv/plainjs`

### 2.35.1

- #1523	SQL Import Status: Ensure we pull site type ID from server for validation
- #1515	refactor: remove flow
- #1521	Fix link in CONTRIBUTING.md

### 2.35.0

- #1506 Allow imports for all sites with databases by @chriszarate in https://github.com/Automattic/vip-cli/pull/1507
- #1497 fix: remove import bypass for TypeScript by @sjinks in https://github.com/Automattic/vip-cli/pull/1497
- #1496 fix(dev-env): update certificate Common Name by @sjinks in https://github.com/Automattic/vip-cli/pull/1496
- #1513 refactor: use `semver` instead of `check-node-version` by @sjinks in https://github.com/Automattic/vip-cli/pull/1513
- #1514 chore(dev-deps): update TypeScript type definitions by @sjinks in https://github.com/Automattic/vip-cli/pull/1514
- #1508 chore(dev-deps): update jest-related packages to 29.7.0 by @sjinks in https://github.com/Automattic/vip-cli/pull/1508
- #1509 chore(dev-deps): update eslint from 8.47.0 to 8.49.0 by @sjinks in https://github.com/Automattic/vip-cli/pull/1509
- #1510 chore(deps): update uuid from 9.0.0 to 9.0.1 by @sjinks in https://github.com/Automattic/vip-cli/pull/1510
- #1512 chore(deps): update node-fetch from 2.6.12 to 2.7.0 by @sjinks in https://github.com/Automattic/vip-cli/pull/1512
- #1511 chore(deps): update graphql-tag from 2.12.5 to 2.12.6 by @sjinks in https://github.com/Automattic/vip-cli/pull/1511
- #1517 chore(dev-deps): update rimraf from 5.0.1 to 5.0.5 by @sjinks in https://github.com/Automattic/vip-cli/pull/1517
- #1516 chore(dev-deps): update eslint from 8.49.0 to 8.50.0 by @sjinks in https://github.com/Automattic/vip-cli/pull/1516
- #1499 chore(dev-deps): update @automattic/eslint-plugin-wpvip to 0.6.0 by @sjinks in https://github.com/Automattic/vip-cli/pull/1499

### 2.34.0

- #1503 chore(dev-deps): update nock to 13.3.3
- #1502 chore(dev-deps): update flow-bin to 0.216.1
- #1501 chore(deps): update jest-related packages
- #1500 chore(dev-deps): update babel-related packages
- #1498 ci: run tests and checks in parallel
- #1462 Fixed Slowlogs local unit test
- #1488 fix: do not abort if a temporary directory cannot be removed on exit
- #1495 refactor: convert `media-import` to TypeScript
- #1492 refactor: convert `site-import` directory to TypeScript

### 2.33.0

- #1475 Updating CONTRIBUTING.md with new publishing procedure
- #1477 Fetch environment name from server to fix environment selector label
- #1479 chore(dev-deps): update jest-related packages to 29.6.2
- #1480 chore(deps): update node-fetch to 2.6.12
- #1481 chore(deps): update socket.io-client to 4.7.2
- #1482 chore(deps): update enquirer to 2.4.1
- #1478 Fix False UP status for multisite dev-envs
- #1483 Disable Windows patch
- #1458 Add warning confirmation when there's not enough space on disk. by
- #1487 fix(dev-env): display ports exposed by services
- #1490 fix: CLI not respecting proxy settings when creating local dev environment by
- #1491 chore(dev-deps): update eslint from 8.43.0 to 8.47.0
- #1486 chore(dev-deps): update babel-related packages
- #1484 feat(backup): Add vip backup db command

### 2.32.4

- #1470 Rename prepare-release.yml to npm-prepare-release.yml
- #1469 fix compatibility issue

### 2.32.3

- #1456 Fix DB engine validation regex
- #1455 Fix SQL import command
- #1454 chore(deps): update lando to 5efb9eb
- #1453 Refactor logout
- #1425 Add Slowlogs command
- #1341 feat(dev-env): Add a concept of init-only containers
- #1344 fix(dev-env): Do not run URL scan unless really need to
- #1414 [dev-env] Tweak error handling dev-env sync
- #1452 chore(dev-deps): update TypeScript-related packages
- #1420 feat(dev-env): Adds automigration logic to dev-env
- #1451 chore(dev-deps): update testing tools
- #1448 chore(dev-deps): update babel packages to 7.22.9
- #1421 refactor: Convert dev-environment to TypeScript
- #1450 refactor: convert `validations` to TS

### 2.32.2

- #1443 On-demand Database Backup: Use a less error-prone way of detecting if we're rate limited
- #1434 Add more clarifying steps for making a release
- #1435 Remove enums from GraphQL codegen and make sure that prettier actually runs
- #1433 Redeploy codegen for GraphQL queries
- #1432 Revert "Add codegen for GraphQL queries (#1429)"
- #1304 Generate docs

### 2.32.1

- #1445 chore(deps): update vulnerable dependencies to fix ReDoS in semver
- #1444 chore(deps): update Lando

### 2.32.0

- #1411 feature(export): Add ability to generate a new backup when exporting SQL
- #1427 Remove unnecessary comment
- #1426 chore: fix CVE-2023-26115 by updating word-wrap to 1.2.6
- #1424 feat(dev-env): Update wording around dev-env start --vscode
- #1419 [PIE-3548] Updates CONTRIBUTING.md with the new flow without publish-please
- #1423 chore(deps): update socket.io-client from 4.6.2 to 4.7.0
- #1422 chore(dev-deps): update flow-bin from 0.209.0 to 0.210.0
- #1417 chore(dev-deps): Update eslint from 8.42.0 to 8.43.0
- #1418 chore(deps): Update semver from 7.5.2 to 7.5.3
- #1415 [PIE-3548] Removes `publish-please` and replaces it with simple custom script
- #1416 [dev-env] Reword dev-env VS Code integration messages
- #1413 [dev-env] Command options text fixes
- #1412 Update eslint-plugin-wpvip to 0.5.8, Prettier updates
- #1396 Migrate dev-environment-core to TypeScript
- #1410 chore(dev-deps): Update flow-bin to 0.209.0
- #1409 chore(deps): Update semver to 7.5.2
- #1408 chore(dev-deps): Update rimraf to 5.0.1
- #1407 chore(dev-deps): Update flow-bin from 0.206.0 to 0.208.0
- #1406 chore(deps): Replace keytar with @postman/node-keytar
- #1405 chore(deps): Update socket.io-client from 4.6.1 to 4.6.2
- #1404 chore(dev-deps): Update TypeScript-related packages
- #1403 chore(dev-deps): Update ESLint-related packages update/eslint
- #1402 chore(dev-deps): Update Babel-related packages to 7.22.5

### 2.31.0

- #1397 feature(dev-env): Add ability to sync multisites
- #1399 chore(dev-deps): Remove stub type definitions
- #1394 FORNO-1609: Combine all error events into one error event
- #1345 feat(dev-env): Add Photon
- #1398 Fix coverage generation
- #1395 Add types for the other ways of using enquirer
- #1388 Typescript: refactor `vip-whoami`
- #1393	refactor: Convert `lib/{app-logs,envvar}` to TypeScript
- #1392	refactor: Convert `lib/config` to TypeScript
- #1391	refactor: Convert lib to TypeScript
- #1390	chore(deps): Update @automattic/vip-search-replace to 1.1.1
- #1389	Replace 'site' by 'environment' in error msg
- #1385	refactor: Convert lib/api to TypeScript
- #1387	chore(deps): Update @automattic/vip-search-replace to 1.1.0
- #1386	fix: Fix `getAbsolutePath()` and convert `utils.js` to TypeScript
- #1383	fix(dev-env): Pull uniqueLabel field from backend
- #1382	test: Reduce noise from tests
- #1384	fix: Add return type to parseEnvAliasFromArgv()
- #1381	refactor: Convert lib/cli and dependencies to TypeScript
- #1377	chore: Configure linting for TS files
- #1380	chore(dev-deps): Remove jest-environment-jsdom
- #1378	refactor: Convert analytics and dependencies to TypeScript

### 2.30.0

- #1264	feature(dev-env): Add dev-env-sync-sql command
- #1376	refactor: Convert keychain to TypeScript
- #1370	fix: Fix issues found by SonarCloud
- #1374	Add TypeScript support
- #1334	Dev-env: Allow --multisite to accept boolean, subdirectory, or subdomain values
- #1375	fix(api): Set non-zero exit code on error
- #1373	Reverting accidental push to vip-cli

### 2.29.1

- #1372 fix(export): Make vip-export-sql.js executable

### 2.29.0

- #1362	feature(dev-env): Add vip export sql command
- #1357	chore(deps): Update semver from 7.5.0 to 7.5.1
- #1360	chore(dev-deps): Update flow-bin from 0.205.1 to 0.206.0
- #1365	chore(deps): Fix CVE-2023-32695
- #1356	fix(dev-env): Handle `--media-redirect-domain` in `vip dev-env update`
- #1361	chore(dev-deps): Update packages related to linting
- #1364	fix(dev-env): Fix "Cannot read properties of undefined" in `preProcessInstanceData()`
- #1363	fix(dev-env): Add error handling to readEnvironmentData()
- #1317	Auto-login support

### 2.28.3

- #1352 chore(deps): Update node-fetch from 2.6.9 to 2.6.11
- #1348 chore(deps): Update Lando
- #1347 [dev-env] add vscode flag to event tracking for start
- #1353 chore(dev-deps): Update nock from 13.3.0 to 13.3.1
- #1351 chore(deps): Update semver from 7.3.8 to 7.5.0
- #1350 chore(dev-deps): Update Babel-related packages
- #1349 chore(dev-deps): Update packages related to liniting

### 2.28.2

- #1330 chore(deps): Update xml2js to 0.5.0

### 2.28.1

- #1123 [dev-env] Add VSCode workspace config on start

### 2.28.0

- #1343 fix(dev-env): Force image pulling after recovering Landofile
- #1342 fix(dev-env): Do not fail when lando_bridge_network does not exist
- #1329 feat(dev-env)!: Replace MailHog with Mailpit
- #1340 feat(dev-env): Kill lando proxy when last env stops
- #1324 feat(dev-env): Better detection of a Docker socket
- #1332 Update inline search-replace help for import sql command
- #1338 chore(dev-deps): Update @automattic/eslint-plugin-wpvip from 0.4.0 to 0.5.2
- #1337 chore(dev-deps): Update flow-bin from 0.203.1 to 0.204.0
- #1336 chore(dev-deps): Update eslint from 8.37.0 to 8.38.0
- #1325 tests: Fix timing out tests on Windows
- #1333 [dev-env] Readds xdebug_config to vip dev-env update
- #1328 feat(dev-env): Profile Lando-related functions
- #1326 tests(e2e): Force Jest to exit after all tests have completed running
- #1327 ci: Set `DO_NOT_TRACK=1` for E2E tests
- #1323 Revert "feat(dev-env): Better detection of a Docker socket"
- #1316 feat(dev-env): Better detection of a Docker socket
- #1321 chore(dev-deps): Update Babel-related packages
- #1320 chore(dev-deps): Update flow-bin from 0.202.1 to 0.203.1
- #1319 chore(dev-deps): Update eslint from 8.36.0 to 8.37.0
- #1318 chore(deps): Update lando to d75a4e8
- #1315 Fix preselected options on update
- #1314 chore(deps): Update socket.io-client to 4.6.1
- #1311 chore(dev-deps): Update eslint to 8.36.0
- #1310 chore(deps): Update ejs to 3.1.9
- #1312 chore(dev-deps): Update prettier to 2.8.7
- #1309 chore(dev-deps): Update flow-bin to 0.202.1
- #1308 chore(dev-deps): Update dockerode to 3.3.5
- #1307 chore(dev-deps): Update nock to 13.3.0
- #1306 chore(dev-deps): Forcefully update lodash for publish-please to 4.17.21
- #1305 chore(deps): Update Lando
- #1303 chore(deps): Replace socket.io-stream with @wearemothership/socket.io-stream
- #1301 chore(deps): Update lando-cli
- #1302 fix(ci): Do not prompt for WP update
- #1297 chore(dev-deps): Update Jest-related packages to 29.5.0
- #1299 chore(dev-deps): Update eslint-related stuff
- #1298 chore(dev-deps): Update flow-bin from 0.196.3 to 0.201.0
- #1293 chore(dev-deps): Update Babel-related packages
- #1300 chore(deps): Update Lando
- #1294 chore(dev-deps): Update Jest-related packages to 29.4.3
- #1296 Add trackers to capture execute, success and error events
- #1292 Fix requiredArgs for other vip commands
- #1290 Fail with a msg if an export job with a different backup is running
- #1254 refactor(dev-env): Remove healthcheck hook
- #1291 Dev-env: Fix silent failing when passing invalid subcommand
- #1282 Prefix urls with // to fix the search-replace problem

### 2.27.0

- #1287 fix(dev-env): Pull fresh images for new environments
- #1288 fix(flow): Fix Flow issues
- #1286 fix(dev-env): Provide Flow typings for `landoLogs()`
- #1285 refactor(dev-env): Refactor Lando template to avoid running unnecessary scripts
- #1280 Dev-env: Add command to view logs `vip dev-env logs`
- #1267 feat(dev-env): Add `vip dev-env shell` command
- #1283 fix(dev-env): Add missing `await`
- #1284 test: Do not mock `localStorage` if `global.localStorage` is defined
- #1281 [dev-env] Update the wording for Docker connection check
- #1173 Add dev-env configuration file
- #1279 Add some clarification to test-release process

### 2.26.2

- #1278	Prepare v2.26.2
- #1277	Fix the PassThrough class import
- #1276	[dev-env] Add ability to override default options for lando with a global Lando config.yml

### 2.26.1

- #1275 Prepare v2.26.1
- #1271 refactor(dev-env): Switch to mysql:8
- #1273 Add library for the dev-env-sync-sql command
- #1274 Run validation on filename & not on full filepath
- #1272 fix(dev-env): Suppress health warnings for new environments
- #1234 fix(dev-env): Force IPv4 for services bound to localhost

### 2.26.0

- #1237 Skip requoting if the arg is a valid JSON Object
- #1258 fix(dev-env): Get more verbose logs from Lando in debug mode
- #1249 refactor(dev-env): Do not use Lando's memcached plugin
- #1266 fix(dev-env): Fix incorrect working directory when vip dev-env exec is run from a 8 level deep directory
- #1263 Dev-env: Do not prompt to update WP version if trunk is used
- #1244 chore(deps): Pin @apollo/client to 3.3.6
- #1261 fix(dev-env): Gracefully handle failures to fetch WP versions
- #1257 fix(dev-env): Fix "This app was built on a different version of Lando" warning
- #1260 Config Software: fix small typo in "include" usage
- #1250 feat(dev-env): Implement upgrade path for changes affecting .lando.yml
- #1259 Add notifications commands to package.json
- #1228 fix(dev-env): Do not use a temporary directory for Lando
- #1251 Fix lint errors fix/lint-errors
- #1247 Add library to facilitate SQL backup export
- #1246 fix(dev-env): ElasticSearch => Elasticsearch
- #1243 fix: Fix peer dependencies and code style issues
- #1242 chore: Set minimum Node.js version to 16

### 2.25.1

- #1239 Downgrade Apollo client to 3.3.6

### 2.25.0

- #1233 Update @automattic/vip-go-preflight-checks to 2.0.16
- #1232 fix(dev-env): Make environment existence check more robust
- #1231 fix(dev-env): Inherit stdio descriptors for 'dev-env exec'
- #1230 Dev-env: Fix ES service reference
- #1229 fix(dev-env): Perform ES healthcheck properly
- #1209 refactor(dev-env): Run health checks in parallel
- #1201 fix(dev-env): Do not check env is up for every action
- #1224 fix(tests): do not fail when `DO_NOT_TRACK` is set
- #1211 fix(dev-env)!: remove support for statsd
- #1183 feat(dev-env): Add support for the most recent Lando
- #1203 test(dev-env): Add E2E tests for dev env
- #1222 chore(deps): Update babel to 7.20.7
- #1223 chore(deps): Update flow to 0.196.3
- #1226 Add some additional info on installation
- #1225 chore: Update dot files
- #1197 feat(dev-env): Pipe files to Docker instead of copying them when doing SQL import
- #1221 dev-env: Fix Mailhog being undefined in instance data from older versisons of VIP-CLI
- #1218 Fix a grammatical mistake in the error message
- #1217 Add filename validation to sql import
- #1213 chore(deps): Update jest to 29.3.1 and nock to 13.2.9
- #1214 chore(deps): Update babel to 7.20
- #1208 feat(dev-env): Add quiet mode to `vip dev-env exec`
- #1212 fix(dev-env): Errors should go to stderr, not stdout
- #1206 fix(dev-env): await handleCLIException() and set proper exit code
- #1202 fix(dev-env): Do not load integrations for Acquia, Lagoon, Pantheon
- #1200 fix(dev-env): Reuse Lando App instead of recreating it every time
- #1204 Dev-env: Update ES to 7.17.8 to match prod
- #1205 ci: Pass correct node-version in CI workflow
- #1199 fix(dev-env): Update `max_allowed_packet` to mirror prod envs
- #1194 Add debugger instructions
- #1196 fix(dev-env): Fix ambiguous short option for MailHog/MariaDB
- #1195 fix(dev-env): increase max number of event listeners for AsyncEvents

### 2.24.2 (22 Dec 2022)

- #1219 fix(dev-env): Fix search/replace on SQL file import

### 2.24.1 (10 Dec 2022)

- #1193 Fix regression in vip dev-env import sql related to the fact we don't mount User's home dir anymore

### 2.24.0 (06 Dec 2022)

- #1139 fix(dev-env): Fall back to copy when rename fails due to EXDEV
- #1170 [dev-env] Substitute the check for forward slash to with a cross-platform regex when processing component argument value
- #1174 Override WordPress image cache key in tests
- #1175 Dev-env: Throw error if more than one environment found when starting
- #1177 Logged out `vip --version`
- #1178 chore(deps): Fix some of vulnerable dependencies
- #1179 feat(dev-env): Do not prompt for missing values if stdin is not a TTY
- #1180 fix(dev-env): Fix a typo in parameter description
- #1181 fix(dev-env): Set SQL_MODE to match our production environment
- #1182 Dev-env: Throw UserError in getEnvironmentName() instead and default to first one if only one env
- #1184 Validate Preflight: Allow preflight checks to execute without explicit app and/or env
- #1185 feat(dev-env): Add support for MailHog
- #1186 feat(dev-env): Do not mount home directory into containers
- #1188 fix: Make bin files executables
- #1189 refactor(dev-env): Bootstrap Lando only once

### 2.23.0 (11 Nov 2022)

- #1169 Preflight Validation: Change return code on error
- #1095 Harmonia Pre Deploy Validation: Add `validate` command
- #1156 Validate env before resolving path
- #1167 dev-env: Fix bug in getVersionList() when path doesn't exist

### 2.22.0 (2 Nov 2022)

#1165  Add caching type policy for `WPSite` data
#1164  Fix regExp to categorize multisite tables during SQL Imports
#1163  Pull correct environment's details from API when displaying Multisite SQL Import preflight details
#1159  chore(deps): Bump debug from 4.3.3 to 4.3.4
#1162  chore(deps): Bump update-notifier from 4.1.3 to 5.1.0
#1160  chore(deps): Bump json2csv from 5.0.6 to 5.0.7
#1158  chore(deps): Bump args from 5.0.1 to 5.0.3
#1157  chore(deps): Bump semver from 7.3.5 to 7.3.8
#1155  chore(deps): Bump uuid from 8.3.2 to 9.0.0
#1154  chore(deps): Update Babel-related packages
#1153  chore(deps): Fix security vulnerabilities in dependencies
#1152  ci: Update workflows
#1151  refactor(dev-env): Modify `verifyDNSResolution()` to use Promises API

### 2.21.0 (24 Oct 2022)

- #1143 [dev-env] adds default for wordpress version prompt
- #1146 fix(dev-env): Resolve the "xdebugConfig is not defined" issue
- #1142 Update Slack channel on which to (optionally) ping before release
- #1144 fix: Suppress ES security-related warnings
- #1132 [PIE-3105] Update VIP-CLI command line output
- #1118 Remove unused confirmation prompt during sql import
- #1137 [dev-env] simplify and rename elasticsearch service config
- #1138 [dev-env] Update/rename app code and mu-plugins

### 2.20.0 (19 Oct 2022)

- #1121  Add support for custom PHP images
- #1136  SQL Import: Add validation for unique_checks being disabled
- #1131  SQL Import - Add ALTER TABLE statement validation
- #1134  [dev-env] add app and env to tracks when creating env
- #1135  [dev-env] Make xdebug config not break during wp update
- #1098  Include options into reading software config
- #1114  [dev-env] Verify current user is a docker user
- #1130  Update/exec help
- #1125  add validation output
- #1127  Run wp-cli as www-data
- #1120  Update php-fpm image names
- #1126  Update memcached to 1.6-alpine3.16
- #1124  [dev-env] Supress Setup wizard during update
- #1111  [dev-env] prompt for es index after db import
- #1119  Use --yes instead of --force
- #1115  [dev-env] reclasify most common error
- #1122  [dev-env] support xdebug_config environment variable
- #1129  Fix ESLint/Flow/SonarScan issues
- #1133  Add PHP 8.2 image
- #1141  SQL validation: Change formatting to make it more readable

https://github.com/Automattic/vip-cli/releases/tag/v2.20.0

### 2.19.2 (23 Sep 2022)
- #1116 Reverted #1049 changes

### 2.19.0 (23 Sep 2022)
- #1108 [dev-env] Validate import file and add debug lines
- #1107 [dev-env] Validate dns lookup
- #1104 [dev-env] fetch php and wordpress versions for creation wizard
- #1049 Fix security issues

### 2.18.0 (15 Sep 2022)
- #1103	Force the preference for WebSocket in case we see an error during connection
- #1102	Remove http proxy support
- #1096	[dev-env] Supports extended information table
- #1100	Add GitHub action to mark inactive issues and PRs as stale
- #1099	Add @app.env to commands help
- #1092	Improve login + logout
- #1097	Don't pipe output through less

### 2.17.0 (06 Sep 2022)
- #1093 [dev-env] use latest proxy image
- #1091 Extract http helper into standalone function
- #1090 Add tracking to software update
- #1083 Software Management: Update
- #1089 [dev-env] Fix wording in wizard

### 2.16.0 (29 Aug 2022)

- #1086	Add tracking to config software get
- #1034	Bump node-fetch from 2.6.1 to 2.6.7
- #1087	Increase the limit of sql file from 1GB to 5GB for SQL Imports
- #1085	[dev-env] rename clientCode to appCode
- #1084	Update/sw get tweaks
- #1077	[dev-env] Remove app.env support from non-create command
- #1079	[dev-env] support multiple falsy values	add/support_for_falsy
- #1080	[dev-env] switch name to slug in info table
- #1073	[dev-env] e2e Windows tests
- #1078	SQL Import: Fix multisite primary domain validation
- #1068	Software Management: Get settings
- #1070	[dev-env] validate client code - look for specific subdirectories
- #1075	[dev-env] Add switch to skip wp version check
- #1074	[dev-env] update lando dependency
- #1071	[dev-env] update wizard prompts to be fully configurable using config switches

### 2.15.0 (3 Aug 2022)

- #1067 FORNO-1244: SQL Import: Increase max import size for launched sites to 1GB
- #1064 FORNO-1254: SQL Import: Add multisite primary domain validation
- #1062 [dev-env] Change wizard wording
- #1065 [dev-env] Update default software versions for PHP and Elasticsearch
- #1063 [dev-env] Remove redundant healthchecks
- #1061 [dev-env] Fix duplicate shortcuts

### 2.14.0 (19 Jul 2022)

- #1059 Update engines to show support for npm > 6
- #1058 [dev-env] switch dev-env error during import to warning
- #1057 [dev-env] Update debug instruction example
- #1055 [dev-env] Makes exec attempt to run the task even if env seems to be down

### 2.13.1 (20 Jun 2022)

- #1052 [dev-env] Update/lando compose version
- #1045 README: Fix Typo `VIP CLI` => `VIP-CLI`
- #1048 Switch to GitHub Actions

### 2.13.0 (16 Jun 2022)

- #1046	Add Cache Purge Command
- #1050	[dev-env] Change docs link
- #1047	[dev-env] Bump lando package
- #1044	[dev-env] Fix healthchecks No. 2
- #1043	[dev-env] add docker-compose v2 support
- #1042	[dev-env] Fix search popup during wizard
- #1038	[dev-env] Adds domain validation during sql import
- #1040	[dev-env] track dev-env start time in seconds

### 2.12.0 (19 May 2022)

- #1035 and #1032 Improved publishing checks to publish on npm
- #1037 [dev-env] only record the php version numbers   update/clean_php_version
- #999  Add Feature to Support HTTPS/HTTP/NO_PROXY Settings
- #1036 Move DO_NOT_TRACK handling to Analytics lib
- #1033 [dev-env] Bump lando in order to support node 18

#### Special thanks
frank-cerny for the contribution on #999

### 2.11.2 (12 May 2022)

- Hotfix to use correct production config.json in the NPM published package caused by a different NPM version in the build process.

### 2.11.1 (12 May 2022)

- Hotfix to use correct production config.json in the NPM published package

### 2.11.0 (11 May 2022)

- #1022 [dev-env] Validate docker installed
- #1026 [dev-env] adds tracking to stop subcommand
- #1028 Re-calculate the fileMeta if file gets changed by the searchAndReplace
- #1029 Adds Pendo analytics client
- #1030 [dev-env] Fix failure tracking

### 2.10.0 (4 May 2022)

- #1021 [dev-env] Add login info and documentation link to `dev-env info`
- #1023 [dev-env] Skip the trunk from the prompt about the latest available WordPress versions
- #1019 [dev-env] Unifies lando and other dev-env debug logs
- #1018 [dev-env] enable lando debug on `--debug`
- #1017 [dev-env] Adding tracking for create and destroy sub commands
- #1016 [dev-env] Adding tracking for start sub command
- #1020 [dev-env] More tracking

### 2.9.5 (26 April 2022)

- #1005 [dev-env] updateWordPress image improvements
- #1006 Remove renovate.json
- #1007 Set up CodeQL Scanning
- #1008 WP-CLI: Reattach Reconnect-Related Events After a Successful Reconnection
- #1009 Add ability to choose a PHP image to use
- #1010 [dev-env] Add Enterprise Search, XDebug, phpMyAdmin options to the config wizard.

### 2.9.4 (07 April 2022)

- #996 Clean up lint warnings
- #1001 Fix reconnect event listeners
- #1000 Bump socket.io-client from 4.0.1 to 4.4.1

### 2.9.3 (29 March 2022)

- #995 Add debug call to dev-envs handleCLIException
- #992 Add --debug flag to all commands
- #993 [dev-env] Fix in caching version list.
- #994 Fix typo in error message
- #990 [dev-env] Add check for wp folder map add/php_healthcheck
- #991 Adds optional channing since `progress` can be null as per GraphQL schema
- #989 Fixes unit test error `bsdthread_register error`
- #987 Add support for M1 Macs in the search-replace tests

### 2.9.2 (9 March 2022)

- #980 [dev-env] Fix/tag formatting on stapled images
- #986 Clean the build folder prior to rebuilding it
- #985 Adding webP to the list of accepted extensions for files
- #972 Run tests in Windows Env

https://github.com/Automattic/vip/releases/tag/v2.9.2

### 2.9.1 (2 March 2022)

- #982 Remove unused dependencies - Fixes Error: Cannot find module 'core-js'
- #978 [dev-env] Added phpmyadmin proxy value

https://github.com/Automattic/vip/releases/tag/v2.9.1

### 2.9.0 (1 March 2022)

- #966 [dev-env] Dynamic WordPress Image List
- #975 [dev-env] prompt On Unselected Env
- #974 [dev-env] Corrections of text for -h menu in dev-env create
- #973 [dev-env] update Nginx image
- #971 [dev-env] Use custom add user command
- #964 [dev-env] Validate sql on import
- #970 [dev-env] Do not use /tmp as a userConfRoot
- #977 Fix flow errors
- #976 Fix/duplicate shortcut parameter
- #968 Update minimum Node version

https://github.com/Automattic/vip/releases/tag/v2.9.0

### 2.8.2 (27 January 2021)

- #961 Fixes md5 calculation failing when search-replace is used
- #959 Fixes md5 calculation for SQL Imports on VIPd

https://github.com/Automattic/vip/releases/tag/v2.8.2

### 2.8.0 (25 January 2021)

- #952 FORNO-1047: Fix SQL Import for compressed files
- #955 Add Error prefix for "Failed to fetch logs" msg
- #946 Add support for the site logs tailing feature
- #953 [dev-env] Updated list of available wordpress images for dev-env
- #933 Update dependency debug to v4.3.3

https://github.com/Automattic/vip/releases/tag/v2.8.0

### 2.7.1 (10 January 2021)

- #950 Switch to npm-shrinkwrap
- #947 [dev-env] List all dev env alias
- #944 Add `vip whoami` command
- #942 Envvar: Show message when there is an attempt to change the New Relic key.

https://github.com/Automattic/vip/releases/tag/v2.7.1

### 2.7.0 (07 December 2021)

- #941 [dev-env] Bump lando CLI dependency
- #938 Hide roll back message after SQL Import failure for launched sites
- #936 Sets jest maxWorkers to 4

https://github.com/Automattic/vip/releases/tag/v2.7.0

### 2.6.0 (23 November 2021)

- #921 [dev-env] Introuces update to change existing environment
- #928 [dev-env] Switch lando to use our fork
- #927 [dev-env] Handles user already exists during sql import
- #925 [dev-env] Fix the issue with dev-env update
- #924 FORNO-985 Increase SQL Import limit for unlaunched sites to 100GB
- #923 FORNO-943 Fixes a bug which prevents displaying SQL Import error messages
- #922 Update eslint-config-wpvip commit hash to c6605d1
- #873 Pin dependencies

### 2.5.0 (9 November 2021)

- #919 [dev-env] Expose lando core logs
- #916 [dev-env] Save instance data state
- #914 [dev-env] update help wording for dev env
- #915 Add warning message when an envvar is set/deleted

### 2.4.0 (5 November 2021)

- #913 [dev-env] No login required for dev-env
- #911 Adds more release instructions

### 2.3.1 (2 November 2021)

- Fixes an issue with the 2.3.0 where the intended changes didn't get published correctly.

### 2.3.0 (2 November 2021)

- #908 [dev-env] Custom user permissions setup
- #897 [dev-env] Primary domain prompt for primary domain redirect
- #902 [dev-env] Delete file permissions
- #900 Clarify CONTRIBUTING guidelines
- #905 Update contribution steps

### 2.2.0 (27 October 2021)

New: Environment variables command

- #896 Open config envvar command for all customers
- #876 Update envvar list command to only show names
- #879 Add config envvar get and get-all commands
- #875 Temporarily gate access to new config command to VIP staff
- #858 Environment variable CLI commands (list, set, delete)

Fixes:

- #901 Don't mark import as failed until restore has completed
- #899 Proxy fix + healthchecks
- #894 support windows db import
- #889 Proxy config change
- #888 mount wordpress code
- #872 Auto flush cache after import and add vipgo user
- #869 Media redirect to production site.
- #885 Make search data persistent between restarts
- #844 Expose DB and expose extra services in info table
- #865 spawn WP-CLI as root to allow for FS operations
- #895 Fix rmdir deprecation warning
- #870 Add the VIP-CLI release process and release schedule

Dependencies updates:

- #778 Update dependency ini to v2
- #786 Update dependency keytar to v7
- #884 Update dependency cli-columns to v4
- #887 Update dependency lando to v3.4.3
- #874 Update dependency lando to v3.4.0
- #750 Bump hosted-git-info from 2.8.8 to 2.8.9
- #877 Bump tmpl from 1.0.4 to 1.0.5

https://github.com/Automattic/vip/releases/tag/v2.2.0

### 2.1.0 (16 September 2021)

- #857 Remove select DB checks
- #864 Adding WordPress versions to dev-env
- #868 persist database data in between container restarts
- #862 Fix lint warnings
- #867 Update dependency lando to v3.3.2
- #863 Add links to CONTRIBUTING and SECURITY
- #855 Add some helpful hints for new command scaffolding
- #856 Adding media import command on dev environment
- #849 Adding SQL import to dev environment
- #854 Updating command descriptions and arguments on dev-env
- #850 Use official memcached image on dev-env
- #853 Enable ssl forwarding on dev-env
- #851 Conditionally disabling statsd on mu-plugins
- #852 Fixing Prettier format annotation typo
- #843 Removing custom wp-config-defaults
- #848 Not using a prefix to all dev environments
- #847 Update dependency lando to v3.3.0
- #840 Use official Elasticsearch image on dev-env
- #845 Fix MariaDB healthcheck
- #846 dev-env: Update error message for directory prompt
- #842 Removing PHP parameter from dev environment
- #839 Use official MariaDB image and enable version selection on dev-env

https://github.com/Automattic/vip/releases/tag/v2.1.0

### 2.0.14 (26 August 2021)

- Update dependency graphql to v15.5.1 #796
- Update dependency graphql-tag to v2.12.5 #799
- Update dependency debug to v4.3.2 #806
- Remove fake data dev-env commands #830
- Disable statsd by default #831
- Support ES version option #832
- Removing mu-plugins test command #835
- Making PHPMyAdmin optional on dev-env #836
- Patching Docker for Windows in dev-env #837
- enable/disable xdebug #838

https://github.com/Automattic/vip/releases/tag/v2.0.14

### 2.0.13 (19 August 2021)

- Allow user to run multisite import even if wpSites.nodes doesn't exist. #815
- Bumping version number to 2.0.12 #827
- Path resolving fixes #829
- Send header each time #826
- Sets up a volume for media files #825
- Update dependency chalk to v4.1.2 #813
- Update dependency lando to v3.1.4 #797
- Upgrading statsd container to 0.9.0 #828

https://github.com/Automattic/vip/releases/tag/v2.0.13

### 2.0.12 (13 August 2021)

- Using new VIP Docker images for dev-env #818
- Bump path-parse from 1.0.6 to 1.0.7 #819
- Increasing dev-env PMA upload limit to 4G #822
- PIE-2890 Fixes issue where user is unable to login after logout #823

https://github.com/Automattic/vip/releases/tag/v2.0.12

### 2.0.11 (5 August 2021)

- Handle parameter validation in a consistent way #795
- Fix error blocking data sync on CLI sites #810
- Update DB Engine check to reduce false positives #811
- Retrieve the status and steps regardless of the site type. #812
- Dev-Env: Handle relative file paths #802
- Dev-Env: Make dev-env start more resilient #804
- Dev-Env: Validate Path to a component #803
- Dev-Env: Handle multisite = false correctly #809
- Dev-Env: Adds a check for an orphaned proxy container #814
- FORNO-759: Add logged in user details to all Tracks events #801
- FORNO-779: Throttle request to Parker when fetching media import status #808

https://github.com/Automattic/vip/releases/tag/2.0.11

### 2.0.10 (21 June 2021)

- Adds Media Import Abort subcommand
- Disables enterprise search by default
- Handles numbered slugs correctly
- Unifies print table on start command with other commands
- Drops the isVip requirement for dev-env
- Fixes intermittent fatal error caused due to analytics tracking
- Misc dependency updates

https://github.com/Automattic/vip/releases/tag/v2.0.10

### 2.0.9 (3 June 2021)

- Enable SQL import for all site types
- Bug fix for analytics errors causing some commands to fail
- Add the full changelog to the readme
- Improved error output by adding debug info and consistent output/error codes
- Misc dependency updates

https://github.com/Automattic/vip/releases/tag/v2.0.9

### 2.0.8 (27 May 2021)

- [Beta] Media Import: Enable media imports for production WordPress applications
- SQL Import: Enable SQL Import for launched sites
- SQL Import: Enable SQL Import for multisite networks
- SQL Import: Additional input file validation

https://github.com/Automattic/vip/releases/tag/v2.0.8

### 2.0.7 (6 May 2021)

- SQL Import: Add additional multisite validations
- Update socket.io-client to 4.0.1
- Misc. dependency updates

https://github.com/Automattic/vip/releases/tag/v2.0.7

### 2.0.6 (15 Apr 2021)

- SQL Import: Add additional checks for site type

https://github.com/Automattic/vip/releases/tag/v2.0.6

### 2.0.5 (8 Mar 2021)

- Fix a bug when comparing env data to selected environment #697

https://github.com/Automattic/vip/releases/tag/v2.0.5

### 2.0.4 (3 Mar 2021)

- Bump socket.io-client from 2.3.0 to 2.4.0 (Fixes WP-CLI in node 15+) #679
- Additional SQL import file static validations #669

https://github.com/Automattic/vip/releases/tag/v2.0.4

### 2.0.3 (19 Feb 2021)

- Improved SQL import validation around the use of TRIGGER

https://github.com/Automattic/vip/releases/tag/v2.0.3

### 2.0.2 (15 Feb 2021)

- Improved handling of debug output during search & replace
- Updated the vip-search-replace package to ^1.0.13

https://github.com/Automattic/vip/releases/tag/v2.0.2

### 2.0.1 (11 Feb 2021)

- SQL Import: Improved reporting of server-side failures
- SQL Import: Add ability to skip local validation
- Updated the vip-search-replace package to v1.0.12
- SQL Import: Fix and test for multi-site tables that have more than one digit

https://github.com/Automattic/vip/releases/tag/v2.0.1

### 2.0.0 (2 Feb 2021)

- Drops support for Node 8
- Added Security Policy
- Added SQL file import feature for new sites
- Added SQL search and replace feature

https://github.com/Automattic/vip/releases/tag/v2.0.0

### 1.12.1 (8 Sep 2020)

- Updated list of accepted special characters for media files for imports

https://github.com/Automattic/vip/releases/tag/v1.12.1

### 1.12.0 (21 Aug 2020)

- Added multisite support for media files validation
- Added Tracks for SQL and media file validation events

https://github.com/Automattic/vip/releases/tag/v1.12.0

### 1.11.2 (17 Aug 2020)

- Added support for multiple nested folders for the media file validation command

https://github.com/Automattic/vip/releases/tag/v1.11.2

### 1.11.1 (17 Aug 2020)

- Added fix to process the import validation subcommands

https://github.com/Automattic/vip/releases/tag/v1.11.1

### 1.11.0 (17 Aug 2020)

- Added `vip import validate sql` and `vip import validate files` commands to run static validation checks for SQL and media files for imports

https://github.com/Automattic/vip/releases/tag/v1.11.0

### 1.10.0 (12 Jun 2020)

- Added support for specifying a SOCKS proxy through the environment variable VIP_PROXY

https://github.com/Automattic/vip/releases/tag/v1.10.0

### 1.9.0 (30 Mar 2020)

- Added support for [opting out of usage tracking](https://github.com/Automattic/vip/tree/e54d9ee0ce2dd4725ca8718b3aba06db24306ad7#analytics) via `DO_NOT_TRACK` environment variable #547
- Fix interactive commands not working correctly #478
- Show usage information when an unsupported command is entered #527
- Dependency & dev dependency upgrades

https://github.com/Automattic/vip/releases/tag/v1.9.0

### 1.8.0 (25 Sep 2019)

- Fixes around cancelling commands via Ctrl-C
- Gracefully handle remote command cancellation
- Enhance Rollbar logging for additional use cases

https://github.com/Automattic/vip/releases/tag/v1.8.0

### 1.7.0 (15 Aug 15 2019)

- Resume long-running WP-CLI commands in case of network interruptions

https://github.com/Automattic/vip/releases/tag/v1.7.0

### 1.6.2 (25 Jul 2019)

- Corrected some install issues with the 1.6.0/1.6.1 releases.

https://github.com/Automattic/vip/releases/tag/v1.6.2

### 1.6.1 (25 Jul 2019)

- Intermittent release to test some issues with v1.6.0

https://github.com/Automattic/vip/releases/tag/v1.6.1

### 1.6.0 (25 Jul 2019)

- We added ability to cancel running commands.
- We fixed an issue with trailing characters such as line breaks affecting use of command output by scripts.
- Various dependancy updates.

https://github.com/Automattic/vip/releases/tag/v1.6.0

### 1.5.0 (15 Jul 2019)

- Added `--yes` flag for WP-CLI commands to skip confirmation on production environments.
- We fixed the character limit errors raised when running long WP-CLI commands.
- We've added Rollbar to allow us to monitor and address errors
- We updated third party dependencies to newer, more secure versions.

https://github.com/Automattic/vip/releases/tag/v1.5.0

### 1.4.1 (29 Apr 2019)

- No functional changes, 1.4.0 was already taken on NPM :)

https://github.com/Automattic/vip/releases/tag/1.4.1

### 1.4.0 (29 Apr 2019)

- Added "environment alias" support (`vip @my-site.env sync`)
- Added support for WP-CLI commands
- Misc. dependency updates

https://github.com/Automattic/vip/releases/tag/1.4.0

### 1.3.0 (1 Feb 2019)

- We now display information header for every `vip app --app` execution [(#223)](https://github.com/Automattic/vip/pull/223).
- We fixed the logout bug asking the user to login before being able to logout [(#222)](https://github.com/Automattic/vip/pull/222) and we also display a message when a user logout [(#221)](https://github.com/Automattic/vip/pull/221).
- We replaced `inquirer` with `enquirer` [(#229)](https://github.com/Automattic/vip/pull/229).
- We fixed a bug where we didn't check if we can sync to an environment before accessing some information about it [(#230)](https://github.com/Automattic/vip/pull/230).
- We fixed an `EPIPE` bug when hitting `q` in `app list` command [(#225)](https://github.com/Automattic/vip/pull/225).
- We updated third party dependencies to newer, more secure versions.

https://github.com/Automattic/vip/releases/tag/v1.3.0

### 1.2.1 (5 Dec 2018)

- The `1.2.0` version was containing a bug and we published a patch to fix it. Please use this version instead.

https://github.com/Automattic/vip/releases/tag/v1.2.1

### 1.2.0 (5 Dec 2018)

- We now display a preview of the `sync` feature with the backup time and the search/replace taking place in your database.
- We now display your mapped domain instead of the placeholder `go-vip.co` domain in `vip app` and `vip app list`.
- We now display a better message when an app does not have any non-production environments.
- We fixed a bug where the help menu was not showing until you're logged in.
- We updated third party dependencies to newer, more secure versions.

https://github.com/Automattic/vip/releases/tag/v1.2.0

### 1.1.1 (1 Nov 2018)

- Updates dependencies to fix a bug introduced by sub-dependencies.

https://github.com/Automattic/vip/releases/tag/v1.1.1

### 1.1.0 (12 Jul 2018)

- We now correctly report errors when `vip sync` fails. Previously, this would incorrectly report that a sync was run previously.
- We fixed permissions issues for some users with `admin` access for repos. They were unable to properly view and access applications.
- We now display more applications in `vip app list` (up to 100!) and have made it easier to browse through a large list thanks to (`$PAGER`|`less`) support. Previously you would only see the first 10 applications in your account.

https://github.com/Automattic/vip/releases/tag/v1.1.0

### 1.0.0 (2 Jul 2018)

The first release!

- `vip app list`: view a list of all your applications.
- `vip app`: view details about one of your applications.
- `vip sync`: trigger [a data sync](https://vip.wordpress.com/2018/03/28/data-sync-on-vip-go/) to synchronize data from your production environment to non-production environments.

https://github.com/Automattic/vip/releases/tag/v1.0.0
