# Security policy

## Reporting a vulnerability

Please **do not open a public issue**. Report it privately through GitHub: [Security › Report a vulnerability](https://github.com/moraliasp/leve/security/advisories/new).

Include the Leve version, your OS and, if possible, a Markdown file that reproduces the problem. We aim to reply within 7 days and to ship a fix for confirmed issues in the next release.

## Supported versions

Only the latest release receives security fixes. Leve can update itself (*Check for Updates…*).

## Scope

Of particular interest: a Markdown document that runs script, reaches files it wasn't granted, loads remote content without the user asking, navigates the app window, or covers the app's own interface; and anything that weakens the update signature check.
