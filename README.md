# vip [![Build Status](https://travis-ci.com/Automattic/vip.svg?token=xWx9qCRAJeRdHxEcWW83&branch=master)](https://travis-ci.com/Automattic/vip)

VIP CLI is your tool for interacting with and managing your VIP applications.

## Getting started

First, install the package:

```
npm install -g @automattic/vip
```

Then, launch the command and follow the prompts:

```
vip
```

If you need more information, check out our [VIP CLI documentation](https://vip.wordpress.com/documentation/vip-go/vip-cli/).

## Changelog

### 1.6.2
- Corrected some install issues with the 1.6.0/1.6.1 releases. 

### 1.6.0

- We added ability to cancel running commands.
- We fixed an issue with trailing characters such as line breaks affecting use of command output by scripts.
- Various dependancy updates.

### 1.5.0

- Added `--yes` flag for WP-CLI commands to skip confirmation on production environments.
- We fixed the character limit errors raised when running long WP-CLI commands.
- We've added Rollbar to allow us to monitor and address errors
- We updated third party dependencies to newer, more secure versions.

### 1.4.1

- No functional changes, 1.4.0 was already taken on NPM :)

### 1.4.0

- Added "environment alias" support (`vip @my-site.env sync`)
- Added support for WP-CLI commands
- Misc. dependency updates

### 1.3.0

- We now display information header for every `vip app --app` execution [(#223)](https://github.com/Automattic/vip/pull/223).
- We fixed the logout bug asking the user to login before being able to logout [(#222)](https://github.com/Automattic/vip/pull/222) and we also display a message when a user logout [(#221)](https://github.com/Automattic/vip/pull/221).
- We replaced `inquirer` with `enquirer` [(#229)](https://github.com/Automattic/vip/pull/229).
- We fixed a bug where we didn't check if we can sync to an environment before accessing some information about it [(#230)](https://github.com/Automattic/vip/pull/230).
- We fixed an `EPIPE` bug when hitting `q` in `app list` command [(#225)](https://github.com/Automattic/vip/pull/225).
- We updated third party dependencies to newer, more secure versions.

### 1.2.1

- The `1.2.0` version was containing a bug and we published a patch to fix it. Please use this version instead.

### 1.2.0

- We now display a preview of the `sync` feature with the backup time and the search/replace taking place in your database.
- We now display your mapped domain instead of the placeholder `go-vip.co` domain in `vip app` and `vip app list`.
- We now display a better message when an app does not have any non-production environments.
- We fixed a bug where the help menu was not showing until you're logged in.
- We updated third party dependencies to newer, more secure versions.

https://github.com/Automattic/vip/releases/tag/v1.2.0

### 1.1.0

- We now correctly report errors when `vip sync` fails. Previously, this would incorrectly report that a sync was run previously.
- We fixed permissions issues for some users with `admin` access for repos. They were unable to properly view and access applications.
- We now display more applications in `vip app list` (up to 100!) and have made it easier to browse through a large list thanks to (`$PAGER`|`less`) support. Previously you would only see the first 10 applications in your account.

https://github.com/Automattic/vip/releases/tag/v1.1.0

### 1.0.0

The first release!

- `vip app list`: view a list of all your applications.
- `vip app`: view details about one of your applications.
- `vip sync`: trigger [a data sync](https://vip.wordpress.com/2018/03/28/data-sync-on-vip-go/) to synchronize data from your production environment to non-production environments.

More details at:
- https://vip.wordpress.com/2018/06/21/a-command-line-interface-cli-for-your-vip-sites/
- https://github.com/Automattic/vip/releases/tag/v1.0.0
