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

function num(value) {
  return Number(value).toFixed(2);
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
  if (!decision) {
    $("call").textContent = "";
    $("why").textContent = "Could not classify that note.";
    $("baseline").innerHTML = "";
    $("adjusted").innerHTML = "";
    $("read").textContent = "";
    return;
  }
  const play = payload.classification.play_call.play_call.choice;
  const before = decision.baseline.best;
  const after = decision.adjusted.best;
  $("call").textContent = after;
  $("baseline").innerHTML = list(decision.baseline);
  $("adjusted").innerHTML = list(decision.adjusted);
  let why = before === after ? `Both pick ${after}.` : `The note moved it from ${before} to ${after}.`;
  if (play !== after) why += ` The note says ${play}.`;
  $("why").textContent = why;
  $("read").textContent = noted(payload.classification.fanout);
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
