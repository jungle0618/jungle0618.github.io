const SESSION_KEY = "imoc_apps_script_session";

function endpointUrl() {
  const url = process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;
  if (!url) {
    const error = new Error("尚未設定 NEXT_PUBLIC_APPS_SCRIPT_URL");
    error.code = "API_NOT_CONFIGURED";
    throw error;
  }
  return url;
}

function readToken() {
  return typeof window === "undefined" ? null : window.sessionStorage.getItem(SESSION_KEY);
}

function writeToken(token) {
  if (typeof window === "undefined") return;
  if (token) window.sessionStorage.setItem(SESSION_KEY, token);
  else window.sessionStorage.removeItem(SESSION_KEY);
}

async function request(fetchImpl, action, payload = {}) {
  const response = await fetchImpl(endpointUrl(), {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, token: readToken(), payload }),
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.ok) {
    const error = new Error(body?.message ?? `Request failed: ${response.status}`);
    error.status = body?.status ?? response.status;
    error.code = body?.code;
    throw error;
  }
  return body.data ?? {};
}

async function gzipBase64(value) {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([JSON.stringify(value)]).stream().pipeThrough(new CompressionStream("gzip"));
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return `gzip:${btoa(binary)}`;
}

/** GitHub Pages 前端只呼叫 Apps Script Web App，不持有任何 Google 金鑰。 */
export function createMultiplayerApi(fetchImpl = fetch) {
  return {
    async loginTeam(credentials) {
      const result = await request(fetchImpl, "loginTeam", credentials);
      writeToken(result.token);
      return result.session;
    },
    async loginWorker(credentials) {
      const result = await request(fetchImpl, "loginWorker", credentials);
      writeToken(result.token);
      return result.session;
    },
    async logout() {
      writeToken(null);
      return { ok: true };
    },
    loadSession() { return request(fetchImpl, "loadSession"); },
    loadPlayerGame() { return request(fetchImpl, "loadPlayerGame"); },
    loadBattleReplay(battleId) { return request(fetchImpl, "loadBattleReplays", { battleIds: [battleId] }).then((body) => body.replays[0]); },
    loadBattleReplays(battleIds) { return request(fetchImpl, "loadBattleReplays", { battleIds }).then((body) => body.replays); },
    loadChallengeBattles(payload) { return request(fetchImpl, "loadChallengeBattles", payload); },
    saveLineup(payload) { return request(fetchImpl, "saveLineup", payload); },
    loadWorkerGame() { return request(fetchImpl, "loadWorkerGame"); },
    loadWorkerRoundData() { return request(fetchImpl, "loadWorkerRoundData"); },
    loadWorkerTestData() { return request(fetchImpl, "loadWorkerTestData"); },
    loadWorkerTeam(teamId) { return request(fetchImpl, "loadWorkerTeam", { teamId }); },
    loadWorkerAnalysis(challengeId) { return request(fetchImpl, "loadWorkerAnalysis", { challengeId }); },
    drawRosters(payload) { return request(fetchImpl, "drawRosters", payload); },
    async saveOfficialRound(payload) {
      const battles = await Promise.all(payload.battles.map(async (battle) => ({
        battleId: battle.battleId,
        challengeId: battle.challengeId,
        teamIds: battle.teamIds,
        score: battle.score,
        replayJson: await gzipBase64(battle),
        ...(!("CompressionStream" in globalThis) ? battle : {}),
      })));
      return request(fetchImpl, "saveOfficialRound", { ...payload, battles });
    },
    updateRosterLevels(payload) { return request(fetchImpl, "updateRosterLevels", payload); },
    saveWorkerLineup(payload) { return request(fetchImpl, "saveWorkerLineup", payload); },
    autoConfigureAllLineups(payload) { return request(fetchImpl, "autoConfigureAllLineups", payload); },
    resetGame(confirmation) { return request(fetchImpl, "resetGame", { confirmation }); },
    resetTeamPassword(payload) { return request(fetchImpl, "resetTeamPassword", payload); },
  };
}
