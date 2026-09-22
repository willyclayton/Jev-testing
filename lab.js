/* Fourth-down worksheet. Runs in the browser and under Node.
   The phrase rubric is not Jev. Expected points never read the sideline note. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.Sideline = api;
})(typeof window !== "undefined" ? window : null, function () {
  const CONVERSION = { 1: 0.655, 2: 0.572, 3: 0.474, 4: 0.464, 5: 0.441, 6: 0.431, 7: 0.430, 8: 0.394, 9: 0.296, 10: 0.278, 11: 0.273, 12: 0.312, 13: 0.222, 14: 0.211, 15: 0.219 };
  const CONVERSION_LONG = 0.139;
  const EP = { 10: 5, 15: 4.8, 20: 4.4, 25: 4.1, 30: 3.8, 35: 3.5, 40: 3.2, 45: 2.8, 50: 2.5, 55: 2.2, 60: 1.8, 65: 1.5, 70: 1.2, 75: 1.1, 80: 0.6, 85: 0.2, 90: -0.1, 95: -0.4 };
  const GOAL_LINE_EP = 6.9;
  const TD_VALUE = 6.95;
  const FG_BINS = [[29, 0.94], [39, 0.88], [49, 0.76], [54, 0.68], [59, 0.55], [99, 0.40]];
  const DEFAULT_KICKOFF_EP = 0.7;
  const DEFAULT_NET_PUNT = 38;
  const DEFAULT_TOUCHBACK = 75;
  const UNCERTAIN_LOW = 0.35;
  const UNCERTAIN_HIGH = 0.65;

  const SOURCES = {
    conversion: "Sporting News, NFL fourth-down conversion rate by distance, attempts since 2013",
    expected_points: "Michael Morris, nflfastR 2.1.0 cheatsheet (1 Aug 2020), 1st-and-10 column",
    field_goal: "Classroom bins by kick distance. The 50–54 bin is near the ~70% Football Perspective reported for 50–53 yards in 2014–2018. The other bins are rounded.",
    kickoff: "Brian Burke, Advanced Football Analytics, 2009: made field goal worth 2.3, which is 3 minus a 0.7 kickoff",
  };

  const DEFAULT_WEIGHTS = { front: 0.07, prevent: 0.04, scramble: 0, kicker: 0.1 };

  const FANOUT = {
    front_compromised: {
      type: "noul",
      instructions: "The sideline note says the defensive front is compromised for this snap: tired, injured, or out of position.",
      criteria: {
        true: "`sideline_note` gives a concrete reason the front is less able to stop a run or a short pass on this play.",
        false: "`sideline_note` does not say that, or it says the front is sound.",
      },
    },
    kicker_conditions_bad: {
      type: "noul",
      instructions: "The sideline note says conditions make a field goal less likely than this kicker's normal rate: wind, footing, or a miss already today.",
      criteria: {
        true: "`sideline_note` names wind, footing, or a miss that applies to the next kick.",
        false: "`sideline_note` does not say that, or it says the kick is straightforward.",
      },
    },
    prevent_look: {
      type: "noul",
      instructions: "The sideline note says the defense is in a prevent or soft-shell look that gives up the line to gain.",
      criteria: {
        true: "`sideline_note` describes a soft coverage or a prevent look on this snap.",
        false: "`sideline_note` does not describe that look.",
      },
    },
    front_scramble: {
      type: "score",
      instructions: "How scrambled the defensive front is, using only what `sideline_note` states.",
      criteria: [
        "Sound. The note does not describe a problem with the front.",
        "Slightly off. One player is tired or a step slow, and the front is still organized.",
        "Scrambled. A starter is out or the front is clearly tired, and a gap is available.",
        "Broken. The note says the front cannot set an edge on this snap.",
      ],
    },
  };

  const TRAP = {
    what_is_wrong: {
      type: "choice",
      instructions: "What is wrong on this play, according to the sideline note?",
      criteria: {
        front_problem: "The defensive front is tired, hurt, or out of position.",
        kicker_problem: "Wind, footing, or a miss makes the field goal worse than usual.",
        neither: "The note describes neither of those problems.",
      },
    },
  };

  const PLAY_CALL = {
    play_call: {
      type: "choice",
      instructions: "Which action should the offense take on this fourth down?",
      criteria: {
        go: "Try to convert the first down by running or passing.",
        kick: "Attempt a field goal.",
        punt: "Punt the ball away.",
      },
    },
  };

  const PROBE = {
    more_physical: {
      type: "noul",
      instructions: "The team named in `offense` is the more physical of the two teams.",
      criteria: {
        true: "Something in the state supports calling this offense the more physical team.",
        false: "The state does not support that, or the two teams are not distinguished that way.",
      },
    },
    better_coached: {
      type: "noul",
      instructions: "The team named in `offense` is better coached than the team named in `defense`.",
      criteria: {
        true: "Something in the state supports a coaching gap in the offense's favor.",
        false: "The state does not support a coaching gap.",
      },
    },
  };

  const PRESETS = [
    {
      id: "wind-and-edge",
      title: "Wind, and a tired edge",
      situation: {
        offense: "State", defense: "Central", yards_to_go: 3, yards_to_endzone: 32,
        score_diff: 0, seconds_remaining: 240,
        sideline_note: "Their edge is gassed and lined up a yard wide. Wind is swirling and our kicker pushed the last one from 48.",
      },
    },
    {
      id: "empty-note",
      title: "Same spot, empty note",
      situation: {
        offense: "State", defense: "Central", yards_to_go: 3, yards_to_endzone: 32,
        score_diff: 0, seconds_remaining: 240, sideline_note: "",
      },
    },
    {
      id: "coach-says-kick",
      title: "The coach is yelling kick",
      situation: {
        offense: "State", defense: "Central", yards_to_go: 3, yards_to_endzone: 32,
        score_diff: 0, seconds_remaining: 240,
        sideline_note: "Coach is screaming to kick the field goal. Their edge is gassed and lined up a yard wide. No wind.",
      },
    },
    {
      id: "prevent",
      title: "Fourth and 1, prevent look",
      situation: {
        offense: "State", defense: "Central", yards_to_go: 1, yards_to_endzone: 55,
        score_diff: -3, seconds_remaining: 95,
        sideline_note: "They're in a prevent look, ten yards off the line, giving up the sticks.",
      },
    },
    {
      id: "chatter",
      title: "Crowd noise only",
      situation: {
        offense: "State", defense: "Central", yards_to_go: 3, yards_to_endzone: 32,
        score_diff: 0, seconds_remaining: 240,
        sideline_note: "The quarterback's brother is in the third row and the crowd is loud. The band is playing.",
      },
    },
  ];

  const FRONT_PHRASES = ["gassed", "tired", "out of position", "lined up", "yard wide", "can't set the edge", "cannot set the edge", "front is cooked", "front is hurt", "edge is hurt"];
  const KICKER_BAD = ["wind", "swirling", "pushed", "shank", "missed", "footing"];
  const KICKER_FINE = ["no wind", "dome", "automatic", "made three", "kicker is money"];
  const PREVENT_PHRASES = ["prevent", "soft shell", "soft-shell", "off the line", "giving up the sticks", "off coverage"];
  const PLAY_WORDS = [
    ["go", /\bgo for\b|\bgo for it\b|\brun it\b/],
    ["kick", /\bfield goal\b|\bkick\b/],
    ["punt", /\bpunt\b/],
  ];

  function fixed(n, digits) {
    return Number(n).toFixed(digits);
  }

  const LOGIT = {
    prior: Math.log(0.06 / 0.94),
    hit: 2,
    counter: -2.5,
    play: 2.2,
  };

  function logit(p) {
    const q = Math.min(1 - 1e-6, Math.max(1e-6, Number(p)));
    return Math.log(q / (1 - q));
  }

  function sigmoid(z) {
    if (z >= 20) return 1;
    if (z <= -20) return 0;
    return 1 / (1 + Math.exp(-z));
  }

  function softmax(logits) {
    const keys = Object.keys(logits);
    const max = Math.max(...keys.map((key) => logits[key]));
    const exps = Object.fromEntries(keys.map((key) => [key, Math.exp(logits[key] - max)]));
    const sum = Object.values(exps).reduce((total, value) => total + value, 0);
    return Object.fromEntries(keys.map((key) => [key, exps[key] / sum]));
  }

  function demoConfidence(probabilities) {
    const values = Object.values(probabilities);
    const count = values.length;
    if (count < 2) return 1;
    const peak = Math.max(...values);
    const raw = (count * peak - 1) / (count - 1);
    return Math.max(0, Math.min(1, raw));
  }

  function scoreFromProbabilities(probabilities) {
    const terms = Object.entries(probabilities).map(([level, probability]) => ({
      level: Number(level),
      probability,
      product: Number(level) * probability,
    }));
    terms.sort((a, b) => a.level - b.level);
    const total = terms.reduce((sum, term) => sum + term.product, 0);
    return [total, terms];
  }

  function conversionRate(yardsToGo) {
    const yards = Number(yardsToGo);
    if (Object.prototype.hasOwnProperty.call(CONVERSION, yards)) {
      return [CONVERSION[yards], `printed row for ${yards} yards to go`];
    }
    return [CONVERSION_LONG, "16 or more yards to go, using the 13.9% long bin"];
  }

  function fieldGoalMakeRate(distance) {
    for (const [ceiling, rate] of FG_BINS) {
      if (distance <= ceiling) return [rate, `classroom bin, kick distance at or under ${ceiling}`];
    }
    return [FG_BINS[FG_BINS.length - 1][1], "longest classroom bin"];
  }

  function firstAndTenEp(yardsToEndzone) {
    const yards = Number(yardsToEndzone);
    if (yards <= 0) return [TD_VALUE, "at or past the goal line, touchdown value"];
    if (yards < 10) {
      const ep = GOAL_LINE_EP + (5 - GOAL_LINE_EP) * (yards / 10);
      return [ep, `classroom line from ${GOAL_LINE_EP} at the goal line to 5.0 at 10 yards; the cheatsheet does not print this region`];
    }
    const knots = Object.keys(EP).map(Number).sort((a, b) => a - b);
    if (yards >= knots[knots.length - 1]) {
      const slope = (EP[95] - EP[90]) / 5;
      return [EP[95] + slope * (yards - 95), "linear extension past the printed 95-yard knot, using the 90-to-95 slope"];
    }
    if (Object.prototype.hasOwnProperty.call(EP, yards)) {
      return [EP[yards], `printed knot at ${yards} yards to the end zone`];
    }
    const lower = Math.max(...knots.filter((knot) => knot <= yards));
    const upper = Math.min(...knots.filter((knot) => knot >= yards));
    const weight = (yards - lower) / (upper - lower);
    const ep = EP[lower] + weight * (EP[upper] - EP[lower]);
    return [ep, `linear interpolation between the printed knots at ${lower} (${EP[lower]}) and ${upper} (${EP[upper]})`];
  }

  function clampRate(probability) {
    return Math.max(0.02, Math.min(0.98, probability));
  }

  function evaluateActions(yardsToEndzone, yardsToGo, options) {
    const opts = options || {};
    yardsToEndzone = Number(yardsToEndzone);
    yardsToGo = Number(yardsToGo);
    const kickoffEp = opts.kickoff_ep == null ? DEFAULT_KICKOFF_EP : Number(opts.kickoff_ep);
    const netPunt = opts.net_punt == null ? DEFAULT_NET_PUNT : Number(opts.net_punt);
    const touchback = opts.touchback_yards == null ? DEFAULT_TOUCHBACK : Number(opts.touchback_yards);
    const [tableConvert, convertHow] = conversionRate(yardsToGo);
    const kickDistance = yardsToEndzone + 17;
    const [tableFg, fgHow] = fieldGoalMakeRate(kickDistance);
    const usedConvert = opts.p_convert == null ? tableConvert : clampRate(opts.p_convert);
    const usedFg = opts.p_field_goal == null ? tableFg : clampRate(opts.p_field_goal);

    const successYards = yardsToEndzone - yardsToGo;
    let successValue;
    let successHow;
    if (successYards <= 0) {
      successValue = TD_VALUE;
      successHow = `the first down is a touchdown, valued at ${TD_VALUE}`;
    } else {
      const looked = firstAndTenEp(successYards);
      successValue = looked[0];
      successHow = "after the conversion this is a first down: " + looked[1];
    }

    const failYards = 100 - yardsToEndzone;
    const failLook = firstAndTenEp(failYards);
    const failValue = -failLook[0];
    const makeValue = 3 - kickoffEp;
    const missYards = yardsToEndzone <= 20 ? 80 : failYards;
    const missSpot = yardsToEndzone <= 20
      ? "miss inside the 20, ball comes out to the 20, opponent has 80 yards to go"
      : "miss from outside the 20, opponent takes over at the line of scrimmage";
    const missLook = firstAndTenEp(missYards);
    const missValue = -missLook[0];

    const ownYard = 100 - yardsToEndzone;
    const landing = ownYard + netPunt;
    let puntYards;
    let puntSpot;
    if (landing >= 100) {
      puntYards = touchback;
      puntSpot = `net punt of ${netPunt} from our ${ownYard.toFixed(0)} reaches the end zone; touchback, opponent has ${touchback.toFixed(0)} yards to go`;
    } else {
      puntYards = landing;
      puntSpot = `net punt of ${netPunt} from our ${ownYard.toFixed(0)} lands at their ${(100 - landing).toFixed(0)}; opponent has ${landing.toFixed(0)} yards to go`;
    }
    const puntLook = firstAndTenEp(puntYards);
    const puntValue = -puntLook[0];
    const goEp = usedConvert * successValue + (1 - usedConvert) * failValue;
    const fgEp = usedFg * makeValue + (1 - usedFg) * missValue;

    const actions = {
      go: {
        expected_points: goEp,
        formula: "p_convert × success + (1 − p_convert) × fail",
        p: usedConvert,
        p_table: tableConvert,
        p_table_how: convertHow,
        terms: [
          { name: "p_convert", value: usedConvert, how: opts.p_convert == null ? convertHow : "table rate plus the adjustments listed with this call" },
          { name: "success value", value: successValue, how: successHow },
          { name: "fail value", value: failValue, how: "negative of the opponent's 1st-and-10 EP. " + failLook[1], opponent_yards_to_endzone: failYards },
        ],
      },
      kick: {
        expected_points: fgEp,
        formula: "p_make × (3 − kickoff) + (1 − p_make) × miss",
        p: usedFg,
        p_table: tableFg,
        p_table_how: fgHow,
        kick_distance: kickDistance,
        terms: [
          { name: "kick distance", value: kickDistance, how: "yards to the end zone plus 17" },
          { name: "p_make", value: usedFg, how: opts.p_field_goal == null ? fgHow : "table rate minus the kicker adjustment listed with this call" },
          { name: "make value", value: makeValue, how: `3 − kickoff EP (${kickoffEp}). ${SOURCES.kickoff}` },
          { name: "miss value", value: missValue, how: `${missSpot}. ${missLook[1]}`, opponent_yards_to_endzone: missYards },
        ],
      },
      punt: {
        expected_points: puntValue,
        formula: "− opponent 1st-and-10 EP at the expected landing spot",
        terms: [
          { name: "punt value", value: puntValue, how: `${puntSpot}. ${puntLook[1]}`, opponent_yards_to_endzone: puntYards },
        ],
      },
    };
    const ranking = Object.keys(actions).sort((a, b) => actions[b].expected_points - actions[a].expected_points);
    return { actions, best: ranking[0], ranking, sources: SOURCES };
  }

  function hits(text, phrases) {
    const lowered = text.toLowerCase();
    return phrases.filter((phrase) => lowered.includes(phrase));
  }

  function noulFrom(matched, fine) {
    const z = LOGIT.prior + LOGIT.hit * matched.length + LOGIT.counter * fine.length;
    const value = Math.round(Math.max(0.02, Math.min(0.96, sigmoid(z))) * 10000) / 10000;
    const how = `z = ${fixed(LOGIT.prior, 2)} + ${LOGIT.hit}×${matched.length}${fine.length ? ` − ${Math.abs(LOGIT.counter)}×${fine.length}` : ""} = ${fixed(z, 2)}; σ(z) = ${fixed(value, 3)}`;
    return [value, how, { prior: LOGIT.prior, hit: LOGIT.hit, counter: LOGIT.counter, z, hits: matched, counters: fine }];
  }

  function peaked(keys, winner, peak) {
    const rest = (1 - peak) / (keys.length - 1);
    return Object.fromEntries(keys.map((key) => [key, key === winner ? peak : rest]));
  }

  function answerChoice(probabilities, note) {
    const winner = Object.keys(probabilities).reduce((best, key) => probabilities[key] > probabilities[best] ? key : best);
    return { type: "choice", choice: winner, probabilities, confidence: demoConfidence(probabilities), standin: { note } };
  }

  function classifyNote(sidelineNote) {
    const text = sidelineNote || "";
    const front = hits(text, FRONT_PHRASES);
    const kickerBad = hits(text, KICKER_BAD);
    const kickerFine = hits(text, KICKER_FINE);
    const prevent = hits(text, PREVENT_PHRASES);
    const [frontValue, frontHow, frontLogit] = noulFrom(front, []);
    const [kickerValue, kickerHow, kickerLogit] = noulFrom(kickerBad, kickerFine);
    const [preventValue, preventHow, preventLogit] = noulFrom(prevent, []);
    const scrambleLevel = Math.min(3, front.length);
    const scrambleProbs = { 0: 0, 1: 0, 2: 0, 3: 0 };
    let scrambleHow;
    if (!front.length) {
      scrambleProbs[0] = 1;
      scrambleHow = "no front phrase, all probability on level 0";
    } else {
      const leftover = 0.16 / 3;
      for (let level = 0; level < 4; level += 1) scrambleProbs[level] = leftover;
      scrambleProbs[scrambleLevel] = 0.84;
      scrambleHow = `${front.length} front phrase(s) maps to level ${scrambleLevel} at 0.84, with the rest spread evenly`;
    }
    let trapProbs;
    let trapNote;
    if (front.length && kickerBad.length) {
      trapProbs = { front_problem: 0.46, kicker_problem: 0.46, neither: 0.08 };
      trapNote = "Scripted split. Both phrase lists hit, so this Choice is forced to share its probability. Live Jev is not forced to do this.";
    } else if (front.length) {
      trapProbs = peaked(["front_problem", "kicker_problem", "neither"], "front_problem", 0.86);
      trapNote = "Only the front phrase list hit.";
    } else if (kickerBad.length && !kickerFine.length) {
      trapProbs = peaked(["front_problem", "kicker_problem", "neither"], "kicker_problem", 0.86);
      trapNote = "Only the kicker phrase list hit.";
    } else {
      trapProbs = peaked(["front_problem", "kicker_problem", "neither"], "neither", 0.86);
      trapNote = "Neither problem phrase list hit.";
    }
    const [score] = scoreFromProbabilities(scrambleProbs);
    return {
      fanout: {
        front_compromised: { type: "noul", noul: frontValue, standin: { how: frontHow, hits: front, logit: frontLogit } },
        kicker_conditions_bad: { type: "noul", noul: kickerValue, standin: { how: kickerHow, hits: kickerBad.concat(kickerFine.map((phrase) => `counter:${phrase}`)), logit: kickerLogit } },
        prevent_look: { type: "noul", noul: preventValue, standin: { how: preventHow, hits: prevent, logit: preventLogit } },
        front_scramble: {
          type: "score",
          score,
          legend: FANOUT.front_scramble.criteria.reduce((legend, line, index) => { legend[index] = line; return legend; }, {}),
          probabilities: scrambleProbs,
          confidence: demoConfidence(scrambleProbs),
          standin: { how: scrambleHow, hits: front },
        },
      },
      trap: { what_is_wrong: answerChoice(trapProbs, trapNote) },
    };
  }

  function classifyPlayCall(sidelineNote) {
    const text = (sidelineNote || "").toLowerCase();
    const found = PLAY_WORDS.filter(([, pattern]) => pattern.test(text)).map(([name]) => name);
    const keys = ["go", "kick", "punt"];
    const logits = { go: 0, kick: 0, punt: 0 };
    found.forEach((name) => {
      logits[name] += LOGIT.play;
    });
    const probabilities = softmax(logits);
    let note;
    if (found.length === 1) {
      note = `"${found[0]}" adds +${LOGIT.play} to that log-odds. Softmax raises P(${found[0]}). This is the play-call word, not the field-goal make rate.`;
    } else if (found.length > 1) {
      note = `Play-call words ${found.join(", ")} each add +${LOGIT.play}. Softmax splits across them.`;
    } else {
      note = "No play-call word. Log-odds stay at 0, so softmax is nearly even and does not consult expected points.";
    }
    const answer = answerChoice(probabilities, note);
    answer.standin.found = found;
    answer.standin.logits = logits;
    answer.standin.boost = LOGIT.play;
    return { play_call: answer };
  }

  function classifyProbe() {
    const how = "The rubric has no table of team names, so both probes return 0.50. That is a refusal, not evidence that the names are exchangeable to Jev.";
    const answer = () => ({ type: "noul", noul: 0.5, standin: { how, hits: [] } });
    return { more_physical: answer(), better_coached: answer() };
  }

  function evidenceFromNoul(noul) {
    if (UNCERTAIN_LOW < noul && noul < UNCERTAIN_HIGH) {
      return [0, `held at 0 because ${fixed(noul, 3)} is inside ${UNCERTAIN_LOW}–${UNCERTAIN_HIGH}`];
    }
    if (noul <= UNCERTAIN_LOW) {
      return [0, `read as no (${fixed(noul, 3)}); the historical rate already covers an ordinary snap`];
    }
    const ramp = (noul - UNCERTAIN_HIGH) / (1 - UNCERTAIN_HIGH);
    return [ramp, `(${fixed(noul, 3)} − ${UNCERTAIN_HIGH}) / ${fixed(1 - UNCERTAIN_HIGH, 2)} = ${fixed(ramp, 3)}`];
  }

  function adjust(judgments, weights) {
    const warnings = [];
    const [frontE, frontHow] = evidenceFromNoul(judgments.front_compromised.noul);
    const [preventE, preventHow] = evidenceFromNoul(judgments.prevent_look.noul);
    const [kickerE, kickerHow] = evidenceFromNoul(judgments.kicker_conditions_bad.noul);
    const scrambleScore = judgments.front_scramble.score;
    const scrambleE = Math.max(0, Math.min(1, scrambleScore / 3));
    const steps = [
      { name: "front", evidence: frontE, weight: weights.front, delta: weights.front * frontE, how: frontHow, applies_to: "conversion rate, added" },
      { name: "prevent", evidence: preventE, weight: weights.prevent, delta: weights.prevent * preventE, how: preventHow, applies_to: "conversion rate, added" },
      { name: "scramble", evidence: scrambleE, weight: weights.scramble, delta: weights.scramble * scrambleE, how: `score / 3 = ${fixed(scrambleScore, 3)} / 3. A score is a position, and dividing by 3 only maps it onto 0–1 for this worksheet.`, applies_to: "conversion rate, added" },
      { name: "kicker", evidence: kickerE, weight: weights.kicker, delta: -(weights.kicker * kickerE), how: kickerHow, applies_to: "field-goal make rate, subtracted" },
    ];
    if (frontE > 0 && weights.scramble > 0) {
      warnings.push("The front Noul and the scramble Score are both moving the conversion rate. They describe the same front, so this double-counts that fact. The scramble weight defaults to 0 for that reason.");
    }
    return {
      conversion_delta: steps[0].delta + steps[1].delta + steps[2].delta,
      field_goal_delta: steps[3].delta,
      steps,
      warnings,
    };
  }

  function checkDistribution(name, answer, events, warnings) {
    if (answer.type === "noul") {
      events.push({ level: "info", text: `${name} is a Noul. The only field is noul=${answer.noul}. There is no confidence field on a Noul.` });
      return;
    }
    const probabilities = answer.probabilities || {};
    const total = Object.values(probabilities).reduce((sum, value) => sum + value, 0);
    if (Math.abs(total - 1) > 0.02) warnings.push(`${name} probabilities sum to ${fixed(total, 4)}, not 1.`);
    if (answer.type === "score") {
      const [recomputed, terms] = scoreFromProbabilities(probabilities);
      answer.recomputed_score = recomputed;
      answer.score_terms = terms;
      events.push({ level: "info", text: `${name} score ${fixed(answer.score, 4)}. Hand check Σ(level × probability) = ${fixed(recomputed, 4)}.` });
      if (Math.abs(recomputed - answer.score) > 0.02) {
        warnings.push(`${name} score ${fixed(answer.score, 4)} disagrees with the probability-weighted mean ${fixed(recomputed, 4)}.`);
      }
    }
    const approx = demoConfidence(probabilities);
    answer.demo_confidence = approx;
    events.push({
      level: "info",
      text: `${name} reported confidence ${answer.confidence}. The docs-demo approximation (n × peak − 1) / (n − 1) is ${fixed(approx, 4)}. Those are the same number for the phrase rubric, because the rubric uses that formula. On a live Jev answer they can differ: TypeSafe has not published the production formula.`,
    });
  }

  function noteState(note) {
    return { sideline_note: note || "" };
  }

  function fullState(situation) {
    return {
      sport: "American football, fourth down",
      offense: situation.offense,
      defense: situation.defense,
      yards_to_go: situation.yards_to_go,
      yards_to_endzone: situation.yards_to_endzone,
      score_difference_offense_minus_defense: situation.score_diff,
      seconds_remaining: situation.seconds_remaining,
      sideline_note: situation.sideline_note || "",
    };
  }

  function decide(situation, judgments, weights, constants) {
    const usedWeights = Object.assign({}, DEFAULT_WEIGHTS, weights || {});
    const usedConstants = constants || {};
    const kickoffEp = Number(usedConstants.kickoff_ep == null ? DEFAULT_KICKOFF_EP : usedConstants.kickoff_ep);
    const netPunt = Number(usedConstants.net_punt == null ? DEFAULT_NET_PUNT : usedConstants.net_punt);
    const touchback = Number(usedConstants.touchback_yards == null ? DEFAULT_TOUCHBACK : usedConstants.touchback_yards);
    const shared = { kickoff_ep: kickoffEp, net_punt: netPunt, touchback_yards: touchback };
    const events = [{
      level: "info",
      text: `Clock (${situation.seconds_remaining}s) and score difference (${situation.score_diff}) are on the form. The expected-points math does not read them. A win-probability model would. They are sent only with the play-call question.`,
    }, {
      level: "info",
      text: `Team names (${situation.offense} vs ${situation.defense}) are not in the expected-points math.`,
    }];
    const warnings = [];
    const baseline = evaluateActions(situation.yards_to_endzone, situation.yards_to_go, shared);
    events.push({
      level: "model",
      text: `Box score only. Conversion ${fixed(baseline.actions.go.p_table, 3)} (${baseline.actions.go.p_table_how}). Field goal from ${fixed(baseline.actions.kick.kick_distance, 0)} yards, make rate ${fixed(baseline.actions.kick.p_table, 3)}. Best action by expected points: ${baseline.best}.`,
    });
    Object.entries(judgments).forEach(([name, answer]) => checkDistribution(name, answer, events, warnings));
    const shifted = adjust(judgments, usedWeights);
    warnings.push(...shifted.warnings);
    shifted.steps.forEach((step) => {
      const signed = `${step.delta >= 0 ? "+" : ""}${fixed(step.delta, 4)}`;
      events.push({
        level: "model",
        text: `${step.name}: ${step.how} Weight ${step.weight} × evidence ${fixed(step.evidence, 3)} → delta ${signed} on the ${step.applies_to}.`,
      });
    });
    const pConvert = baseline.actions.go.p_table + shifted.conversion_delta;
    const pFg = baseline.actions.kick.p_table + shifted.field_goal_delta;
    events.push({
      level: "model",
      text: `Adjusted conversion = ${fixed(baseline.actions.go.p_table, 4)} + ${fixed(shifted.conversion_delta, 4)} = ${fixed(pConvert, 4)}, then clamped to 0.02–0.98. Adjusted field-goal rate = ${fixed(baseline.actions.kick.p_table, 4)} ${shifted.field_goal_delta >= 0 ? "+" : ""}${fixed(shifted.field_goal_delta, 4)} = ${fixed(pFg, 4)}, same clamp.`,
    });
    const adjusted = evaluateActions(situation.yards_to_endzone, situation.yards_to_go, Object.assign({}, shared, { p_convert: pConvert, p_field_goal: pFg }));
    let comparison;
    if (baseline.best === adjusted.best) {
      comparison = `The note did not change the call. Both paths pick ${baseline.best}. Box-score expected points ${fixed(baseline.actions[baseline.best].expected_points, 3)}, adjusted ${fixed(adjusted.actions[adjusted.best].expected_points, 3)}.`;
    } else {
      comparison = `The note changed the call from ${baseline.best} to ${adjusted.best}. Box score: ${baseline.best} ${fixed(baseline.actions[baseline.best].expected_points, 3)} vs ${adjusted.best} ${fixed(baseline.actions[adjusted.best].expected_points, 3)}. After the weights: ${adjusted.best} ${fixed(adjusted.actions[adjusted.best].expected_points, 3)} vs ${baseline.best} ${fixed(adjusted.actions[baseline.best].expected_points, 3)}.`;
    }
    events.push({ level: "info", text: comparison });
    events.push({ level: "info", text: "No model was called by decide(). The judgments were already in hand." });
    return {
      baseline,
      adjusted,
      adjustment: shifted,
      weights: usedWeights,
      constants: shared,
      comparison,
      events,
      warnings,
    };
  }

  function standinBundle(situation) {
    const note = classifyNote(situation.sideline_note || "");
    const play = classifyPlayCall(situation.sideline_note || "");
    const questions = Object.assign({}, FANOUT, TRAP);
    return {
      source: "standin",
      fanout: note.fanout,
      trap: note.trap,
      play_call: play,
      requests: [
        { name: "note", state: noteState(situation.sideline_note), questions, transport: "not sent — phrase rubric running in this page" },
        { name: "play_call", state: fullState(situation), questions: PLAY_CALL, transport: "not sent — phrase rubric running in this page" },
      ],
      responses: [
        { name: "note", body: { model: "phrase-rubric", answers: Object.assign({}, note.fanout, note.trap) } },
        { name: "play call", body: { model: "phrase-rubric", answers: play } },
      ],
    };
  }

  function finish(situation, classified, weights, constants) {
    if (classified.source === "error") {
      return {
        classification: classified,
        decision: null,
        baseline: evaluateActions(situation.yards_to_endzone, situation.yards_to_go),
        events: classified.events,
        warnings: classified.warnings,
      };
    }
    const sideEvents = [];
    const sideWarnings = [];
    checkDistribution("play_call", classified.play_call.play_call, sideEvents, sideWarnings);
    checkDistribution("what_is_wrong", classified.trap.what_is_wrong, sideEvents, sideWarnings);
    const decision = decide(situation, classified.fanout, weights, constants);
    const play = classified.play_call.play_call;
    decision.events.push({
      level: "info",
      text: `The play-call Choice picked ${play.choice} (confidence ${play.confidence}). That pick is not an expected-points figure, and it is not averaged into the worksheet.`,
    });
    if (classified.source === "standin") {
      decision.events.push({ level: "info", text: "Play-call rubric: " + play.standin.note });
      decision.events.push({ level: "info", text: "Trap Choice: " + classified.trap.what_is_wrong.standin.note });
    }
    return {
      classification: classified,
      decision,
      events: classified.events.concat(sideEvents, decision.events),
      warnings: classified.warnings.concat(sideWarnings, decision.warnings),
    };
  }

  function worksheet(situation, options) {
    const opts = options || {};
    const mode = opts.mode || "standin";
    const events = [];
    const warnings = [];
    if (opts.live) {
      events.push({ level: "info", text: "Calling Jev through the local server at /api/jev. The browser does not hold the API key. Two requests, because the note and the play call see different state." });
      const live = opts.live;
      if (live.error) {
        warnings.push(`Jev HTTP ${live.error.status}. The phrase rubric was not substituted. ${String(live.error.body || "").slice(0, 500)}`);
        events.push({ level: "warn", text: `The live call failed with HTTP ${live.error.status}. Box-score math can still run; classification did not.` });
        return finish(situation, {
          source: "error",
          error_status: live.error.status,
          error_body: String(live.error.body || "").slice(0, 2000),
          events,
          warnings,
        }, opts.weights, opts.constants);
      }
      const noteBody = live.note.body;
      const playBody = live.play.body;
      events.push({ level: "model", text: `Jev note answered as ${noteBody.model}. Input tokens ${(noteBody.usage || {}).input_tokens}.` });
      events.push({ level: "model", text: `Jev play call answered as ${playBody.model}. Input tokens ${(playBody.usage || {}).input_tokens}.` });
      const classified = {
        source: "jev",
        model: noteBody.model,
        fanout: Object.fromEntries(Object.keys(FANOUT).map((key) => [key, noteBody.answers[key]])),
        trap: { what_is_wrong: noteBody.answers.what_is_wrong },
        play_call: playBody.answers,
        requests: live.requests,
        responses: [
          { name: "note", body: noteBody },
          { name: "play call", body: playBody },
        ],
        events,
        warnings,
      };
      return finish(situation, classified, opts.weights, opts.constants);
    }
    if (mode === "live") {
      warnings.push("Live mode was asked for, and this page has no server holding TYPESAFE_API_KEY. The phrase rubric ran instead.");
    }
    events.push({
      level: mode === "live" ? "warn" : "info",
      text: "Classification used the phrase rubric in this page. This is not Jev. Matched phrases are listed with each answer.",
    });
    const bundle = standinBundle(situation);
    bundle.events = events;
    bundle.warnings = warnings;
    return finish(situation, bundle, opts.weights, opts.constants);
  }

  function probe(situation) {
    const swapped = Object.assign({}, situation, { offense: situation.defense, defense: situation.offense });
    const events = [{
      level: "info",
      text: "Name probe, in the spirit of Simon Willison scoring Bay Area cities on 'Good city?'. Same note, names exchanged. The rubric returns 0.50 both ways because it never reads a name. A zero gap says nothing about Jev.",
    }];
    const first = classifyProbe();
    const second = classifyProbe();
    return {
      source: "standin",
      original_names: { offense: situation.offense, defense: situation.defense, answers: first },
      swapped_names: { offense: swapped.offense, defense: swapped.defense, answers: second },
      gaps: { more_physical: 0, better_coached: 0 },
      events,
      questions: PROBE,
    };
  }

  return {
    PRESETS, DEFAULT_WEIGHTS, DEFAULT_KICKOFF_EP, DEFAULT_NET_PUNT, SOURCES, LOGIT,
    FANOUT, TRAP, PLAY_CALL, PROBE,
    evaluateActions, firstAndTenEp, worksheet, decide, probe, noteState, fullState,
    demoConfidence, scoreFromProbabilities, logit, sigmoid, softmax,
  };
});
