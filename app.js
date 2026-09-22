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

function noulLine(label, answer) {
  const logit = answer.standin && answer.standin.logit;
  if (!logit || (!logit.hits.length && !(logit.counters || []).length)) return "";
  const names = logit.hits.length ? logit.hits.join(", ") : `counter ${logit.counters.join(", ")}`;
  const counters = (logit.counters || []).length ? ` − ${num(Math.abs(logit.counter), 1)}×${logit.counters.length}` : "";
  return `<li>${label}: ${names}. <span class="eq">z = ${num(logit.prior, 2)} + ${logit.hit}×${logit.hits.length}${counters} = ${num(logit.z, 2)} → ${num(answer.noul, 2)}</span></li>`;
}

function mathSteps(payload) {
  const decision = payload.decision;
  const base = decision.baseline;
  const adj = decision.adjusted;
  const go = base.actions.go;
  const kick = base.actions.kick;
  const fanout = payload.classification.fanout;
  const play = payload.classification.play_call.play_call;
  const success = term(go, "success value");
  const fail = term(go, "fail value");
  const make = term(kick, "make value");
  const miss = term(kick, "miss value");
  const found = (play.standin && play.standin.found) || [];
  const ago = adj.actions.go;
  const akick = adj.actions.kick;

  const steps = [];
  const front = noulLine("Front", fanout.front_compromised);
  const kicker = noulLine("Kick conditions", fanout.kicker_conditions_bad);
  const prevent = noulLine("Prevent", fanout.prevent_look);
  if (front) steps.push(front);
  if (kicker) steps.push(kicker);
  if (prevent) steps.push(prevent);
  if (found.length) {
    steps.push(`<li>“${found.join(", ")}” +${Sideline.LOGIT.play} → P(${play.choice}) ${pct(play.probabilities[play.choice])}.</li>`);
  }
  const convertMoved = Math.abs(ago.p - go.p_table) > 0.0005;
  const makeMoved = Math.abs(akick.p - kick.p_table) > 0.0005;
  if (convertMoved || makeMoved) {
    const bits = [];
    if (convertMoved) bits.push(`Convert ${pct(go.p_table)} → ${pct(ago.p)}`);
    if (makeMoved) bits.push(`Make ${pct(kick.p_table)} → ${pct(akick.p)}`);
    steps.push(`<li>${bits.join(". ")}.</li>`);
  } else if (!steps.length) {
    steps.push("<li>No phrases. Rates stay at the table.</li>");
  }
  steps.push(
    `<li>Go <span class="eq">${num(ago.p, 3)} × ${num(success.value)} + ${num(1 - ago.p, 3)} × ${num(fail.value)} = ${num(ago.expected_points)}</span></li>`,
    `<li>Kick <span class="eq">${num(akick.p, 3)} × ${num(make.value)} + ${num(1 - akick.p, 3)} × ${num(miss.value)} = ${num(akick.expected_points)}</span></li>`,
  );
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
