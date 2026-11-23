# Add-on art fixes and piece finishes: what Nachi chose (2026-11-23)

Mock-ups are in this folder (addon-fixes-mockup*.png, player-piece-finishes.png).
Ready-made images are in `assets/`. Everything was shown on Casino. It applies to Basic Clean
and Casino, the only boards that expansion games allow.

## 1. Player-piece finish (new setting, dropdown)

Every piece the game tints with the player's colour (settlement, city, ship, harbor, knights,
wagon, nuke, the white figures, metropolis tower). Today this is `tinted()` in `theme/boards/kit.tsx`.
Three options in a dropdown, chosen by each user (a local setting like the other look options):

- **Enamel**: grey → a ramp of the player's colour, plus a gloss from the top left.
- **Enamel + glow**: Enamel plus a soft halo in the player's colour.
- **Lounge jewel**: a deeper ramp, a lit inner edge and a polished gold trim.
  **Default: Enamel** (Nachi, 2026-11-23).

Filter recipe used in the mock-up (S = hex size 60, colour channels r,g,b in 0..1, mix(c,w)=c+(1-c)*w):

```
ramp table per channel:
  enamel/glow: [0.02, c*.25, c*.5, c*.75, c*.95, mix(c,.15)]
  lounge:      [0.02, c*.2, c*.36, c*.52, c*.7, mix(c,.08)]
steps: feColorMatrix to grey (0.3 .59 .11) → feComponentTransfer table (the ramp) = "ramp"
  body  = SourceAlpha with feFuncA linear slope 4 intercept -2.4
  bump  = feGaussianBlur(body, 0.045*S)
  spec  = feSpecularLighting(bump, surfaceScale 4, specularConstant .9, exponent 22, white,
          feDistantLight azimuth 225 elevation 42), composited "in" body
  lit   = arithmetic(ramp, spec, k2=1, k3=.55), then "in" SourceAlpha = piece
  rim   = dilate(body, .02*S) filled with the board ink
  glow:   halo = blur(body, .09*S) filled with the player colour at .95, merged twice under rim+piece
  lounge: gold  = dilate(body,.045*S) filled #d9a93a, plus a specular sheen (#fff4cf, exponent 14,
                  surfaceScale 3) on a blur(.01*S) of that shape, arithmetic k2=1 k3=.6
          outer = dilate(body,.062*S) filled with ink
          bevel = (body minus erode(body,.035*S)), blur .012*S, filled mix(colour,.45) at .7, in SourceAlpha
          merge: outer, gold, rim, piece, bevel
```

## 2. Metropolis replaces the city

It's one tower in the player's colour at about 1.05× hex height, drawn instead of the city (not
beside it). The emblem sits on top, untinted, metallic and 75% bigger (Nachi asked for bigger again):
trade = gold scales, politics = steel-blue shield and flag, science = green book.

- `assets/metro-tower-<m>.png` is the tower body in grey and white with the old emblem cut out.
  It's tinted like any piece.
- `assets/metro-emblem-<m>.png` is the emblem layer on the same canvas, drawn on top untinted.
- `make-metro-towers.py` rebuilds both from art/casino/metro-*.webp (run with 1.75 as its argument).
- Note: the current metro-trade.webp and metro-politics.webp are **swapped**. The scales file is named
  politics. The script maps them the right way (scales = trade).

## 3. Damaged city (Soldiers & Armies)

`assets/city-broken.png` is the Casino city with the tower top and tank snapped off, plus cracks.
Draw it tinted and dimmed to 60%, in place of the faded normal city.
Basic Clean needs the same edit to its city.

## 4. Extra sails (final, see extra-sails-final.png)

No separate sail picture. While a ship is boosted:

- a **gold aura** round the whole ship sprite: dilate SourceAlpha by 1.2, blur stdDeviation 3.2,
  flood #ffcf4a, merged twice under the ship (at hex size S = 60);
- three matching **wind lines** behind the stern: white, stroke 1.25, opacity .6, round caps;
  each `M(x+17, foot+dy) q8,4 16,0` for dy = -21, -14, -7, where x is the ship's centre
  (ship drawn from x-30..x+30) and foot = the ship image's foot (-10 + 0.168 S from the edge midpoint).
  The curve dips in the middle and turns up at both ends.
  `assets/extra-sails.png` is no longer used.

## 5. Dragons

- Dragon hex: drop the dark red wash over the whole hex. Use a glowing **pink** border (#ff5fa2,
  same style as the barbarians' red border, width .07 S, glow filter) and a small painted dragon
  (dragon1, about 0.4 S) beside the number.
- Cut road (a road between two dragon hexes): a cross pattée turned 45° into an × (from the
  Lounge sheet's #35), red #b3193a with an outline #4a0716 and a white edge. Total span about
  0.38 S (0.42 S scaled down 10%). The hex itself gets no ×.
- Dragon colour (final, Nachi 18:36 UTC, see dragon-colours-2.png rows 5a and 3a): dragons are neutral, so they
  get a fixed colour, never a player's. Enamel finish (same filter as the player Enamel, gloss from the top
  left), with the shade darkening with strength. It's a setting with two choices:
  - **Gold (default)**: tier 1 #f6dc8a, tier 2 #d29d2c, tier 3 #8a5a1e
  - **Emerald**: tier 1 #86e6b0, tier 2 #21a35a, tier 3 #0f5a33
    The ramp used in the mock-up for dragons: [0.02, c*.28, c*.55, c*.8, c*.97, mix(c,.3)], with specular k3 .5.
- Desert lair: the 🐉 emoji circle is replaced by the painted dragon1 in the tier-2 shade, with the count
  in gold #f6d27a and a dark outline. (Obsidian lair idea dropped.)
- Dragon hexes keep the pink border and the small dragon (also in the chosen colour).

## Still open

- Nothing. Nachi said to proceed and merge the PRs once they're fixed (2026-11-23 18:24 UTC).
