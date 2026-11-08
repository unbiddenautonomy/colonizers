# Cloudflare free plan: limits and what they mean for us

Checked on 8 November 2026 against Cloudflare's docs. Free plan limits change, so re-check before each big phase.

## The numbers

| Product         | Limit (free plan)                                                       | Source                                                                                                    |
| --------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Workers         | **10 ms CPU** per request (waiting on network or storage doesn't count) | [Workers limits](https://developers.cloudflare.com/workers/platform/limits/)                              |
| Workers         | 100,000 requests per day, reset at 00:00 UTC                            | same                                                                                                      |
| Workers         | 128 MB memory, 50 outgoing requests per request                         | same                                                                                                      |
| Static assets   | Free and unlimited                                                      | [Static assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) |
| Durable Objects | **30 s CPU** per request or WebSocket message                           | [Durable Objects limits](https://developers.cloudflare.com/durable-objects/platform/limits/)              |
| Durable Objects | 100,000 requests per day (WebSocket messages count)                     | [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)            |
| Durable Objects | 13,000 GB-s of run time per day; hibernated objects cost nothing        | same                                                                                                      |
| Durable Objects | 5 M rows read, 100,000 rows written per day; 5 GB stored                | same                                                                                                      |
| Durable Objects | SQLite storage only (no key-value storage on free)                      | limits page                                                                                               |
| D1              | 10 databases, 500 MB each, 5 GB total                                   | [D1 limits](https://developers.cloudflare.com/d1/platform/limits/)                                        |
| D1              | 5 M rows read, 100,000 rows written per day                             | [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/)                                      |

## What changes in the plan

1. **Heavy work goes inside Durable Objects, not plain Workers.** A plain Worker gets 10 ms of CPU per request, but a Durable Object gets 30 seconds per request or message, on the free plan too. So:
   - **Password hashing** runs inside a small Durable Object (an "auth hasher"). PBKDF2 with a strong iteration count likely takes more than 10 ms, which would break login in a plain Worker. Inside a Durable Object it fits easily. We benchmark this on the real deployment in phase 7, and Supabase Auth stays the fallback.
   - **Bots of every level can run on the server**, inside the game room's Durable Object, which already holds the game state. Hard bots no longer have to run in the host's browser. We still keep that option if a Hard bot's thinking turns out to be too slow for players waiting on it, but it is not forced by limits anymore.
2. **One Worker serves both the website and the API**, instead of Cloudflare Pages plus a separate Worker. Static files are free and don't count against the Worker. One address for everything means no cross-site setup and simpler login cookies. Cloudflare has been moving new projects this way, and Pages is still an option if we ever need it.
3. **Keep WebSocket traffic lean.** Every message a player sends to a room counts as a request (100,000 per day across all games). A 4-player game sends roughly 1,000 to 2,000 messages, so this allows around 50 or more full games a day. That is plenty for friend groups, but we shouldn't send heartbeats or typing indicators every second. Messages from the server to players are free.
4. **Keep writes small.** 100,000 row writes per day each for Durable Objects and D1. Each game action writes one event row, and we save a full snapshot only every so often, not after every action.
5. **Run time is not a concern.** 13,000 GB-s a day is about 29 hours of one room being awake, and rooms hibernate between messages.

If we ever outgrow the free plan, Workers Paid is $5 a month and lifts all of these by a large margin.
