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

function mathSteps(payload) {
  const decision = payload.decision;
  const sit = situation();
  const base = decision.baseline;
  const adj = decision.adjusted;
  const go = base.actions.go;
  const kick = base.actions.kick;
  const punt = base.actions.punt;
  const successYards = sit.yards_to_endzone - sit.yards_to_go;
  const failYards = 100 - sit.yards_to_endzone;
  const net = decision.constants.net_punt;
  const landing = failYards + net;
  const success = term(go, "success value");
  const fail = term(go, "fail value");
  const make = term(kick, "make value");
  const miss = term(kick, "miss value");
  const pGo = go.p;
  const pKick = kick.p;

  const successText = successYards <= 0
    ? `a conversion is a touchdown, worth ${num(success.value)}`
    : `a first down ${successYards} yards from the end zone is worth ${num(success.value)}`;
  const missHow = sit.yards_to_endzone <= 20
    ? `A miss comes out to the 20, worth ${num(miss.value)}`
    : `A miss is ${num(miss.value)}, and the opponent takes over`;
  const puntText = landing >= 100
    ? `A ${net}-yard net punt from here is a touchback. Opponent first-and-10 from their 25 is worth ${num(punt.expected_points)}.`
    : `A ${net}-yard net punt from here leaves the opponent ${landing} yards from the end zone, worth ${num(punt.expected_points)}.`;

  const steps = [
    `<li><strong>Spot.</strong> Fourth and ${sit.yards_to_go}, ${sit.yards_to_endzone} yards to the end zone. The kick is from ${kick.kick_distance} yards (${sit.yards_to_endzone} + 17).</li>`,
    `<li><strong>Go.</strong> Fourth-and-${sit.yards_to_go} converts ${pct(pGo)} of the time. If it works, ${successText}. If it fails, the opponent takes over ${failYards} yards from their end zone, worth ${num(fail.value)}.<p class="eq">${num(pGo, 3)} × ${num(success.value)} + ${num(1 - pGo, 3)} × ${num(fail.value)} = ${num(go.expected_points)}</p></li>`,
    `<li><strong>Kick.</strong> A ${kick.kick_distance}-yard field goal is made ${pct(pKick)} of the time. A make is ${num(make.value)} (3 minus a ${num(decision.constants.kickoff_ep)} kickoff). ${missHow}.<p class="eq">${num(pKick, 3)} × ${num(make.value)} + ${num(1 - pKick, 3)} × ${num(miss.value)} = ${num(kick.expected_points)}</p></li>`,
    `<li><strong>Punt.</strong> ${puntText}</li>`,
    `<li><strong>Tables pick ${base.best}.</strong> Go ${num(go.expected_points)}, kick ${num(kick.expected_points)}, punt ${num(punt.expected_points)}.</li>`,
  ];

  const moved = decision.adjustment.steps.filter((step) => Math.abs(step.delta) > 0.0005);
  if (!moved.length) {
    steps.push(`<li><strong>The note.</strong> Nothing in it changes a rate. The call stays ${base.best}.</li>`);
    return steps.join("");
  }

  const conv = moved.filter((step) => step.name !== "kicker");
  const kicker = moved.find((step) => step.name === "kicker");
  const names = { front: "Tired front", prevent: "Prevent look", scramble: "Scrambled front" };
  const bits = [];
  if (conv.length) {
    bits.push(`${conv.map((step) => names[step.name] || step.name).join(" and ")}: conversion ${pct(go.p_table)} → ${pct(adj.actions.go.p)}`);
  }
  if (kicker) {
    bits.push(`Kick conditions: make rate ${pct(kick.p_table)} → ${pct(adj.actions.kick.p)}`);
  }
  const ago = adj.actions.go;
  const akick = adj.actions.kick;
  steps.push(
    `<li><strong>The note.</strong> ${bits.join(". ")}.<p class="eq">go ${num(ago.p, 3)} × ${num(success.value)} + ${num(1 - ago.p, 3)} × ${num(fail.value)} = ${num(ago.expected_points)}</p><p class="eq">kick ${num(akick.p, 3)} × ${num(make.value)} + ${num(1 - akick.p, 3)} × ${num(miss.value)} = ${num(akick.expected_points)}</p></li>`,
  );
  if (base.best === adj.best) {
    steps.push(`<li><strong>After the note, still ${adj.best}.</strong></li>`);
  } else {
    steps.push(`<li><strong>After the note, ${adj.best}.</strong> ${num(adj.actions[adj.best].expected_points)} against ${base.best} at ${num(adj.actions[base.best].expected_points)}.</li>`);
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
