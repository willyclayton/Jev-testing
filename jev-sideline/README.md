# Fourth down

A static page. The sideline note is classified with a phrase rubric that runs in the browser. Expected points are computed in `lab.js`. [Jev](https://simonwillison.net/2026/Sep/21/jev/) is not called.

```bash
python3 server.py
```

Open http://127.0.0.1:8765

```bash
node --test tests/lab.test.mjs
```

## Publish

Put this folder in your own git repository and turn on GitHub Pages for the branch root (or Cloudflare Pages / Netlify, same files). The page has no build step.

This session is not logged into GitHub, so it cannot create that repository or the Pages site.

## What you provide

1. A git host and an empty repository, if you want a URL that stays up. Nothing else is required for the page as it stands.
2. A TypeSafe API key, only if you later want live Jev. Keep it in the environment of a server you run. Do not put it in the repository or in the page. The Jev API does not send `Access-Control-Allow-Origin`, so the browser cannot call it directly.
3. A process that can hold that key and proxy `POST /v1/systemone`, only for that live path. `python3 server.py` currently serves the files and reports whether the key is set. It does not proxy yet.

## What the page is doing

Fourth and 3 at the opponent’s 32. The tables prefer the kick. The wind-and-tired-edge note moves the weighted path to go. An empty note leaves the kick. A note that says “kick” makes the play-call Choice follow that word, while the expected-points path can still go. Weights recompute from the judgments already on the page.

Score and clock are on the form and are not read by the expected-points math. Inside the 10, and past the printed 95-yard knot, the curve is extended and the trace says so. Field-goal make rates are rounded classroom bins. A made field goal defaults to 3 minus 0.70, Burke’s 2009 kickoff value.
