import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const S = require("../lab.js");

const WIND = {
  offense: "State",
  defense: "Central",
  yards_to_go: 3,
  yards_to_endzone: 32,
  score_diff: 0,
  seconds_remaining: 240,
  sideline_note: "Their edge is gassed and lined up a yard wide. Wind is swirling and our kicker pushed the last one from 48.",
};
const COACH = {
  ...WIND,
  sideline_note: "Coach is screaming to kick the field goal. Their edge is gassed and lined up a yard wide. No wind.",
};

test("printed knot and the bridge inside the 10", () => {
  const [knot, knotHow] = S.firstAndTenEp(50);
  assert.equal(knot, 2.5);
  assert.match(knotHow, /printed knot/);
  const [mid, midHow] = S.firstAndTenEp(29);
  assert.ok(Math.abs(mid - 3.86) < 1e-9);
  assert.match(midHow, /interpolation/);
  assert.match(S.firstAndTenEp(5)[1], /cheatsheet does not/);
});

test("fourth and 3 at the 32 prefers the kick on the box score", () => {
  const result = S.evaluateActions(32, 3);
  assert.equal(result.actions.kick.kick_distance, 49);
  assert.equal(result.best, "kick");
  assert.ok(result.actions.kick.expected_points > result.actions.go.expected_points);
  assert.match(result.actions.punt.terms[0].how, /touchback/);
  assert.equal(result.actions.punt.terms[0].opponent_yards_to_endzone, 75);
});

test("punt and missed field goal spots", () => {
  assert.equal(S.evaluateActions(55, 1).actions.punt.terms[0].opponent_yards_to_endzone, 83);
  assert.equal(S.evaluateActions(15, 1).actions.kick.terms[3].opponent_yards_to_endzone, 80);
  assert.equal(S.evaluateActions(3, 4).actions.go.terms[1].value, 6.95);
});

test("wind note flips kick to go, empty note does not", () => {
  const wind = S.worksheet(WIND);
  assert.equal(wind.classification.source, "standin");
  assert.equal(wind.decision.baseline.best, "kick");
  assert.equal(wind.decision.adjusted.best, "go");
  const text = wind.events.map((event) => event.text).join(" ");
  assert.match(text, /phrase rubric/);
  assert.match(text, /does not read them/);

  const empty = S.worksheet({ ...WIND, sideline_note: "" });
  assert.equal(empty.decision.adjusted.best, "kick");
  assert.match(empty.decision.comparison, /did not change the call/);
});

test("the word kick moves the Choice and the math can still go", () => {
  const result = S.worksheet(COACH);
  const play = result.classification.play_call.play_call;
  assert.equal(play.choice, "kick");
  assert.equal(play.demo_confidence, play.confidence);
  assert.ok(play.probabilities.kick > 0.7);
  assert.equal(result.decision.adjusted.best, "go");
  const windPlay = S.worksheet(WIND).classification.play_call.play_call;
  assert.notEqual(windPlay.choice, "kick");
});

test("noul is a logit of phrase hits, and kick raises P(kick)", () => {
  assert.ok(Math.abs(S.sigmoid(S.logit(0.25)) - 0.25) < 1e-9);
  const empty = S.worksheet({ ...WIND, sideline_note: "" });
  const kickWord = S.worksheet({ ...WIND, sideline_note: "kick" });
  assert.ok(empty.classification.fanout.front_compromised.noul < 0.1);
  assert.ok(kickWord.classification.play_call.play_call.probabilities.kick > empty.classification.play_call.play_call.probabilities.kick);
  assert.equal(kickWord.classification.play_call.play_call.choice, "kick");
  const front = S.worksheet(WIND).classification.fanout.front_compromised.standin.logit;
  assert.equal(front.hits.length, 3);
  assert.ok(front.z > 3);
});

test("chatter and a zeroed weight leave the tables in charge", () => {
  const chatter = S.worksheet({
    ...WIND,
    sideline_note: "The quarterback's brother is in the third row and the crowd is loud. The band is playing.",
  });
  assert.equal(chatter.decision.adjusted.best, "kick");
  assert.equal(chatter.decision.adjustment.conversion_delta, 0);
  const held = S.decide(WIND, S.worksheet(WIND).classification.fanout, { front: 0, prevent: 0, scramble: 0, kicker: 0 });
  assert.equal(held.baseline.best, held.adjusted.best);
  assert.ok(held.events.some((event) => event.text.includes("No model was called")));
});

test("scramble weight warns, prevent is its own fact, live without a server says so", () => {
  const wind = S.worksheet(WIND);
  const doubled = S.decide(WIND, wind.classification.fanout, { scramble: 0.05 });
  assert.ok(doubled.warnings.some((warning) => warning.includes("double-count")));
  const prevent = S.worksheet(S.PRESETS[3].situation);
  assert.ok(prevent.classification.fanout.prevent_look.noul > 0.6);
  assert.ok(prevent.classification.fanout.front_compromised.noul < 0.1);
  const live = S.worksheet({ ...WIND, sideline_note: "" }, { mode: "live" });
  assert.equal(live.classification.source, "standin");
  assert.ok(live.warnings.some((warning) => warning.includes("TYPESAFE_API_KEY")));
});

test("name probe does not read the name", () => {
  const result = S.probe({ offense: "East Palo Alto", defense: "Cupertino", sideline_note: "quiet" });
  assert.equal(result.gaps.more_physical, 0);
  assert.equal(result.original_names.answers.more_physical.noul, 0.5);
  assert.match(result.events[0].text, /says nothing about Jev/);
});
