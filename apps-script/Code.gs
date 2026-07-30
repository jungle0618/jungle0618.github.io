const API_VERSION = "2026-07-28-battle-flags-table-v1";
const SHEETS = Object.freeze({
  gameState: "GameState", teams: "Teams", roster: "Roster", lineups: "Lineups",
  pairings: "Pairings", battles: "Battles", workerAuth: "WorkerAuth", workerTestData: "WorkerTestData", encounterData: "EncounterData",
  battleFlags: "BattleFlags",
});
const SHEET_HEADERS = Object.freeze({
  GameState: ["round", "phase", "version", "updatedAt"],
  Teams: ["teamId", "teamName", "passwordHash", "score", "rank", "version", "enabled"],
  Roster: ["teamId", "petName", "level", "gameRoundsDeployed", "version"],
  Lineups: ["round", "challengeId", "teamId", "slotIndex", "petName", "version", "updatedAt"],
  Pairings: ["round", "challengeId", "pairId", "higherRankTeamId", "lowerRankTeamId", "createdAt"],
  Battles: ["battleId", "round", "challengeId", "teamIds", "score", "result", "replayJson", "createdAt"],
  WorkerAuth: ["workerId", "passwordHash", "enabled"],
  WorkerTestData: ["dataKey", "dataJson", "updatedAt"],
  EncounterData: ["dataKey", "dataJson", "updatedAt"],
  BattleFlags: ["scope", "refId", "turtle_net", "water_park", "is_raining", "updatedAt"],
});
const SESSION_SECONDS = 12 * 60 * 60;
// 後端唯一權威：前端不保存隊伍數量或配對規則。
const MULTIPLAYER_TEAM_COUNT = 12;
// BEGIN GENERATED GAME CONFIG — run: npm run config:sync
const MAX_LEVEL = 10;
const MAX_LEVEL_GAP = 3;
const MAX_ROUND = 10;
const BATTLE_TURN_LIMIT = 35;
const MAX_BOSS_LEVEL = 30;
const DRAW_CARDS = 7;
const INITIAL_ROUND_POOL_NAMES = Object.freeze(["狗","貓","蛇","跳蛛","犀牛","鯉魚王","大猩猩","雪貂","熊","兔子"]);
const SINGLE_TEAM_SIZE = 5;
const DUO_CONTRIBUTION_SIZE = 3;
const DUO_CLEAR_SCORE = 1.5;
const ONCE_PER_GAME_PET_NAMES = Object.freeze(["鯊魚","變色龍"]);
const ROUND_KINDS = [
  [
    "single"
  ],
  [
    "duo"
  ],
  [
    "single"
  ],
  [
    "duo"
  ],
  [
    "single",
    "duo"
  ],
  [
    "single"
  ],
  [
    "single",
    "single"
  ],
  [
    "duo"
  ],
  [
    "single",
    "single"
  ],
  [
    "single",
    "duo"
  ]
];
// END GENERATED GAME CONFIG
let spreadsheetInstance_ = null;

function doGet() {
  return jsonOutput_({ ok: true, data: { service: "IMOC Apps Script API", version: API_VERSION } });
}

function doPost(event) {
  try {
    const request = JSON.parse(event.postData && event.postData.contents || "{}");
    const result = dispatch_(request.action, request.token, request.payload || {});
    return jsonOutput_({ ok: true, data: result });
  } catch (error) {
    console.error(error && error.stack || error);
    return jsonOutput_({
      ok: false,
      code: error.code || "INTERNAL_ERROR",
      message: error.message || "伺服器發生錯誤",
      status: error.status || 500,
    });
  }
}

function jsonOutput_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function dispatch_(action, token, payload) {
  switch (action) {
    case "loginTeam": return loginTeam_(payload);
    case "loginWorker": return loginWorker_(payload);
    case "loadSession": return loadSession_(token);
    case "loadPlayerGame": return loadPlayerGame_(requireSessionAny_(token), payload);
    case "loadBattleReplays": return loadBattleReplays_(payload, requireSessionAny_(token));
    case "loadChallengeBattles": return loadChallengeBattles_(payload, requireSessionAny_(token));
    case "saveLineup": return withWriteLock_(() => {
      const session = requireSessionAny_(token);
      const teamId = session.role === "worker" ? String(payload.teamId || "") : String(session.teamId);
      if (!teamId) throw apiError_("TEAM_REQUIRED", "缺少隊伍編號", 400);
      return saveLineup_(teamId, payload);
    });
    case "savePlayerLineups": return withWriteLock_(() => {
      const session = requireSession_(token, "team");
      return savePlayerLineups_(String(session.teamId), payload);
    });
    case "loadWorkerGame": requireSession_(token, "worker"); return loadRawGameState_({ includeRosters: true, includeBattles: true, includeWorkerTestData: false });
    case "loadWorkerRoundData": requireSession_(token, "worker"); return loadRawGameState_({ includeRosters: true, includeBattles: true, includeWorkerTestData: false });
    case "loadWorkerTestData": requireSession_(token, "worker"); return loadWorkerTestCatalog_();
    case "loadWorkerTeam": return loadWorkerTeam_(payload, requireSession_(token, "worker"));
    case "loadWorkerAnalysis": return loadWorkerAnalysis_(payload, requireSession_(token, "worker"));
    case "drawRosters": requireSession_(token, "worker"); return withWriteLock_(() => drawRosters_(payload));
    case "setInitialRosters": requireSession_(token, "worker"); return withWriteLock_(() => setInitialRosters_(payload));
    case "updateRosterLevels": requireSession_(token, "worker"); return withWriteLock_(() => updateRosterLevels_(payload));
    case "saveWorkerLineup": requireSession_(token, "worker"); return withWriteLock_(() => saveLineup_(payload.teamId, payload));
    case "saveWorkerDrafts": requireSession_(token, "worker"); return withWriteLock_(() => saveWorkerDrafts_(payload));
    case "autoConfigureAllLineups": requireSession_(token, "worker"); return withWriteLock_(() => autoConfigureAllLineups_(payload));
    case "saveOfficialRound": requireSession_(token, "worker"); return withWriteLock_(() => saveOfficialRound_(payload));
    case "resetGame": requireSession_(token, "worker"); return withWriteLock_(() => resetGame_(payload));
    case "resetTeamPassword": return withWriteLock_(() => resetTeamPassword_(payload, requireSession_(token, "worker")));
    default: throw apiError_("UNKNOWN_ACTION", "未知的 API 操作", 404);
  }
}

function props_() {
  const values = PropertiesService.getScriptProperties().getProperties();
  ["SPREADSHEET_ID", "SESSION_SECRET", "PASSWORD_PEPPER"].forEach((key) => {
    if (!values[key]) throw apiError_("API_NOT_CONFIGURED", `尚未設定 Script Property：${key}`, 503);
  });
  return values;
}

function spreadsheet_() {
  if (!spreadsheetInstance_) spreadsheetInstance_ = SpreadsheetApp.openById(props_().SPREADSHEET_ID);
  return spreadsheetInstance_;
}

function sheet_(name) {
  const sheet = spreadsheet_().getSheetByName(name);
  if (!sheet) throw apiError_("SHEET_NOT_FOUND", `找不到工作表：${name}`, 500);
  return sheet;
}

function table_(name) {
  const values = sheet_(name).getDataRange().getValues();
  const headers = values[0] || [];
  return values.slice(1).map((row, index) => {
    const object = { _rowNumber: index + 2 };
    headers.forEach((header, column) => object[header] = row[column] === undefined ? "" : row[column]);
    return object;
  }).filter((row) => headers.some((header) => String(row[header] || "").trim() !== ""));
}

function optionalTable_(name) {
  const target = spreadsheet_().getSheetByName(name);
  if (!target) return [];
  const values = target.getDataRange().getValues();
  const headers = values[0] || [];
  return values.slice(1).map((row, index) => {
    const object = { _rowNumber: index + 2 };
    headers.forEach((header, column) => object[header] = row[column] === undefined ? "" : row[column]);
    return object;
  }).filter((row) => headers.some((header) => String(row[header] || "").trim() !== ""));
}

function ensureRows_(sheet, rowCount) {
  if (rowCount > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), rowCount - sheet.getMaxRows());
}

function appendRows_(name, rows) {
  if (!rows.length) return;
  const sheet = sheet_(name);
  const start = sheet.getLastRow() + 1;
  ensureRows_(sheet, start + rows.length - 1);
  sheet.getRange(start, 1, rows.length, rows[0].length).setValues(rows);
}

function withWriteLock_(operation) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) throw apiError_("SERVER_BUSY", "伺服器忙碌中，請稍後重試", 503);
  try {
    const result = operation();
    SpreadsheetApp.flush();
    CacheService.getScriptCache().remove("game-state");
    return result;
  } finally {
    lock.releaseLock();
  }
}

function apiError_(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function bytesToHex_(bytes) {
  return bytes.map((byte) => (`0${(byte < 0 ? byte + 256 : byte).toString(16)}`).slice(-2)).join("");
}

function passwordHash_(password) {
  return "hmac256:" + bytesToHex_(Utilities.computeHmacSha256Signature(String(password), props_().PASSWORD_PEPPER));
}

function verifyPassword_(password, stored) {
  return passwordHash_(password) === String(stored || "");
}

function truthySheetValue_(value) {
  if (value === true) return true;
  const text = String(value || "").trim().toLowerCase();
  return ["true", "1", "yes", "y", "on"].indexOf(text) >= 0;
}

function multiplayerTeamFlags_(team) {
  const turtleRaw = team && team.turtle_net;
  const waterRaw = team && team.water_park;
  return {
    turtle_net: turtleRaw || "",
    water_park: waterRaw || "",
    turtleNetEnabled: truthySheetValue_(turtleRaw) || String(turtleRaw || "").trim() !== "",
    waterParkEnabled: truthySheetValue_(waterRaw),
  };
}

function loadBattleFlags_(teams, state) {
  const rows = optionalTable_(SHEETS.battleFlags);
  const teamById = {};
  let gameFlags = null;

  rows.forEach((row) => {
    const scope = String(row.scope || "").trim().toLowerCase();
    const refId = String(row.refId || "").trim();
    if (scope === "team" && refId) {
      teamById[refId] = {
        turtle_net: row.turtle_net || "",
        water_park: row.water_park || "",
      };
      return;
    }
    if (scope === "game") {
      gameFlags = {
        is_raining: row.is_raining || "",
      };
    }
  });

  // 向後相容：如果新表尚未建立或尚未搬資料，暫時回退讀舊欄位。
  if (!rows.length) {
    teams.forEach((team) => {
      if (team.turtle_net || team.water_park) {
        teamById[String(team.teamId)] = {
          turtle_net: team.turtle_net || "",
          water_park: team.water_park || "",
        };
      }
    });
    if (state && state.is_raining) gameFlags = { is_raining: state.is_raining || "" };
  }

  return {
    teamById,
    gameState: gameFlags || { is_raining: "" },
  };
}

function checkLoginRate_(role, accountId) {
  const cache = CacheService.getScriptCache();
  const key = `login-fail:${role}:${accountId}`;
  const failures = Number(cache.get(key)) || 0;
  if (failures >= 10) throw apiError_("TOO_MANY_ATTEMPTS", "登入失敗次數過多，請十分鐘後再試", 429);
  return {
    failed: () => cache.put(key, String(failures + 1), 600),
    succeeded: () => cache.remove(key),
  };
}

function base64WebSafe_(text) {
  return Utilities.base64EncodeWebSafe(String(text), Utilities.Charset.UTF_8).replace(/=+$/, "");
}

function decodeBase64WebSafe_(text) {
  return Utilities.newBlob(Utilities.base64DecodeWebSafe(text)).getDataAsString();
}

function sessionSignature_(payload) {
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(payload, props_().SESSION_SECRET)).replace(/=+$/, "");
}

function createToken_(session) {
  const payload = base64WebSafe_(JSON.stringify(Object.assign({}, session, { expiresAt: Date.now() + SESSION_SECONDS * 1000 })));
  return payload + "." + sessionSignature_(payload);
}

function verifyToken_(token) {
  if (!token) return null;
  const parts = String(token).split(".");
  if (parts.length !== 2 || sessionSignature_(parts[0]) !== parts[1]) return null;
  try {
    const session = JSON.parse(decodeBase64WebSafe_(parts[0]));
    return Number(session.expiresAt) > Date.now() ? session : null;
  } catch (_) {
    return null;
  }
}

function requireSession_(token, role) {
  const session = verifyToken_(token);
  if (!session || session.role !== role) throw apiError_("UNAUTHORIZED", "請先登入", 401);
  return session;
}

function requireSessionAny_(token) {
  const session = verifyToken_(token);
  if (!session || !["team", "worker"].includes(session.role)) throw apiError_("UNAUTHORIZED", "請先登入", 401);
  return session;
}

function loginTeam_(payload) {
  const rate = checkLoginRate_("team", String(payload.teamId || ""));
  const team = table_(SHEETS.teams).find((row) => String(row.teamId) === String(payload.teamId) && row.enabled !== false);
  if (!team || !verifyPassword_(payload.password, team.passwordHash)) {
    rate.failed();
    throw apiError_("INVALID_CREDENTIALS", "小隊或密碼錯誤", 401);
  }
  rate.succeeded();
  const session = { authenticated: true, role: "team", teamId: String(team.teamId), teamName: team.teamName };
  return { token: createToken_(session), session };
}

function loginWorker_(payload) {
  const workerId = payload.workerId || "worker";
  const rate = checkLoginRate_("worker", String(workerId));
  const worker = table_(SHEETS.workerAuth).find((row) => String(row.workerId) === String(workerId) && row.enabled !== false);
  if (!worker || !verifyPassword_(payload.password, worker.passwordHash)) {
    rate.failed();
    throw apiError_("INVALID_CREDENTIALS", "工人帳號或密碼錯誤", 401);
  }
  rate.succeeded();
  const session = { authenticated: true, role: "worker", workerId: String(worker.workerId) };
  return { token: createToken_(session), session };
}

function loadSession_(token) {
  return verifyToken_(token) || { authenticated: false };
}

function latestLineups_(rows) {
  const versions = {};
  rows.forEach((row) => versions[String(row.challengeId)] = Math.max(versions[String(row.challengeId)] || 0, Number(row.version) || 0));
  return rows.filter((row) => Number(row.version) === versions[String(row.challengeId)]);
}

function loadRawGameState_(options = {}) {
  const includeRosters = options.includeRosters !== false;
  const includeBattles = options.includeBattles !== false;
  const includeWorkerTestData = options.includeWorkerTestData !== false;
  const states = table_(SHEETS.gameState);
  const teams = table_(SHEETS.teams);
  const roster = table_(SHEETS.roster);
  const lineups = table_(SHEETS.lineups);
  const pairings = table_(SHEETS.pairings);
  const battles = table_(SHEETS.battles);
  const state = states[0] || { round: 1, phase: "prepare", version: 1 };
  const battleFlags = loadBattleFlags_(teams, state);
  const round = Number(state.round) || 1;
  const savedPairings = pairings.filter((pairing) => Number(pairing.round) === round).map((pairing) => ({
    round: Number(pairing.round), challengeId: String(pairing.challengeId), pairId: String(pairing.pairId),
    higherRankTeamId: String(pairing.higherRankTeamId), lowerRankTeamId: String(pairing.lowerRankTeamId),
    createdAt: pairing.createdAt,
  }));
  const currentPairings = savedPairings.length ? savedPairings : roundPairings_(round, teams, "");
  const battleHistory = battles.map((battle) => {
    const copy = Object.assign({}, battle);
    delete copy.replayJson;
    delete copy._rowNumber;
    return copy;
  });
  return {
    round,
    phase: state.phase || "prepare",
    version: Number(state.version) || 1,
    gameState: {
      round,
      phase: state.phase || "prepare",
      version: Number(state.version) || 1,
      updatedAt: state.updatedAt || "",
      is_raining: battleFlags.gameState.is_raining || "",
      isRaining: truthySheetValue_(battleFlags.gameState.is_raining),
    },
    formalEncounters: loadFormalEncounters_(),
    teams: teams.map((team) => {
      const teamRoster = roster.filter((pet) => String(pet.teamId) === String(team.teamId));
      const teamFlags = battleFlags.teamById[String(team.teamId)] || { turtle_net: "", water_park: "" };
      return {
      teamId: String(team.teamId), teamName: team.teamName, score: Number(team.score) || 0,
      rank: Number(team.rank) || 0, version: Number(team.version) || 1,
      enabled: team.enabled !== false,
      ...multiplayerTeamFlags_(teamFlags),
      ...(includeRosters ? {
        roster: teamRoster.filter((pet) => (Number(pet.level) || 0) > 0),
        rosterMeta: teamRoster,
      } : {
        rosterCount: teamRoster.filter((pet) => (Number(pet.level) || 0) > 0).length,
      }),
      ...(includeRosters ? {
        currentLineups: latestLineups_(lineups.filter((row) => String(row.teamId) === String(team.teamId) && Number(row.round) === round)),
      } : {}),
      };
    }),
    currentPairings,
    pairings: currentPairings,
    roster: includeRosters ? roster.map((pet) => {
      const copy = Object.assign({}, pet);
      delete copy._rowNumber;
      return copy;
    }) : [],
    lineups: includeRosters
      ? lineups.filter((row) => Number(row.round) === round).map((row) => {
        const copy = Object.assign({}, row);
        delete copy._rowNumber;
        return copy;
      })
      : [],
    battles: includeBattles ? battleHistory : [],
    ...(includeBattles ? { battleHistory } : {}),
    ...(includeWorkerTestData ? { workerTestData: loadWorkerTestData_() } : {}),
  };
}

function loadEncounterData_() {
  const result = {};
  table_(SHEETS.encounterData).forEach((row) => {
    if (!row.dataKey || !row.dataJson) return;
    try {
      result[String(row.dataKey)] = JSON.parse(String(row.dataJson));
    } catch (error) {
      throw apiError_("INVALID_ENCOUNTER_DATA", `EncounterData 的 ${row.dataKey} JSON 格式錯誤`, 500);
    }
  });
  return result;
}

function loadFormalEncounters_() {
  const workerChallenges = loadWorkerTestData_().challenges || [];
  if (Array.isArray(workerChallenges) && workerChallenges.length) {
    const byId = new Map(workerChallenges.map((challenge) => [String(challenge.id || ""), challenge]));
    const encounters = [];
    ROUND_KINDS.forEach((kinds, roundIndex) => {
      kinds.forEach((kind, index) => {
        const challengeId = challengeId_(roundIndex + 1, index, kind);
        const challenge = byId.get(challengeId);
        if (!challenge || !challenge.encounter) {
          throw apiError_("INVALID_WORKER_TEST_DATA", `WorkerTestData 缺少正式關卡 ${challengeId} 的 encounter`, 500);
        }
        encounters.push(challenge.encounter);
      });
    });
    return encounters;
  }
  const encounters = loadEncounterData_().formalEncounters || [];
  if (!Array.isArray(encounters)) throw apiError_("INVALID_ENCOUNTER_DATA", "formalEncounters 必須是陣列", 500);
  return encounters;
}

/** 工人測試資料只從私人 Google Sheet 讀取；絕不放入公開玩家回應。 */
function loadWorkerTestData_() {
  const result = {};
  table_(SHEETS.workerTestData).forEach((row) => {
    if (!row.dataKey || !row.dataJson) return;
    try {
      result[String(row.dataKey)] = JSON.parse(String(row.dataJson));
    } catch (error) {
      throw apiError_("INVALID_WORKER_TEST_DATA", `WorkerTestData 的 ${row.dataKey} JSON 格式錯誤`, 500);
    }
  });
  return result;
}

/** 測試模式初始只給關卡目錄；組隊候選與指標按選定關卡另外讀取。 */
function loadWorkerTestCatalog_() {
  const data = loadWorkerTestData_();
  return {
    challenges: data.challenges || [],
    oneClickLineups: data.oneClickLineups || {},
    optimalLineups: data.optimalLineups || {},
    metrics: data.metrics || {},
  };
}

function roundKinds_(round) {
  return ROUND_KINDS[Math.max(0, Math.min(ROUND_KINDS.length - 1, Number(round) - 1))] || [];
}

function challengeId_(round, index, kind) { return `${round}-${index + 1}-${kind}`; }

function isConsumedOncePet_(pet) {
  return ONCE_PER_GAME_PET_NAMES.indexOf(String(pet && pet.petName)) >= 0 && Number(pet && pet.gameRoundsDeployed) > 0;
}

function compareTeamIds_(left, right) {
  const leftNumber = Number(left);
  const rightNumber = Number(right);
  if (Number.isFinite(leftNumber) && Number.isFinite(rightNumber) && leftNumber !== rightNumber) return leftNumber - rightNumber;
  return String(left).localeCompare(String(right), undefined, { numeric: true });
}

function rankedPairs_(teams) {
  const byId = new Map(teams.map((team) => [String(team.teamId), team]));
  const requiredIds = Array.from({ length: MULTIPLAYER_TEAM_COUNT }, (_, index) => String(index + 1));
  if (requiredIds.some((teamId) => !byId.has(teamId)) || teams.length !== MULTIPLAYER_TEAM_COUNT) {
    throw apiError_("TEAM_CONFIGURATION_INVALID", "必須設定 1–12 共十二個小隊後才能分組", 500);
  }
  const sortByRank = (a, b) =>
    (Number(a.rank) || 99) - (Number(b.rank) || 99) || compareTeamIds_(a.teamId, b.teamId);
  const rankedEight = requiredIds.slice(0, 8).map((teamId) => byId.get(teamId)).sort(sortByRank);
  const fixedPairs = [
    [byId.get("9"), byId.get("10")].sort(sortByRank),
    [byId.get("11"), byId.get("12")].sort(sortByRank),
  ];
  const pairs = fixedPairs.slice();
  // 1–8 依當前排名由兩端配對：第一對第八、第二對第七，以此類推。
  for (let index = 0; index < rankedEight.length / 2; index += 1) {
    pairs.push([rankedEight[index], rankedEight[rankedEight.length - 1 - index]]);
  }
  return pairs;
}

function roundPairings_(round, teams, createdAt) {
  const pairs = rankedPairs_(teams);
  const rows = [];
  roundKinds_(round).forEach((kind, index) => {
    if (kind !== "duo") return;
    const challengeId = challengeId_(round, index, kind);
    pairs.forEach((pair, pairIndex) => rows.push({
      round, challengeId,
      pairId: pairIndex === 0
        ? "fixed-9-10"
        : pairIndex === 1
        ? "fixed-11-12"
        : `r${Number(pair[0].rank)}-${Number(pair[1].rank)}`,
      higherRankTeamId: String(pair[0].teamId), lowerRankTeamId: String(pair[1].teamId), createdAt,
      pairIndex,
    }));
  });
  return rows;
}

function writeMissingRoundPairings_(round, teams, createdAt) {
  const expected = roundPairings_(round, teams, createdAt);
  if (!expected.length) return [];
  const existing = table_(SHEETS.pairings);
  const keys = new Set(existing.map((pairing) => [
    Number(pairing.round), String(pairing.challengeId), String(pairing.pairId),
  ].join(":")));
  const missing = expected.filter((pairing) => !keys.has([
    pairing.round, pairing.challengeId, pairing.pairId,
  ].join(":")));
  appendRows_(SHEETS.pairings, missing.map((pairing) => [
    pairing.round, pairing.challengeId, pairing.pairId, pairing.higherRankTeamId,
    pairing.lowerRankTeamId, pairing.createdAt,
  ]));
  return missing;
}

function levelDistribution_(roster) {
  return roster.reduce((result, pet) => {
    const level = Math.max(1, Number(pet.level) || 1);
    result[level] = (result[level] || 0) + 1;
    return result;
  }, {});
}

function loadPlayerGame_(session, payload) {
  if (session.role === "worker") {
    const requestedTeamId = String(payload && payload.teamId || "");
    if (!requestedTeamId) return loadRawGameState_({ includeRosters: true, includeBattles: true, includeWorkerTestData: false });
    return loadWorkerTeam_({ teamId: requestedTeamId }, session);
  }
  const game = loadRawGameState_();
  const duoIds = roundKinds_(game.round).map((kind, index) => kind === "duo" ? challengeId_(game.round, index, kind) : null).filter(Boolean);
  const pairings = Array.isArray(game.currentPairings) ? game.currentPairings : [];
  const pairing = pairings.find((item) => String(item.higherRankTeamId) === String(session.teamId) || String(item.lowerRankTeamId) === String(session.teamId));
  const partnerId = pairing && (String(pairing.higherRankTeamId) === String(session.teamId) ? pairing.lowerRankTeamId : pairing.higherRankTeamId);
  const teams = Array.isArray(game.teams) ? game.teams : [];
  const partner = teams.find((team) => String(team.teamId) === String(partnerId));
  const partnerLineups = (Array.isArray(partner && partner.currentLineups) ? partner.currentLineups : []).filter((row) => duoIds.indexOf(String(row.challengeId)) >= 0);
  const visibleRoster = (Array.isArray(game.roster) ? game.roster : []).filter((pet) => String(pet.teamId) === String(session.teamId));
  const visibleLineups = (Array.isArray(game.lineups) ? game.lineups : []).filter((row) => String(row.teamId) === String(session.teamId));
  return {
    round: game.round, phase: game.phase, version: game.version, viewerTeamId: session.teamId,
    gameState: game.gameState,
    formalEncounters: game.formalEncounters,
    pairings: game.pairings,
    roster: visibleRoster,
    lineups: visibleLineups,
    battles: game.battles,
    teams: teams.map((team) => {
      const teamRoster = Array.isArray(team.roster) ? team.roster : [];
      const teamLineups = Array.isArray(team.currentLineups) ? team.currentLineups : [];
      return ({
      teamId: team.teamId, teamName: team.teamName, score: team.score, rank: team.rank,
      enabled: team.enabled !== false,
      turtle_net: team.turtle_net || "",
      water_park: team.water_park || "",
      turtleNetEnabled: Boolean(team.turtleNetEnabled),
      waterParkEnabled: Boolean(team.waterParkEnabled),
      levelDistribution: levelDistribution_(teamRoster),
      cardLevelTotal: teamRoster.reduce((sum, pet) => sum + (Number(pet.level) || 1), 0),
      publicRoster: teamRoster.map((pet) => ({ petName: pet.petName, level: Number(pet.level) || 1, gameRoundsDeployed: Number(pet.gameRoundsDeployed) || 0 })),
      ...(String(team.teamId) === String(session.teamId) ? { version: team.version, roster: teamRoster, currentLineups: teamLineups } : {}),
    });
    }),
    duoPartner: partner && duoIds.length ? {
      teamId: partner.teamId, teamName: partner.teamName, rank: partner.rank,
      turtle_net: partner.turtle_net || "",
      water_park: partner.water_park || "",
      turtleNetEnabled: Boolean(partner.turtleNetEnabled),
      waterParkEnabled: Boolean(partner.waterParkEnabled),
      currentLineups: partnerLineups,
      roster: Array.isArray(partner.roster) ? partner.roster : [],
    } : null,
    duoPairings: pairings,
    battleHistory: game.battleHistory,
  };
}

function decodeReplay_(encoded) {
  if (!String(encoded).startsWith("gzip:")) throw apiError_("INVALID_REPLAY", "戰鬥回放格式無法辨識", 500);
  const bytes = Utilities.base64Decode(String(encoded).slice(5));
  return JSON.parse(Utilities.ungzip(Utilities.newBlob(bytes, "application/gzip")).getDataAsString());
}

function loadBattleReplays_(payload, session) {
  const ids = payload.battleIds;
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20) throw apiError_("INVALID_BATTLE_IDS", "戰鬥紀錄資料格式錯誤", 400);
  const byId = new Map(table_(SHEETS.battles).map((battle) => [String(battle.battleId), battle]));
  return { replays: ids.map((id) => {
    const battle = byId.get(String(id));
    if (!battle) throw apiError_("BATTLE_NOT_FOUND", `找不到戰鬥紀錄：${id}`, 404);
    return decodeReplay_(battle.replayJson);
  }) };
}

function loadChallengeBattles_(payload, session) {
  const teamId = session.role === "worker" ? String(payload.teamId || "") : String(session.teamId);
  const challengeId = String(payload.challengeId || "");
  if (!teamId || !challengeId) throw apiError_("INVALID_BATTLE_QUERY", "缺少隊伍或關卡", 400);
  const rows = table_(SHEETS.battles).filter((battle) =>
    String(battle.challengeId) === challengeId &&
    String(battle.teamIds || "").split(",").map((value) => value.trim()).includes(teamId)
  );
  return { teamId, challengeId, battles: rows.map((battle) => decodeReplay_(battle.replayJson)) };
}

function loadWorkerTeam_(payload) {
  const teamId = String(payload.teamId || "");
  if (!teamId) throw apiError_("TEAM_REQUIRED", "缺少隊伍編號", 400);
  const game = loadRawGameState_();
  const team = game.teams.find((item) => String(item.teamId) === teamId);
  if (!team) throw apiError_("TEAM_NOT_FOUND", "找不到隊伍", 404);
  return { round: game.round, version: game.version, team };
}

function loadWorkerAnalysis_(payload) {
  const challengeId = String(payload.challengeId || "");
  if (!challengeId) throw apiError_("CHALLENGE_REQUIRED", "缺少關卡編號", 400);
  const data = loadWorkerTestData_();
  return {
    challengeId,
    metrics: data.metrics && data.metrics[challengeId] || null,
    optimalLineups: data.optimalLineups && data.optimalLineups[challengeId] || [],
    oneClickLineup: data.oneClickLineups && data.oneClickLineups[challengeId] || [],
  };
}

function resetTeamPassword_(payload) {
  const teamId = String(payload.teamId || "");
  const password = String(payload.password || "");
  if (!teamId || password.length < 4) throw apiError_("INVALID_PASSWORD", "隊伍編號或密碼格式錯誤", 400);
  const row = table_(SHEETS.teams).find((item) => String(item.teamId) === teamId);
  if (!row) throw apiError_("TEAM_NOT_FOUND", "找不到隊伍", 404);
  const sheet = sheet_(SHEETS.teams);
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const column = headers.indexOf("passwordHash") + 1;
  sheet.getRange(row._rowNumber, column).setValue(passwordHash_(password));
  return { teamId, updated: true };
}

function saveLineup_(teamId, payload) {
  const round = Number(payload.round);
  const kinds = roundKinds_(round);
  const challengeIndex = kinds.findIndex((kind, index) => challengeId_(round, index, kind) === String(payload.challengeId));
  if (challengeIndex < 0 || !Array.isArray(payload.lineup)) throw apiError_("INVALID_LINEUP", "陣容資料格式錯誤", 400);
  const expectedSize = kinds[challengeIndex] === "duo" ? DUO_CONTRIBUTION_SIZE : SINGLE_TEAM_SIZE;
  if (payload.lineup.length !== expectedSize) throw apiError_("INVALID_LINEUP", "陣容格數錯誤", 400);
  const roster = table_(SHEETS.roster).filter((pet) => String(pet.teamId) === String(teamId));
  const owned = new Set(roster.map((pet) => String(pet.petName)));
  const selected = payload.lineup.filter(Boolean).map(String);
  if (selected.some((name) => !owned.has(name)) || new Set(selected).size !== selected.length) throw apiError_("INVALID_LINEUP", "陣容包含無效或重複角色", 400);
  const consumed = new Set(roster
    .filter(isConsumedOncePet_)
    .map((pet) => String(pet.petName)));
  if (selected.some((name) => consumed.has(name))) throw apiError_("PET_ALREADY_DEPLOYED", "整場限出戰一次的角色已經出戰過", 400);
  const all = table_(SHEETS.lineups);
  const previous = all.filter((row) => String(row.teamId) === String(teamId) && Number(row.round) === round && String(row.challengeId) === String(payload.challengeId));
  const currentVersion = Math.max(0, ...previous.map((row) => Number(row.version) || 0));
  if (Number(payload.version || 0) !== currentVersion) throw apiError_("VERSION_CONFLICT", "陣容已被其他分頁更新，請重新載入", 409);
  const elsewhere = latestLineups_(all.filter((row) => String(row.teamId) === String(teamId) && Number(row.round) === round && String(row.challengeId) !== String(payload.challengeId)));
  const used = new Set(elsewhere.map((row) => String(row.petName || "")).filter(Boolean));
  if (selected.some((name) => used.has(name))) throw apiError_("INVALID_LINEUP", "有角色已用於本回合其他關卡", 400);
  const nextVersion = currentVersion + 1;
  const now = new Date().toISOString();
  appendRows_(SHEETS.lineups, payload.lineup.map((name, index) => [round, String(payload.challengeId), String(teamId), index, name || "", nextVersion, now]));
  return { ok: true, version: nextVersion, updatedAt: now };
}

function savePlayerLineups_(teamId, payload) {
  const game = loadRawGameState_();
  if (Number(payload.round) !== game.round || !Array.isArray(payload.lineupUpdates)) {
    throw apiError_("VERSION_CONFLICT", "回合已變更，請重新載入", 409);
  }

  const team = game.teams.find((item) => String(item.teamId) === String(teamId));
  if (!team) throw apiError_("TEAM_NOT_FOUND", "找不到小隊", 404);

  const lineupUpdates = payload.lineupUpdates;
  const challengeIds = lineupUpdates.map((update) => String(update.challengeId || ""));
  if (challengeIds.some((challengeId) => !challengeId) || new Set(challengeIds).size !== challengeIds.length) {
    throw apiError_("INVALID_LINEUP", "關卡資料不可為空或重複", 400);
  }

  const kinds = roundKinds_(game.round);
  const lineupRows = table_(SHEETS.lineups);
  const finalLineupsByChallenge = {};

  kinds.forEach((kind, index) => {
    const challengeId = challengeId_(game.round, index, kind);
    const slotCount = kind === "duo" ? DUO_CONTRIBUTION_SIZE : SINGLE_TEAM_SIZE;
    finalLineupsByChallenge[challengeId] = getLineupSlots_(team.currentLineups, challengeId, slotCount);
  });

  lineupUpdates.forEach((update) => {
    const challengeId = String(update.challengeId);
    const kindIndex = kinds.findIndex((kind, index) => challengeId_(game.round, index, kind) === challengeId);
    if (kindIndex < 0 || !Array.isArray(update.lineup)) throw apiError_("INVALID_LINEUP", "陣容資料格式錯誤", 400);
    const expectedSize = kinds[kindIndex] === "duo" ? DUO_CONTRIBUTION_SIZE : SINGLE_TEAM_SIZE;
    if (update.lineup.length !== expectedSize) throw apiError_("INVALID_LINEUP", "陣容格數錯誤", 400);
    finalLineupsByChallenge[challengeId] = update.lineup.map((name) => name ? String(name) : "");
  });

  const roster = table_(SHEETS.roster).filter((pet) => String(pet.teamId) === String(teamId));
  const owned = new Set(roster.filter((pet) => (Number(pet.level) || 0) > 0).map((pet) => String(pet.petName)));
  const consumed = new Set(roster.filter(isConsumedOncePet_).map((pet) => String(pet.petName)));
  const usedNames = new Set();

  Object.keys(finalLineupsByChallenge).forEach((challengeId) => {
    const selected = finalLineupsByChallenge[challengeId].filter(Boolean).map(String);
    if (new Set(selected).size !== selected.length) throw apiError_("INVALID_LINEUP", "陣容包含重複角色", 400);
    selected.forEach((name) => {
      if (!owned.has(name)) throw apiError_("INVALID_LINEUP", "陣容包含未解鎖角色", 400);
      if (consumed.has(name)) throw apiError_("PET_ALREADY_DEPLOYED", "整場限出戰一次的角色已經出戰過", 400);
      if (usedNames.has(name)) throw apiError_("INVALID_LINEUP", "有角色已用於本回合其他關卡", 400);
      usedNames.add(name);
    });
  });

  const now = new Date().toISOString();
  const newRows = [];
  lineupUpdates.forEach((update) => {
    const challengeId = String(update.challengeId);
    const previous = lineupRows.filter((row) =>
      String(row.teamId) === String(teamId)
      && Number(row.round) === game.round
      && String(row.challengeId) === challengeId
    );
    const currentVersion = Math.max(0, ...previous.map((row) => Number(row.version) || 0));
    if (Number(update.version || 0) !== currentVersion) {
      throw apiError_("VERSION_CONFLICT", "陣容已被其他分頁更新，請重新載入", 409);
    }
    const nextVersion = currentVersion + 1;
    finalLineupsByChallenge[challengeId].forEach((name, slotIndex) => {
      newRows.push([game.round, challengeId, String(teamId), slotIndex, name || "", nextVersion, now]);
    });
  });

  appendRows_(SHEETS.lineups, newRows);
  return { ok: true, updatedChallenges: lineupUpdates.length, updatedAt: now };
}

function getLineupSlots_(rows, challengeId, slotCount) {
  const matching = rows
    .filter((row) => String(row.challengeId) === String(challengeId))
    .sort((a, b) => Number(a.slotIndex) - Number(b.slotIndex));
  return Array.from({ length: slotCount }, (_, index) => matching.find((row) => Number(row.slotIndex) === index)?.petName || "");
}

function drawRosters_(payload) {
  const game = loadRawGameState_();
  if (Number(game.round) === 1) throw apiError_("INITIAL_ROUND_FIXED_POOL", "第 1 回合使用固定初始角色池，不能抽卡", 400);
  const eligible = Array.isArray(payload.eligiblePetNames) ? [...new Set(payload.eligiblePetNames.map(String))] : [];
  const count = Math.max(1, Math.min(100, Number(payload.cardCount) || DRAW_CARDS));
  if (!eligible.length) throw apiError_("INVALID_DRAW_POOL", "抽卡角色池不可為空", 400);
  const teamIds = Array.isArray(payload.teamIds)
    ? [...new Set(payload.teamIds.map(String))]
    : game.teams.map((team) => String(team.teamId));
  const selectedTeams = game.teams.filter((team) => teamIds.indexOf(String(team.teamId)) >= 0);
  if (!selectedTeams.length) throw apiError_("TEAM_REQUIRED", "至少要指定一個有效隊伍", 400);
  const rosterSheet = sheet_(SHEETS.roster);
  const roster = table_(SHEETS.roster);
  const newRows = [];
  selectedTeams.forEach((team) => {
    const ownedRows = roster.filter((pet) => String(pet.teamId) === String(team.teamId));
    const byName = new Map(ownedRows.map((pet) => [String(pet.petName), { row: pet, level: Number(pet.level) || 1 }]));
    for (let draw = 0; draw < count; draw += 1) {
      const name = eligible[Math.floor(Math.random() * eligible.length)];
      const owned = byName.get(name);
      if (!owned || (Number(owned.level) || 0) <= 0) {
        const entry = owned || { row: null, level: 0 };
        entry.level = 1;
        byName.set(name, entry);
        correctLevelGap_(byName, eligible);
      } else {
        const before = owned.level;
        owned.level = Math.min(MAX_LEVEL, owned.level + 1);
        if (levelGap_(byName) > MAX_LEVEL_GAP) {
          owned.level = before;
          upgradeLowest_(byName, eligible);
        }
      }
    }
    byName.forEach((value, name) => {
      if (!value.row) newRows.push([String(team.teamId), name, value.level, 0, 1]);
      else if (value.level !== (Number(value.row.level) || 1)) {
        rosterSheet.getRange(value.row._rowNumber, 3, 1, 3).setValues([[value.level, Number(value.row.gameRoundsDeployed) || 0, (Number(value.row.version) || 1) + 1]]);
      }
    });
  });
  appendRows_(SHEETS.roster, newRows);
  return { round: game.round, cardCount: count, teams: selectedTeams.map((team) => ({ teamId: team.teamId, teamName: team.teamName })) };
}

function setInitialRosters_(payload) {
  const game = loadRawGameState_();
  const rosterSheet = sheet_(SHEETS.roster);
  const roster = table_(SHEETS.roster);
  const allPets = new Set(INITIAL_ROUND_POOL_NAMES);
  const existingWrites = [];
  const newRows = [];

  game.teams.forEach((team) => {
    const byName = new Map(roster.filter((pet) => String(pet.teamId) === String(team.teamId)).map((pet) => [String(pet.petName), pet]));
    byName.forEach((pet, petName) => {
      existingWrites.push({
        rowNumber: pet._rowNumber,
        values: [allPets.has(petName) ? 1 : 0, 0, (Number(pet.version) || 1) + 1],
      });
    });
    INITIAL_ROUND_POOL_NAMES.forEach((petName) => {
      if (!byName.has(petName)) newRows.push([String(team.teamId), petName, 1, 0, 1]);
    });
  });

  existingWrites.sort((a, b) => a.rowNumber - b.rowNumber);
  for (let index = 0; index < existingWrites.length;) {
    const start = index;
    let end = index + 1;
    while (end < existingWrites.length && existingWrites[end].rowNumber === existingWrites[end - 1].rowNumber + 1) end += 1;
    rosterSheet.getRange(existingWrites[start].rowNumber, 3, end - start, 3)
      .setValues(existingWrites.slice(start, end).map((write) => write.values));
    index = end;
  }
  appendRows_(SHEETS.roster, newRows);

  if (payload.clearCurrentRoundLineups) {
    const allLineups = table_(SHEETS.lineups);
    const now = new Date().toISOString();
    const rows = [];
    roundKinds_(game.round).forEach((kind, index) => {
      const challengeId = challengeId_(game.round, index, kind);
      const slotCount = kind === "duo" ? DUO_CONTRIBUTION_SIZE : SINGLE_TEAM_SIZE;
      game.teams.forEach((team) => {
        const previous = allLineups.filter((row) =>
          String(row.teamId) === String(team.teamId)
          && Number(row.round) === game.round
          && String(row.challengeId) === challengeId
        );
        const version = Math.max(0, ...previous.map((row) => Number(row.version) || 0)) + 1;
        for (var slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
          rows.push([game.round, challengeId, String(team.teamId), slotIndex, "", version, now]);
        }
      });
    });
    appendRows_(SHEETS.lineups, rows);
  }

  return {
    round: game.round,
    teams: game.teams.length,
    initialPoolSize: INITIAL_ROUND_POOL_NAMES.length,
  };
}

function levelGap_(byName) {
  const levels = [...byName.values()].map((item) => Number(item.level) || 0).filter((level) => level > 0);
  return levels.length ? Math.max(...levels) - Math.min(...levels) : 0;
}

function upgradeLowest_(byName, order) {
  const active = [...byName.values()].filter((item) => (Number(item.level) || 0) > 0);
  if (!active.length) return;
  const lowest = Math.min(...active.map((item) => Number(item.level) || 0));
  const name = order.find((candidate) => byName.has(candidate) && byName.get(candidate).level === lowest);
  if (name) byName.get(name).level = Math.min(MAX_LEVEL, lowest + 1);
}

function correctLevelGap_(byName, order) { if (levelGap_(byName) > MAX_LEVEL_GAP) upgradeLowest_(byName, order); }

function updateRosterLevels_(payload) {
  const updates = payload.updates;
  if (!payload.teamId || !Array.isArray(updates)) throw apiError_("INVALID_ROSTER_UPDATE", "角色等級資料格式錯誤", 400);
  const names = updates.map((update) => String(update.petName || ""));
  if (names.some((name) => !name) || new Set(names).size !== names.length) throw apiError_("INVALID_ROSTER_UPDATE", "角色名稱不可為空或重複", 400);
  const game = loadRawGameState_();
  const team = game.teams.find((item) => String(item.teamId) === String(payload.teamId));
  if (!team) throw apiError_("TEAM_NOT_FOUND", "找不到小隊", 404);
  const roster = table_(SHEETS.roster);
  const byName = new Map(roster.filter((pet) => String(pet.teamId) === String(payload.teamId)).map((pet) => [String(pet.petName), pet]));
  const usedNames = new Set(team.currentLineups.map((row) => String(row.petName || "")).filter(Boolean));
  updates.forEach((update) => {
    const pet = byName.get(String(update.petName));
    const expectedVersion = pet ? (Number(pet.version) || 1) : 0;
    const level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(update.level) || 0)));
    if (Number(update.version) !== expectedVersion) throw apiError_("VERSION_CONFLICT", `角色「${update.petName}」已被更新`, 409);
    if (level === 0 && usedNames.has(String(update.petName))) throw apiError_("ROSTER_IN_USE", `角色「${update.petName}」仍在本回合陣容中，不能鎖定`, 400);
  });
  const rosterSheet = sheet_(SHEETS.roster);
  const newRows = [];
  const existingWrites = [];
  let unlocked = 0;
  let locked = 0;
  updates.forEach((update) => {
    const pet = byName.get(String(update.petName));
    const level = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(update.level) || 0)));
    if (!pet && level > 0) {
      newRows.push([String(payload.teamId), String(update.petName), level, 0, 1]);
      unlocked += 1;
    } else if (pet) {
      const previousLevel = Number(pet.level) || 0;
      existingWrites.push({
        rowNumber: pet._rowNumber,
        values: [level, Number(pet.gameRoundsDeployed) || 0, (Number(pet.version) || 1) + 1],
      });
      if (previousLevel <= 0 && level > 0) unlocked += 1;
      if (previousLevel > 0 && level <= 0) locked += 1;
    }
  });
  existingWrites.sort((a, b) => a.rowNumber - b.rowNumber);
  for (let index = 0; index < existingWrites.length;) {
    const start = index;
    let end = index + 1;
    while (end < existingWrites.length && existingWrites[end].rowNumber === existingWrites[end - 1].rowNumber + 1) end += 1;
    rosterSheet.getRange(existingWrites[start].rowNumber, 3, end - start, 3)
      .setValues(existingWrites.slice(start, end).map((write) => write.values));
    index = end;
  }
  appendRows_(SHEETS.roster, newRows);
  return { updated: updates.length, unlocked, locked };
}

function saveWorkerDrafts_(payload) {
  const game = loadRawGameState_();
  if (Number(payload.round) !== game.round || !Array.isArray(payload.teams)) throw apiError_("VERSION_CONFLICT", "回合已變更，請重新載入", 409);
  const entries = payload.teams;
  const teamIds = entries.map((entry) => String(entry.teamId || ""));
  if (teamIds.some((teamId) => !teamId) || new Set(teamIds).size !== teamIds.length) throw apiError_("INVALID_WORKER_DRAFTS", "小隊資料格式錯誤", 400);

  const rosterSheet = sheet_(SHEETS.roster);
  const rosterRows = table_(SHEETS.roster);
  const lineupRows = table_(SHEETS.lineups);
  const existingWrites = [];
  const newRosterRows = [];
  const newLineupRows = [];
  const now = new Date().toISOString();
  let updatedPets = 0;
  let unlocked = 0;
  let locked = 0;
  let updatedChallenges = 0;

  entries.forEach((entry) => {
    const teamId = String(entry.teamId);
    const team = game.teams.find((item) => String(item.teamId) === teamId);
    if (!team) throw apiError_("TEAM_NOT_FOUND", `找不到小隊：${teamId}`, 404);

    const rosterUpdates = Array.isArray(entry.rosterUpdates) ? entry.rosterUpdates : [];
    const lineupUpdates = Array.isArray(entry.lineupUpdates) ? entry.lineupUpdates : [];
    const rosterNames = rosterUpdates.map((update) => String(update.petName || ""));
    if (rosterNames.some((name) => !name) || new Set(rosterNames).size !== rosterNames.length) throw apiError_("INVALID_ROSTER_UPDATE", `第 ${teamId} 小隊角色名稱不可為空或重複`, 400);
    const lineupIds = lineupUpdates.map((update) => String(update.challengeId || ""));
    if (lineupIds.some((id) => !id) || new Set(lineupIds).size !== lineupIds.length) throw apiError_("INVALID_LINEUP", `第 ${teamId} 小隊關卡資料不可為空或重複`, 400);

    const rosterByName = new Map(rosterRows.filter((pet) => String(pet.teamId) === teamId).map((pet) => [String(pet.petName), pet]));
    const finalLevels = {};
    rosterByName.forEach((pet, petName) => finalLevels[petName] = Number(pet.level) || 0);
    rosterUpdates.forEach((update) => {
      const petName = String(update.petName);
      const pet = rosterByName.get(petName);
      const expectedVersion = pet ? (Number(pet.version) || 1) : 0;
      if (Number(update.version) !== expectedVersion) throw apiError_("VERSION_CONFLICT", `角色「${petName}」已被更新`, 409);
      finalLevels[petName] = Math.max(0, Math.min(MAX_LEVEL, Math.floor(Number(update.level) || 0)));
    });

    const kinds = roundKinds_(game.round);
    const finalLineupsByChallenge = {};
    kinds.forEach((kind, index) => {
      const challengeId = challengeId_(game.round, index, kind);
      const slotCount = kind === "duo" ? DUO_CONTRIBUTION_SIZE : SINGLE_TEAM_SIZE;
      finalLineupsByChallenge[challengeId] = getLineupSlots_(team.currentLineups, challengeId, slotCount);
    });

    lineupUpdates.forEach((update) => {
      const challengeId = String(update.challengeId);
      const kindIndex = kinds.findIndex((kind, index) => challengeId_(game.round, index, kind) === challengeId);
      if (kindIndex < 0 || !Array.isArray(update.lineup)) throw apiError_("INVALID_LINEUP", `第 ${teamId} 小隊陣容資料格式錯誤`, 400);
      const expectedSize = kinds[kindIndex] === "duo" ? DUO_CONTRIBUTION_SIZE : SINGLE_TEAM_SIZE;
      if (update.lineup.length !== expectedSize) throw apiError_("INVALID_LINEUP", `第 ${teamId} 小隊陣容格數錯誤`, 400);
      finalLineupsByChallenge[challengeId] = update.lineup.map((name) => name ? String(name) : "");
    });

    const usedNames = new Set();
    Object.keys(finalLineupsByChallenge).forEach((challengeId) => {
      const selected = finalLineupsByChallenge[challengeId].filter(Boolean).map(String);
      if (new Set(selected).size !== selected.length) throw apiError_("INVALID_LINEUP", `第 ${teamId} 小隊陣容包含重複角色`, 400);
      selected.forEach((name) => {
        if (usedNames.has(name)) throw apiError_("INVALID_LINEUP", `第 ${teamId} 小隊有角色重複用於不同關卡`, 400);
        usedNames.add(name);
      });
    });

    rosterUpdates.forEach((update) => {
      const petName = String(update.petName);
      if ((finalLevels[petName] || 0) <= 0 && usedNames.has(petName)) throw apiError_("ROSTER_IN_USE", `角色「${petName}」仍在本回合陣容中，不能鎖定`, 400);
    });

    const owned = new Set(Object.keys(finalLevels).filter((petName) => (Number(finalLevels[petName]) || 0) > 0));
    const consumed = new Set((team.roster || []).filter(isConsumedOncePet_).map((pet) => String(pet.petName)));
    lineupUpdates.forEach((update) => {
      const challengeId = String(update.challengeId);
      const selected = finalLineupsByChallenge[challengeId].filter(Boolean).map(String);
      if (selected.some((name) => !owned.has(name))) throw apiError_("INVALID_LINEUP", `第 ${teamId} 小隊陣容包含未解鎖角色`, 400);
      if (selected.some((name) => consumed.has(name))) throw apiError_("PET_ALREADY_DEPLOYED", `第 ${teamId} 小隊陣容包含已出戰過的一次性角色`, 400);
      const previous = lineupRows.filter((row) => String(row.teamId) === teamId && Number(row.round) === game.round && String(row.challengeId) === challengeId);
      const currentVersion = Math.max(0, ...previous.map((row) => Number(row.version) || 0));
      if (Number(update.version || 0) !== currentVersion) throw apiError_("VERSION_CONFLICT", `第 ${teamId} 小隊陣容已被其他分頁更新`, 409);
      const nextVersion = currentVersion + 1;
      finalLineupsByChallenge[challengeId].forEach((name, slotIndex) => {
        newLineupRows.push([game.round, challengeId, teamId, slotIndex, name || "", nextVersion, now]);
      });
      updatedChallenges += 1;
    });

    rosterUpdates.forEach((update) => {
      const petName = String(update.petName);
      const pet = rosterByName.get(petName);
      const level = Number(finalLevels[petName]) || 0;
      if (!pet && level > 0) {
        newRosterRows.push([teamId, petName, level, 0, 1]);
        unlocked += 1;
        updatedPets += 1;
      } else if (pet) {
        const previousLevel = Number(pet.level) || 0;
        existingWrites.push({
          rowNumber: pet._rowNumber,
          values: [level, Number(pet.gameRoundsDeployed) || 0, (Number(pet.version) || 1) + 1],
        });
        if (previousLevel <= 0 && level > 0) unlocked += 1;
        if (previousLevel > 0 && level <= 0) locked += 1;
        if (previousLevel !== level) updatedPets += 1;
      }
    });
  });

  existingWrites.sort((a, b) => a.rowNumber - b.rowNumber);
  for (let index = 0; index < existingWrites.length;) {
    const start = index;
    let end = index + 1;
    while (end < existingWrites.length && existingWrites[end].rowNumber === existingWrites[end - 1].rowNumber + 1) end += 1;
    rosterSheet.getRange(existingWrites[start].rowNumber, 3, end - start, 3)
      .setValues(existingWrites.slice(start, end).map((write) => write.values));
    index = end;
  }
  appendRows_(SHEETS.roster, newRosterRows);
  appendRows_(SHEETS.lineups, newLineupRows);
  return { updatedPets, unlocked, locked, updatedChallenges, teams: entries.length };
}

function autoConfigureAllLineups_(payload) {
  const game = loadRawGameState_();
  if (Number(payload.round) !== game.round || !Array.isArray(payload.lineups)) throw apiError_("VERSION_CONFLICT", "回合已變更，請重新載入", 409);
  const rosterByTeam = new Map(game.teams.map((team) => [String(team.teamId), new Set(team.roster.map((pet) => String(pet.petName)))]));
  const allRows = table_(SHEETS.lineups);
  const now = new Date().toISOString();
  const rows = [];
  payload.lineups.forEach((entry) => {
    const owned = rosterByTeam.get(String(entry.teamId));
    if (!owned || !Array.isArray(entry.lineup) || entry.lineup.some((name) => name && !owned.has(String(name)))) throw apiError_("INVALID_LINEUP", "一鍵組隊資料包含無效角色", 400);
    const team = game.teams.find((item) => String(item.teamId) === String(entry.teamId));
    const consumed = new Set((team && team.roster || []).filter(isConsumedOncePet_).map((pet) => String(pet.petName)));
    if (entry.lineup.some((name) => name && consumed.has(String(name)))) throw apiError_("PET_ALREADY_DEPLOYED", "一鍵組隊包含已經出戰過的一次性角色", 400);
    const previous = allRows.filter((row) => String(row.teamId) === String(entry.teamId) && Number(row.round) === game.round && String(row.challengeId) === String(entry.challengeId));
    const version = Math.max(0, ...previous.map((row) => Number(row.version) || 0)) + 1;
    entry.lineup.forEach((name, index) => rows.push([game.round, String(entry.challengeId), String(entry.teamId), index, name || "", version, now]));
  });
  appendRows_(SHEETS.lineups, rows);
  return { round: game.round, teams: game.teams.length, lineups: rows.length };
}

function saveOfficialRound_(payload) {
  const game = loadRawGameState_();
  if (Number(payload.round) !== game.round || Number(payload.version) !== game.version || !Array.isArray(payload.battles)) throw apiError_("VERSION_CONFLICT", "遊戲回合已被更新，請重新載入", 409);
  const actualVersions = game.teams.flatMap((team) => roundKinds_(game.round).map((kind, index) => {
    const id = challengeId_(game.round, index, kind);
    return { teamId: String(team.teamId), challengeId: id, version: Math.max(0, ...team.currentLineups.filter((row) => String(row.challengeId) === id).map((row) => Number(row.version) || 0)) };
  }));
  if (JSON.stringify(normalizeVersions_(payload.lineupVersions || [])) !== JSON.stringify(normalizeVersions_(actualVersions))) throw apiError_("LINEUP_VERSION_CONFLICT", "出戰陣容已變更，請重新結算", 409);
  const deltas = {};
  payload.battles.forEach((battle) => (battle.teamIds || []).forEach((id) => deltas[String(id)] = (deltas[String(id)] || 0) + (Number(battle.score && battle.score.total) || 0)));
  const scored = game.teams.map((team) => Object.assign({}, team, { nextScore: team.score + (deltas[String(team.teamId)] || 0) }));
  const ranked = scored.slice().sort((a, b) =>
    b.nextScore - a.nextScore || compareTeamIds_(a.teamId, b.teamId)
  );
  const ranks = new Map(ranked.map((team, index) => [String(team.teamId), index + 1]));
  const teamsSheet = sheet_(SHEETS.teams);
  const teamRows = table_(SHEETS.teams);
  scored.forEach((team) => {
    const row = teamRows.find((item) => String(item.teamId) === String(team.teamId));
    teamsSheet.getRange(row._rowNumber, 4, 1, 3).setValues([[team.nextScore, ranks.get(String(team.teamId)), (Number(row.version) || 1) + 1]]);
  });
  const rosterSheet = sheet_(SHEETS.roster);
  const roster = table_(SHEETS.roster);
  game.teams.forEach((team) => {
    const deployed = new Set(team.currentLineups.map((row) => String(row.petName || "")).filter(Boolean));
    roster.filter((pet) => String(pet.teamId) === String(team.teamId) && deployed.has(String(pet.petName))).forEach((pet) => {
      rosterSheet.getRange(pet._rowNumber, 3, 1, 3).setValues([[Number(pet.level) || 1, (Number(pet.gameRoundsDeployed) || 0) + 1, (Number(pet.version) || 1) + 1]]);
    });
  });
  const now = new Date().toISOString();
  appendRows_(SHEETS.battles, payload.battles.map((battle) => [
    battle.battleId, game.round, battle.challengeId, (battle.teamIds || []).join(","),
    Number(battle.score && battle.score.total) || 0, battle.score && battle.score.cleared ? "clear" : "failed",
    battle.replayJson || encodeReplay_(battle), now,
  ]));
  const nextRound = Math.min(MAX_ROUND, game.round + 1);
  const phase = game.round >= MAX_ROUND ? "finished" : "prepare";
  if (phase !== "finished") {
    const nextTeams = scored.map((team) => Object.assign({}, team, { rank: ranks.get(String(team.teamId)) }));
    writeMissingRoundPairings_(nextRound, nextTeams, now);
  }
  sheet_(SHEETS.gameState).getRange(2, 1, 1, 4).setValues([[nextRound, phase, game.version + 1, now]]);
  return { round: nextRound, phase, version: game.version + 1, scoreDelta: deltas };
}

function normalizeVersions_(items) {
  return items.map((item) => ({ teamId: String(item.teamId), challengeId: String(item.challengeId), version: Number(item.version) || 0 }))
    .sort((a, b) => a.teamId.localeCompare(b.teamId) || a.challengeId.localeCompare(b.challengeId));
}

function encodeReplay_(battle) {
  const zipped = Utilities.gzip(Utilities.newBlob(JSON.stringify(battle), "application/json"));
  return "gzip:" + Utilities.base64Encode(zipped.getBytes());
}

function clearSheetData_(name) {
  const target = sheet_(name);
  const dataRowCount = Math.max(0, target.getLastRow() - 1);
  if (dataRowCount > 0) {
    target.getRange(2, 1, dataRowCount, target.getLastColumn()).clearContent();
  }
  return dataRowCount;
}

function resetGame_(payload) {
  if (payload.confirmation !== "RESET") throw apiError_("RESET_CONFIRMATION_REQUIRED", "確認文字不正確", 400);
  const cleared = {};
  [SHEETS.roster, SHEETS.lineups, SHEETS.pairings, SHEETS.battles].forEach((name) => {
    cleared[name] = clearSheetData_(name);
  });
  SpreadsheetApp.flush();
  if (table_(SHEETS.pairings).length) throw apiError_("RESET_PAIRINGS_FAILED", "Pairings 工作表清除失敗", 500);
  const now = new Date().toISOString();
  sheet_(SHEETS.gameState).getRange(2, 1, 1, 4).setValues([[1, "prepare", 1, now]]);
  const teams = table_(SHEETS.teams);
  const teamsSheet = sheet_(SHEETS.teams);
  const initialRanks = new Map(teams.slice().sort((a, b) => compareTeamIds_(a.teamId, b.teamId))
    .map((team, index) => [String(team.teamId), index + 1]));
  teams.forEach((team) => teamsSheet.getRange(team._rowNumber, 4, 1, 3).setValues([[0, initialRanks.get(String(team.teamId)), 1]]));
  return { round: 1, phase: "prepare", version: 1, clearedPairings: cleared[SHEETS.pairings] || 0 };
}

/** 在 Apps Script 編輯器手動執行，用來設定或重設帳號密碼。 */
function setCredentialPassword(sheetName, accountId, password) {
  if ([SHEETS.teams, SHEETS.workerAuth].indexOf(sheetName) < 0) throw new Error("sheetName 必須是 Teams 或 WorkerAuth");
  const idColumn = sheetName === SHEETS.teams ? "teamId" : "workerId";
  const row = table_(sheetName).find((item) => String(item[idColumn]) === String(accountId));
  if (!row) throw new Error("找不到帳號");
  const headers = sheet_(sheetName).getRange(1, 1, 1, sheet_(sheetName).getLastColumn()).getValues()[0];
  const passwordColumn = headers.indexOf("passwordHash") + 1;
  sheet_(sheetName).getRange(row._rowNumber, passwordColumn).setValue(passwordHash_(password));
}

/** 第一次部署前手動執行；建立 secrets，並記錄私人 Sheet ID。 */
function initializeScriptProperties(spreadsheetId) {
  if (!spreadsheetId) throw new Error("請傳入 Spreadsheet ID");
  PropertiesService.getScriptProperties().setProperties({
    SPREADSHEET_ID: String(spreadsheetId),
    SESSION_SECRET: Utilities.getUuid() + Utilities.getUuid(),
    PASSWORD_PEPPER: Utilities.getUuid() + Utilities.getUuid(),
  });
}

/** 綁定 Sheet 的 Apps Script 可直接從編輯器執行此函式完成首次初始化。 */
function initializeBoundProject() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("此 Apps Script 沒有綁定 Google Sheet");
  initializeScriptProperties(spreadsheet.getId());
  initializeSpreadsheet();
  return "初始化完成";
}

/**
 * 全新專案一次初始化：會清除目前 Spreadsheet 的資料表內容，請只在全新或確定要重置的 Sheet 執行。
 * 執行前會逐一要求輸入隊伍／工人密碼；密碼只寫入雜湊，不會回傳或寫回程式碼。
 */
function setupProjectFromScratch() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("此 Apps Script 必須綁定 Google Sheet");
  const ui = SpreadsheetApp.getUi();
  const workerPassword = promptSetupPassword_(ui, "工人帳號 worker");
  const teamPasswords = [];
  for (let index = 1; index <= MULTIPLAYER_TEAM_COUNT; index += 1) {
    teamPasswords.push(promptSetupPassword_(ui, `第 ${index} 小隊`));
  }

  initializeScriptProperties(spreadsheet.getId());
  initializeSpreadsheet();
  const teamRows = teamPasswords.map((password, index) => [
    String(index + 1), `第 ${index + 1} 小隊`, passwordHash_(password), 0, index + 1, 1, true,
  ]);
  appendRows_(SHEETS.teams, teamRows);
  appendRows_(SHEETS.workerAuth, [["worker", passwordHash_(workerPassword), true]]);
  return {
    message: "專案初始化完成；隊伍與工人密碼已依輸入設定",
    spreadsheetId: spreadsheet.getId(),
    teams: MULTIPLAYER_TEAM_COUNT,
    workerId: "worker",
    nextStep: "執行 importWorkerTestData(dataJson) 匯入 WorkerTestData",
  };
}

function promptSetupPassword_(ui, accountLabel) {
  const result = ui.prompt("設定登入密碼", `${accountLabel}：請輸入密碼（至少 4 個字元）`, ui.ButtonSet.OK_CANCEL);
  if (result.getSelectedButton() !== ui.Button.OK) throw new Error("使用者取消初始化");
  const password = String(result.getResponseText() || "");
  if (password.length < 4) throw new Error(`${accountLabel} 的密碼至少需要 4 個字元`);
  return password;
}

/** 既有專案補齊到 12 隊：只新增缺少的小隊，不清除任何現有資料。 */
function addMissingTeamsToTen() {
  const existing = table_(SHEETS.teams);
  const existingIds = new Set(existing.map((team) => String(team.teamId)));
  const ui = SpreadsheetApp.getUi();
  const rows = [];
  const maxRank = Math.max(0, ...existing.map((team) => Number(team.rank) || 0));
  for (let index = 1; index <= MULTIPLAYER_TEAM_COUNT; index += 1) {
    if (existingIds.has(String(index))) continue;
    const password = promptSetupPassword_(ui, `第 ${index} 小隊`);
    rows.push([String(index), `第 ${index} 小隊`, passwordHash_(password), 0, maxRank + rows.length + 1, 1, true]);
  }
  appendRows_(SHEETS.teams, rows);
  return { added: rows.length, total: table_(SHEETS.teams).length };
}

/** 既有專案只新增 Pairings，不清除其他工作表內容。 */
function addPairingsSheet() {
  const spreadsheet = spreadsheet_();
  const headers = SHEET_HEADERS.Pairings;
  const sheet = spreadsheet.getSheetByName(SHEETS.pairings) || spreadsheet.insertSheet(SHEETS.pairings);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  const game = loadRawGameState_();
  const added = writeMissingRoundPairings_(game.round, game.teams, new Date().toISOString());
  return `Pairings 工作表已建立；目前回合新增 ${added.length} 組配對`;
}

/** Pairings 已存在但目前雙人回合為空時，手動執行此函式補寫。 */
function backfillCurrentPairings() {
  const game = loadRawGameState_();
  const added = writeMissingRoundPairings_(game.round, game.teams, new Date().toISOString());
  SpreadsheetApp.flush();
  return `第 ${game.round} 回合新增 ${added.length} 組配對`;
}

/** 以全新資料為前提建立／重建工作表表頭。 */
function initializeSpreadsheet() {
  const spreadsheet = spreadsheet_();
  Object.entries(SHEET_HEADERS).forEach(([name, headers]) => {
    const sheet = spreadsheet.getSheetByName(name) || spreadsheet.insertSheet(name);
    sheet.clear();
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  });
  sheet_(SHEETS.gameState).getRange(2, 1, 1, 4).setValues([[1, "prepare", 1, new Date().toISOString()]]);
}

/**
 * 將本機產生的工人測試資料匯入私人 Sheet。只應由擁有 Sheet 編輯權限的工人執行。
 * dataJson 格式：{"challenges":[],"oneClickLineups":{},"optimalLineups":{},"metrics":{}}
 */
function importWorkerTestData(dataJson) {
  const parsed = JSON.parse(String(dataJson || ""));
  ["challenges", "oneClickLineups", "optimalLineups", "metrics"].forEach((key) => {
    if (!(key in parsed)) throw new Error(`缺少 WorkerTestData 欄位：${key}`);
  });
  const sheet = sheet_(SHEETS.workerTestData);
  const existing = Math.max(0, sheet.getLastRow() - 1);
  if (existing) sheet.getRange(2, 1, existing, sheet.getLastColumn()).clearContent();
  const now = new Date().toISOString();
  const rows = ["challenges", "oneClickLineups", "optimalLineups", "metrics"].map((key) => [key, JSON.stringify(parsed[key]), now]);
  sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return `已匯入 ${rows.length} 組工人測試資料`;
}

/**
 * dataJson 格式：{"formalEncounters":[]}
 */
function importFormalEncounterData(dataJson) {
  const parsed = JSON.parse(String(dataJson || ""));
  if (!Array.isArray(parsed.formalEncounters)) throw new Error("缺少 EncounterData 欄位：formalEncounters");
  const sheet = sheet_(SHEETS.encounterData);
  const existing = Math.max(0, sheet.getLastRow() - 1);
  if (existing) sheet.getRange(2, 1, existing, sheet.getLastColumn()).clearContent();
  const now = new Date().toISOString();
  sheet.getRange(2, 1, 1, 3).setValues([["formalEncounters", JSON.stringify(parsed.formalEncounters), now]]);
  return `已匯入 ${parsed.formalEncounters.length} 個正式關卡`;
}

/** 既有遊戲只新增 WorkerTestData，不清除其他工作表。 */
function addWorkerTestDataSheet() {
  const spreadsheet = spreadsheet_();
  const headers = SHEET_HEADERS.WorkerTestData;
  const sheet = spreadsheet.getSheetByName(SHEETS.workerTestData) || spreadsheet.insertSheet(SHEETS.workerTestData);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return "WorkerTestData 工作表已建立";
}

function addEncounterDataSheet() {
  const spreadsheet = spreadsheet_();
  const headers = SHEET_HEADERS.EncounterData;
  const sheet = spreadsheet.getSheetByName(SHEETS.encounterData) || spreadsheet.insertSheet(SHEETS.encounterData);
  sheet.clear();
  sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  return "EncounterData 工作表已建立";
}

function addBattleFlagsSheet() {
  const spreadsheet = spreadsheet_();
  const headers = SHEET_HEADERS.BattleFlags;
  const sheet = spreadsheet.getSheetByName(SHEETS.battleFlags) || spreadsheet.insertSheet(SHEETS.battleFlags);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
  }
  return "BattleFlags 工作表已建立";
}

function migrateBattleFlagsToDedicatedSheet() {
  addBattleFlagsSheet();
  const teams = table_(SHEETS.teams);
  const states = table_(SHEETS.gameState);
  const state = states[0] || {};
  const sheet = sheet_(SHEETS.battleFlags);
  const existing = Math.max(0, sheet.getLastRow() - 1);
  if (existing) sheet.getRange(2, 1, existing, sheet.getLastColumn()).clearContent();

  const now = new Date().toISOString();
  const rows = teams
    .filter((team) => String(team.turtle_net || "").trim() || String(team.water_park || "").trim())
    .map((team) => [
      "team",
      String(team.teamId),
      team.turtle_net || "",
      team.water_park || "",
      "",
      now,
    ]);

  if (String(state.is_raining || "").trim()) {
    rows.push(["game", "current", "", "", state.is_raining || "", now]);
  }

  if (rows.length) sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  return `已搬移 ${rows.length} 筆旗標資料到 BattleFlags`;
}
