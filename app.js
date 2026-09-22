const $ = (id) => document.getElementById(id);

const LABELS = {
  "wind-and-edge": "Wind",
  "empty-note": "Empty",
  "coach-says-kick": "Coach says kick",
  prevent: "Prevent",
  chatter: "Noise",
};

function situation() {
  return {
    offense: "State",
    defense: "Central",
    yards_to_go: Number($("yards-to-go").value),
    yards_to_endzone: Number($("yards-to-endzone").value),
    score_diff: 0,
    seconds_remaining: 240,
    sideline_note: $("note").value,
  };
}

function num(value, digits = 2) {
  return Number(value).toFixed(digits);
}

function pct(value) {
  return `${(Number(value) * 100).toFixed(1)}%`;
}

function term(action, name) {
  return action.terms.find((item) => item.name === name);
}

function signed(value, digits = 2) {
  const n = Number(value);
  return `${n >= 0 ? "+" : ""}${num(n, digits)}`;
}

function hitsLine(answer) {
  const logit = answer.standin && answer.standin.logit;
  if (!logit) return "live answer";
  const hits = logit.hits.length ? logit.hits.join(", ") : "none";
  const counters = (logit.counters || []).length ? `; counter ${logit.counters.join(", ")}` : "";
  return `${hits}${counters}`;
}

function noulEq(answer) {
  const logit = answer.standin && answer.standin.logit;
  if (!logit) return `<p class="eq">noul ${num(answer.noul, 3)}</p>`;
  const counter = logit.counters.length ? ` − ${num(Math.abs(logit.counter), 1)}×${logit.counters.length}` : "";
  return `<p class="eq">z = ${num(logit.prior, 2)} + ${logit.hit}×${logit.hits.length}${counter} = ${num(logit.z, 2)}</p><p class="eq">σ(z) = 1/(1+e<sup>−z</sup>) = ${num(answer.noul, 3)}</p>`;
}

function mathSteps(payload) {
  const decision = payload.decision;
  const sit = situation();
  const base = decision.baseline;
  const adj = decision.adjusted;
  const go = base.actions.go;
  const kick = base.actions.kick;
  const punt = base.actions.punt;
  const fanout = payload.classification.fanout;
  const play = payload.classification.play_call.play_call;
  const successYards = sit.yards_to_endzone - sit.yards_to_go;
  const failYards = 100 - sit.yards_to_endzone;
  const net = decision.constants.net_punt;
  const landing = failYards + net;
  const success = term(go, "success value");
  const fail = term(go, "fail value");
  const make = term(kick, "make value");
  const miss = term(kick, "miss value");
  const L = Sideline.LOGIT;
  const successText = successYards <= 0
    ? `a conversion is a touchdown, worth ${num(success.value)}`
    : `a first down ${successYards} yards from the end zone is worth ${num(success.value)}`;
  const missHow = sit.yards_to_endzone <= 20
    ? `A miss comes out to the 20, worth ${num(miss.value)}`
    : `A miss is ${num(miss.value)}, and the opponent takes over`;
  const puntText = landing >= 100
    ? `A ${net}-yard net punt from here is a touchback. Opponent first-and-10 from their 25 is worth ${num(punt.expected_points)}.`
    : `A ${net}-yard net punt from here leaves the opponent ${landing} yards from the end zone, worth ${num(punt.expected_points)}.`;

  const playLogits = play.standin && play.standin.logits
    ? `ℓ = (go ${num(play.standin.logits.go, 1)}, kick ${num(play.standin.logits.kick, 1)}, punt ${num(play.standin.logits.punt, 1)})`
    : "";
  const playFound = (play.standin && play.standin.found) || [];
  const playWord = playFound.length
    ? `"${playFound.join(", ")}" adds +${L.play} to that log-odds, so P(${play.choice}) = ${pct(play.probabilities[play.choice])}. That is the play-call word, not the make rate.`
    : `No go/kick/punt word. ℓ stays at 0, softmax is even, P(kick) = ${pct(play.probabilities.kick)}.`;

  const steps = [
    `<li><strong>Spot.</strong> Fourth and ${sit.yards_to_go}, ${sit.yards_to_endzone} yards to the end zone. The kick is from ${kick.kick_distance} yards (${sit.yards_to_endzone} + 17).</li>`,
    `<li><strong>Logit.</strong> A yes/no is log-odds z, then a probability. Prior is “no”: logit(0.06) = ${num(L.prior, 2)}. Each matching phrase adds +${L.hit}. A counter-phrase subtracts ${Math.abs(L.counter)}.<p class="eq">σ(z) = 1/(1+e<sup>−z</sup>)</p><p class="eq">z = ${num(L.prior, 2)} + ${L.hit}×hits${` − ${Math.abs(L.counter)}×counters`}</p></li>`,
    `<li><strong>Front.</strong> ${hitsLine(fanout.front_compromised)}.${noulEq(fanout.front_compromised)}</li>`,
    `<li><strong>Kick conditions.</strong> ${hitsLine(fanout.kicker_conditions_bad)}.${noulEq(fanout.kicker_conditions_bad)}</li>`,
    `<li><strong>Prevent.</strong> ${hitsLine(fanout.prevent_look)}.${noulEq(fanout.prevent_look)}</li>`,
    `<li><strong>Play-call word.</strong> ${playWord}<p class="eq">${playLogits}</p><p class="eq">P(a) = e<sup>ℓ_a</sup> / Σ e<sup>ℓ</sup> → go ${pct(play.probabilities.go)}, kick ${pct(play.probabilities.kick)}, punt ${pct(play.probabilities.punt)}</p></li>`,
  ];

  const evidenceLines = decision.adjustment.steps
    .filter((step) => step.name !== "scramble")
    .map((step) => {
      const noul = step.name === "kicker" ? fanout.kicker_conditions_bad.noul
        : step.name === "prevent" ? fanout.prevent_look.noul
        : fanout.front_compromised.noul;
      const rate = step.name === "kicker" ? "make rate" : "conversion";
      return `<p class="eq">${step.name}: noul ${num(noul, 3)} → evidence ${num(step.evidence, 2)}, Δ = ${num(step.weight, 2)}×${num(step.evidence, 2)} = ${signed(step.delta, 3)} on ${rate}</p>`;
    })
    .join("");
  steps.push(`<li><strong>Rates.</strong> noul below 0.65 does not move a table. Above 0.65, evidence = (noul − 0.65) / 0.35.${evidenceLines}<p class="eq">convert ${pct(go.p_table)} → ${pct(adj.actions.go.p)}</p><p class="eq">make ${pct(kick.p_table)} → ${pct(adj.actions.kick.p)}</p></li>`);

  steps.push(
    `<li><strong>Go.</strong> If it works, ${successText}. If it fails, the opponent takes over ${failYards} yards from their end zone, worth ${num(fail.value)}.<p class="eq">${num(adj.actions.go.p, 3)} × ${num(success.value)} + ${num(1 - adj.actions.go.p, 3)} × ${num(fail.value)} = ${num(adj.actions.go.expected_points)}</p></li>`,
    `<li><strong>Kick.</strong> A make is ${num(make.value)} (3 minus a ${num(decision.constants.kickoff_ep)} kickoff). ${missHow}.<p class="eq">${num(adj.actions.kick.p, 3)} × ${num(make.value)} + ${num(1 - adj.actions.kick.p, 3)} × ${num(miss.value)} = ${num(adj.actions.kick.expected_points)}</p></li>`,
    `<li><strong>Punt.</strong> ${puntText}</li>`,
  );

  if (base.best === adj.best) {
    steps.push(`<li><strong>Call ${adj.best}.</strong> Tables ${num(base.actions[base.best].expected_points)}, after the note ${num(adj.actions[adj.best].expected_points)}.</li>`);
  } else {
    steps.push(`<li><strong>Call ${adj.best}.</strong> Tables had ${base.best} at ${num(base.actions[base.best].expected_points)}. After the logits, ${adj.best} ${num(adj.actions[adj.best].expected_points)} against ${base.best} ${num(adj.actions[base.best].expected_points)}.</li>`);
  }
  return steps.join("");
}

function list(model) {
  return ["go", "kick", "punt"]
    .map((name) => `<li class="${name === model.best ? "best" : ""}"><span>${name}</span><span>${num(model.actions[name].expected_points)}</span></li>`)
    .join("");
}

function noted(fanout) {
  const bits = [];
  if (fanout.front_compromised.noul > 0.65) bits.push("tired front");
  if (fanout.kicker_conditions_bad.noul > 0.65) bits.push("wind or a miss");
  if (fanout.prevent_look.noul > 0.65) bits.push("prevent look");
  return bits.length ? bits.join(" · ") : "Nothing in the note moves the tables.";
}

function render(payload) {
  const decision = payload.decision;
  const mathOpen = $("math").open;
  if (!decision) {
    $("call").textContent = "";
    $("why").textContent = "Could not classify that note.";
    $("baseline").innerHTML = "";
    $("adjusted").innerHTML = "";
    $("read").textContent = "";
    $("math-steps").innerHTML = "";
    $("math").open = mathOpen;
    return;
  }
  const play = payload.classification.play_call.play_call;
  const before = decision.baseline.best;
  const after = decision.adjusted.best;
  $("call").textContent = after;
  $("baseline").innerHTML = list(decision.baseline);
  $("adjusted").innerHTML = list(decision.adjusted);
  let why = before === after ? `Both pick ${after}.` : `The note moved it from ${before} to ${after}.`;
  if (play.choice !== after && play.confidence > 0.4) why += ` The note says ${play.choice}.`;
  $("why").textContent = why;
  $("read").textContent = noted(payload.classification.fanout);
  $("math-steps").innerHTML = mathSteps(payload);
  $("math").open = mathOpen;
}

function run() {
  render(Sideline.worksheet(situation()));
}

function fill(preset) {
  const s = preset.situation;
  $("yards-to-go").value = s.yards_to_go;
  $("yards-to-endzone").value = s.yards_to_endzone;
  $("note").value = s.sideline_note;
}

function boot() {
  const nav = $("presets");
  Sideline.PRESETS.forEach((preset, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = LABELS[preset.id] || preset.title;
    button.addEventListener("click", () => {
      [...nav.children].forEach((child) => child.classList.remove("active"));
      button.classList.add("active");
      fill(preset);
      run();
    });
    nav.appendChild(button);
    if (index === 0) button.classList.add("active");
  });

  const clearPreset = () => [...nav.children].forEach((child) => child.classList.remove("active"));
  ["yards-to-go", "yards-to-endzone", "note"].forEach((id) => {
    $(id).addEventListener("input", () => {
      clearPreset();
      run();
    });
  });

  fill(Sideline.PRESETS[0]);
  run();
}

boot();
