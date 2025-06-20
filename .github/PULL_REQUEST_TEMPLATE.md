## For Automatticians!

:wave: Just a quick reminder that this is a public repo. Please don't include any internal links or sensitive data (like PII, private code, client names, site URLs, etc. If you're not sure if something is safe to share, please just ask!

If you're not an Automattician, welcome! We look forward to your contribution! :heart:

Please remove this section before submitting the PR.

---

## Description

A few sentences describing the overall goals of the Pull Request.

Should include any special considerations, decisions, and links to relevant GitHub issues.

Please don't include internal or private links :)

## Changelog Description

<!-- Changelogs are published for our customers. Well-written entries help them stay informed on platform changes and all of the great work that we do! -->

<!-- Write a concise description of changes in the relevant section.
- Add new line items as needed.
- Entries should follow the [Common Changelog Style Guide](https://github.com/vweevers/common-changelog).
- Remove all unused sections before merging.
- Proof-read.
-->

### Added

- <!-- e.g. "Added a new set of filters for MFA status" -->
- <!-- e.g. "Dev-env: Added PHP 8.3 image" -->

### Removed

- <!-- e.g. "Dropped support of Node.js 14" -->

### Fixed

- <!-- e.g. "Fixed a bug causing blank lines in content to be ignored when using the Regex Parser" -->

### Changed

- <!-- e.g. "Increased priority of wp_mail_from filter in VIP Dashboard to prevent unintentional overriding" -->
- <!-- e.g. "HyperDB: Updated to latest version to fix PHP error with addslashes()" -->

## Pull request checklist

- [ ] Update [SETUP.md](https://github.com/Automattic/vip-cli/blob/trunk/docs/SETUP.md#list-of-environmental-variables) with any new environmental variables.
- [ ] Update [the documentation](https://github.com/Automattic/vip-cli/blob/trunk/docs).
- [ ] [Manually test](https://github.com/Automattic/vip-cli/blob/trunk/docs/TESTING.md#manual-testing) the relevant changes.
- [ ] Follow the [pull request checklist](https://github.com/Automattic/vip-cli/blob/trunk/docs/RELEASING.md#new-pull-requests)
- [ ] Add/update [automated tests](https://github.com/Automattic/vip-cli/blob/trunk/docs/TESTING.md#automated-testing) as needed.

## New release checklist

- [ ] [Automated tests](https://github.com/Automattic/vip-cli/blob/trunk/docs/TESTING.md#automated-testing) pass.
- [ ] The [Preparing for release checklist](https://github.com/Automattic/vip-cli/blob/trunk/docs/RELEASING.md#preparing-for-release) is completed.

## Steps to Test

Outline the steps to test and verify the PR here.

Example:

1. Check out PR.
1. Run `npm run build`
1. Run `./dist/bin/vip-cookies.js nom`
1. Verify cookies are delicious.
