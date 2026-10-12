# Feed verification log

No feed URL has been inserted or marked verified. The request requires a real request before `verified: true`; this local implementation has not contacted candidate publishers. Add a record for every candidate and retain blocked/paywall candidates as `blocked` instead of silently excluding them.

| Language | Candidate outlet       | RSS URL | Allowed domains | HTTP result | Article samples / average body length | Blocked or paywall | Decision |
| -------- | ---------------------- | ------- | --------------- | ----------- | ------------------------------------- | ------------------ | -------- |
| en       | Pending user selection | —       | —               | Not checked | —                                     | —                  | pending  |
| zh       | Pending user selection | —       | —               | Not checked | —                                     | —                  | pending  |
| fr       | Pending user selection | —       | —               | Not checked | —                                     | —                  | pending  |
| ja       | Pending user selection | —       | —               | Not checked | —                                     | —                  | pending  |

Requirement: keep five candidate outlets per language in this log after outlet selection; check each by actual HTTP request, inspect two short/medium/long article samples as available, record status/body length/paywall, then enable only user-selected verified feeds in `config/feeds.json`.
