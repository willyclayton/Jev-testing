const $ = (id) => document.getElementById(id);
const state = { judgments: null, base: null, health: null };

function esc(value) {
  return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function num(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
  return Number(value).toFixed(digits);
}

function situation() {
  return {
    offense: $("offense").value.trim() || "Offense",
    defense: $("defense").value.trim() || "Defense",
    yards_to_go: Number($("yards-to-go").value),
    yards_to_endzone: Number($("yards-to-endzone").value),
    score_diff: Number($("score-diff").value),
    seconds_remaining: Number($("seconds").value),
    sideline_note: $("note").value,
  };
}
function weights() {
  return {
    front: Number($("w-front").value),
    prevent: Number($("w-prevent").value),
    scramble: Number($("w-scramble").value),
    kicker: Number($("w-kicker").value),
  };
}
function constants() {
  return { kickoff_ep: Number($("kickoff").value), net_punt: Number($("net-punt").value) };
}

function spotLine() {
  const yte = Number($("yards-to-endzone").value);
  const spot = yte <= 50 ? `opponent's ${yte}` : `own ${100 - yte}`;
  $("spot").textContent = `Fourth and ${$("yards-to-go").value}, ball on the ${spot}. Kick distance ${yte + 17}.`;
}

function fill(preset) {
  const s = preset.situation;
  $("offense").value = s.offense;
  $("defense").value = s.defense;
  $("yards-to-go").value = s.yards_to_go;
  $("yards-to-endzone").value = s.yards_to_endzone;
  $("score-diff").value = s.score_diff;
  $("seconds").value = s.seconds_remaining;
  $("note").value = s.sideline_note;
  spotLine();
}

function bars(probabilities) {
  return Object.entries(probabilities || {}).map(([key, probability]) => `
    <div class="row"><span>${esc(key)}</span><div class="bar quiet"><span style="width:${Math.max(0, probability) * 100}%"></span></div><span class="num">${num(probability)}</span></div>
  `).join("");
}

function board(title, model, best) {
  const rows = ["go", "kick", "punt"].map((name) => {
    const action = model.actions[name];
    const width = Math.min(100, Math.max(4, (action.expected_points + 2) * 18));
    return `<div class="row"><span>${name} ${name === best ? '<span class="call">call</span>' : ""}</span><div class="bar ${name === best ? "" : "quiet"}"><span style="width:${width}%"></span></div><span class="num">${num(action.expected_points)}</span></div><p class="term">${esc(action.formula)}</p>`;
  }).join("");
  return `<article class="board"><h3>${title}</h3>${rows}</article>`;
}

function render(payload) {
  const decision = payload.decision;
  $("warnings").innerHTML = (payload.warnings || []).map((warning) => `<p class="warn">${esc(warning)}</p>`).join("");
  $("log").innerHTML = (payload.events || []).map((event) => `<li class="${esc(event.level)}">${esc(event.text)}</li>`).join("");
  const requests = (payload.classification && payload.classification.requests) || [];
  const responses = (payload.classification && payload.classification.responses) || [];
  $("hood").innerHTML = requests.map((request, index) => `
    <h3>${esc(request.name)} — ${esc(request.transport)}</h3>
    <pre>${esc(JSON.stringify({ state: request.state, questions: request.questions }, null, 2))}</pre>
    <pre>${responses[index] ? esc(JSON.stringify(responses[index].body, null, 2)) : ""}</pre>
  `).join("");
  if (!decision) {
    $("headline").textContent = "Classification failed. The box score is still in the trace below.";
    $("boards").innerHTML = "";
    $("judgments").innerHTML = "";
    return;
  }
  $("headline").textContent = decision.comparison;
  $("boards").innerHTML = board("Box score", decision.baseline, decision.baseline.best) + board("After the note", decision.adjusted, decision.adjusted.best);
  const fanout = payload.classification.fanout;
  const play = payload.classification.play_call.play_call;
  const trap = payload.classification.trap.what_is_wrong;
  const steps = Object.fromEntries(decision.adjustment.steps.map((step) => [step.name, step]));
  const noul = (id, label, stepName) => {
    const answer = fanout[id];
    const step = steps[stepName];
    const phrase = answer.standin ? `Phrases: ${answer.standin.hits.length ? answer.standin.hits.join(", ") : "none"}. ${answer.standin.how}` : "Live answer. No phrase list comes back.";
    return `<article class="card"><strong>${label}</strong><div class="row"><span>noul</span><div class="bar"><span style="width:${answer.noul * 100}%"></span></div><span class="num">${num(answer.noul)}</span></div><p class="term">${esc(phrase)}</p><p class="term">Delta ${num(step.delta, 4)}. ${esc(step.how)}</p></article>`;
  };
  const scramble = fanout.front_scramble;
  const hand = (scramble.score_terms || []).map((term) => `${term.level} × ${num(term.probability)}`).join(" + ");
  $("judgments").innerHTML = `
    <article class="card"><strong>Play-call Choice</strong><p class="term">${esc(play.standin ? play.standin.note : "This distribution is not an expected point.")}</p>${bars(play.probabilities)}<p class="term">Confidence ${num(play.confidence)}. Demo approximation ${num(play.demo_confidence)}.</p></article>
    <article class="card"><strong>One Choice for two facts</strong><p class="term">${esc(trap.standin ? trap.standin.note : "Live answer.")}</p>${bars(trap.probabilities)}<p class="term">Confidence ${num(trap.confidence)}. Demo approximation ${num(trap.demo_confidence)}.</p></article>
    ${noul("front_compromised", "Front is compromised", "front")}
    ${noul("prevent_look", "Prevent look", "prevent")}
    ${noul("kicker_conditions_bad", "Kick conditions are bad", "kicker")}
    <article class="card"><strong>Front scramble</strong><p class="term">score ${num(scramble.score)} = ${esc(hand)}</p>${bars(scramble.probabilities)}<p class="term">${esc(scramble.standin ? scramble.standin.how : "Live answer.")}</p><p class="term">Delta ${num(steps.scramble.delta, 4)}.</p></article>
  `;
}

async function health() {
  try {
    const response = await fetch("api/health");
    if (!response.ok) return null;
    return await response.json();
  } catch (_error) {
    return null;
  }
}

function setStatus() {
  const status = $("status");
  if (state.health && state.health.key_configured) {
    status.className = "status live";
    status.textContent = "This server is holding a TypeSafe key. Run still uses the rubric. The key is not in the page.";
    return;
  }
  status.className = "status";
  status.textContent = state.health
    ? "This server has no TypeSafe key. The phrase rubric in the page is doing the classification. Jev is not being called."
    : "This is a static page. The phrase rubric here is doing the classification. Jev is not being called.";
}

function remember(payload) {
  state.base = payload.classification;
  state.judgments = payload.classification && payload.classification.fanout;
  render(payload);
}

function rerunMath() {
  if (!state.judgments || !state.base) return remember(Sideline.worksheet(situation(), { weights: weights(), constants: constants() }));
  const decision = Sideline.decide(situation(), state.judgments, weights(), constants());
  render({
    classification: state.base,
    decision,
    events: state.base.events.concat(decision.events),
    warnings: state.base.warnings.concat(decision.warnings),
  });
}

async function boot() {
  state.health = await health();
  setStatus();
  $("sources").innerHTML = Object.values(Sideline.SOURCES).map((line) => `<li>${esc(line)}</li>`).join("")
    + "<li>Inside the 10, and past 95 yards, the curve is extended. The trace says when that happens.</li>"
    + "<li>Nouls from 0.35 to 0.65 do not move a rate. The Score is recomputed as the probability-weighted mean of the levels.</li>";
  $("w-front").value = Sideline.DEFAULT_WEIGHTS.front;
  $("w-prevent").value = Sideline.DEFAULT_WEIGHTS.prevent;
  $("w-scramble").value = Sideline.DEFAULT_WEIGHTS.scramble;
  $("w-kicker").value = Sideline.DEFAULT_WEIGHTS.kicker;
  $("kickoff").value = Sideline.DEFAULT_KICKOFF_EP;
  $("net-punt").value = Sideline.DEFAULT_NET_PUNT;
  ["front", "prevent", "scramble", "kicker"].forEach((name) => {
    $(`w-${name}-out`).textContent = Number($(`w-${name}`).value).toFixed(2);
    $(`w-${name}`).addEventListener("input", () => {
      $(`w-${name}-out`).textContent = Number($(`w-${name}`).value).toFixed(2);
      rerunMath();
    });
  });
  ["kickoff", "net-punt"].forEach((id) => $(id).addEventListener("change", rerunMath));
  ["yards-to-go", "yards-to-endzone"].forEach((id) => $(id).addEventListener("input", spotLine));
  const box = $("presets");
  Sideline.PRESETS.forEach((preset, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = preset.title;
    button.addEventListener("click", () => {
      [...box.children].forEach((child) => child.classList.remove("active"));
      button.classList.add("active");
      fill(preset);
      remember(Sideline.worksheet(situation(), { weights: weights(), constants: constants() }));
    });
    box.appendChild(button);
    if (index === 0) button.classList.add("active");
  });
  $("run").addEventListener("click", () => {
    [...box.children].forEach((child) => child.classList.remove("active"));
    remember(Sideline.worksheet(situation(), { weights: weights(), constants: constants() }));
  });
  $("probe").addEventListener("click", () => {
    const result = Sideline.probe(situation());
    $("probe-out").innerHTML = `<article class="card"><strong>Name probe</strong>${result.events.map((event) => `<p class="term">${esc(event.text)}</p>`).join("")}<p class="term">${esc(result.original_names.offense)} on offense: more physical ${num(result.original_names.answers.more_physical.noul)}, better coached ${num(result.original_names.answers.better_coached.noul)}</p><p class="term">${esc(result.swapped_names.offense)} on offense: more physical ${num(result.swapped_names.answers.more_physical.noul)}, better coached ${num(result.swapped_names.answers.better_coached.noul)}</p><p class="term">Gap ${num(result.gaps.more_physical, 4)} and ${num(result.gaps.better_coached, 4)}.</p></article>`;
  });
  fill(Sideline.PRESETS[0]);
  remember(Sideline.worksheet(situation(), { weights: weights(), constants: constants() }));
}

boot();
