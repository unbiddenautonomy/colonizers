# What Seafarers and Cities & Knights need from the engine core

This is the acceptance list from PLAN.md section 4.1. The base game was only built once the core passed it, so the two big expansions can be added as modules without rewriting the core.

Each line is proven by a test in `packages/modules/base/test/expansion-readiness.test.ts`. That test builds small stand-in Seafarers and Cities & Knights modules using only the core's public extension points. If a real expansion needs a core change later, this list was wrong and gets updated first.

## How modules plug in

| Extension point                                         | What it's for                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `hexTypes`, `cardTypes`, `decks`, `pieceTypes`, `costs` | New terrain, cards, decks, pieces and prices, as data                                    |
| `actions`                                               | New moves, each with a legality check, an effect, and a list of candidate moves for bots |
| `wrapActions`                                           | Change an existing move by wrapping it (call the old one, then add to it)                |
| `hooks`                                                 | React to events: game start, any move, turn start/end, piece placed, hex changed         |
| `reducers`                                              | Adjust a value: VP, VP target, hand limit, costs, what a hex pays, bank trade ratio      |
| `dice`                                                  | Replace the dice entirely                                                                |
| `redact`                                                | Hide secret module data from other players                                               |
| Phases                                                  | Any module can set the phase to its own id; actions list the phases they're allowed in   |
| Piece `props`                                           | Any per-piece data: level, active, cargo                                                 |
| Player `data`, module `data`                            | Per-player charts and global tracks                                                      |

## Seafarers

| Need                                           | Core feature                                                          | Test                                         |
| ---------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------- |
| Sea hexes and sea edges                        | Hex types with `terrain: 'sea'`; `isSeaEdge`                          | ships are a second kind of edge piece...     |
| Ships as a second kind of edge piece           | Piece type on `edge` with `route: 'sea'`                              | ships are a second kind of edge piece...     |
| Roads and ships join only through a settlement | `longestRoute` switches route kinds only at the player's own building | roads and ships join into one trade route... |
| Moving pieces, not the turn they're built      | `ctx.move`, `piece.placedTurn`                                        | pieces can move (ships)...                   |
| Hidden hexes (fog of war)                      | `hidden` flag, redacted in `view`; reveal via `piecePlaced` hook      | hidden hexes are redacted...                 |
| Gold: choose a resource during production      | `hexYield` reducer plus a wrapped `roll` that adds a choice phase     | gold fields make players choose...           |
| Pirate as a second hex occupant                | Neutral piece type on `hex`; robber limited to land                   | the pirate is a second hex occupant...       |
| Island ownership and island bonus              | `connectedRegions` on land; `vp` reducer                              | islands are found from the board...          |
| Scenario VP targets                            | `vpTarget` setting and reducer                                        | islands are found from the board...          |

## Cities & Knights

| Need                                                | Core feature                                                | Test                                       |
| --------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| Commodities as a second production type             | Card types with `category: 'commodity'`; `hexYield` reducer | cities on forest, pasture and mountains... |
| A third die                                         | `dice` provider (red, yellow, event)                        | a module can replace the dice...           |
| Three card decks drawn by dice                      | `decks`; `drawCard`; wrapped `roll`                         | three progress decks exist...              |
| Global event track (barbarians)                     | Module `data`; wrapped `roll`                               | three progress decks exist...              |
| Pieces with levels and active state                 | Piece `props`; non-building corner pieces                   | pieces have levels and an active state...  |
| Knights block settlements but not the distance rule | `building` flag on piece types; corner must be empty        | pieces have levels and an active state...  |
| Per-player improvement charts                       | Player `data`                                               | three progress decks exist...              |
| Hand limit changes (city walls)                     | `handLimit` reducer                                         | city walls raise the hand limit            |
| Robber inactive until the first attack              | Wrapped `roll` skips the robber phase                       | the robber can start inactive...           |
| VP target 13                                        | `vpTarget` setting                                          | the robber can start inactive...           |
| Commodities count toward the hand limit             | `countsForHandLimit` on card types                          | cities on forest, pasture and mountains... |

## Combinations and player counts

| Need                                  | Core feature                                               | Test                                         |
| ------------------------------------- | ---------------------------------------------------------- | -------------------------------------------- |
| Seafarers + Cities & Knights together | Module dependencies; stacked `wrapActions`                 | Seafarers and Cities & Knights load together |
| Special Building Phase (5–6 players)  | Wrapped `endTurn` adds a phase between turns               | a module can add a phase between turns       |
| Bigger boards and decks               | Card, deck and supply counts are functions of player count | random full games (3 and 4 players)          |
| Invalid mixes refused                 | `requires`, `conflicts`, duplicate definitions             | rejects unknown and conflicting modules      |

Status: all passing. Signed off for phase 1.
