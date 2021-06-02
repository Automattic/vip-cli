
VIP-CLI is your tool for interacting with and managing your VIP applications.

## Getting started

First, install the package:

```
npm install -g @automattic/vip
```

Then, launch the command and follow the prompts:

```
vip
```

If you need more information, check out our [VIP CLI documentation](https://docs.wpvip.com/technical-references/vip-cli/).

## Analytics

By default, we record information about the usage of this tool using an in-house analytics sytem. If you would prefer to opt-out of this data collection, you can do so via the `DO_NOT_TRACK` environment variable. You may either export it in your shell configuration or specify it on the command line (e.g. `DO_NOT_TRACK=1 vip app list`).

## Changelog

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
