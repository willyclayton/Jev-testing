# Fourth down

A static page. The sideline note is classified in the browser. Expected points are computed in `lab.js`. Jev is not called.

Open `index.html`, or:

```bash
python3 server.py
```

http://127.0.0.1:8765

```bash
node --test tests/lab.test.mjs
```

## Host

**GitHub Pages.** The page has no build step and no secrets, so this repo is the right place to put it. After merge:

1. Settings → Pages → Source: **GitHub Actions**
2. The workflow in `.github/workflows/pages.yml` publishes `index.html`, `app.js`, `lab.js`, and `styles.css`.

The URL will be https://willyclayton.github.io/Jev-testing/

Cloudflare Pages is the better host later, if you add live Jev: it can hold `TYPESAFE_API_KEY` in a Function. GitHub Pages cannot. Do not put a key in this repository.
