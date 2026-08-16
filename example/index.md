# Archive Index

| Date | Project | Title | Status | Summary |
| --- | --- | --- | --- | --- |
| 2024-08-13 | awesome-api | [Add pagination to the list endpoint](opencode/awesome-api/2024-08-13/Add pagination to the list endpoint.md) | completed | Add cursor-based pagination to GET /items. Keep it backward compatible with the existing `limit` param. → Done. The endpoint now accepts `cursor` and returns `next_cursor` alongside `items`. Backward compatible — `limit` still works when `cursor` is omitted. |
