import { afterEach, describe, expect, it } from "vitest";
import { createMultiplayerApi } from "../../features/multiplayer/multiplayerApi";

function response(data) {
  return Promise.resolve({ ok: true, status: 200, json: async () => ({ ok: true, data }) });
}

describe("Apps Script multiplayer API client", () => {
  afterEach(() => {
    delete global.window;
    delete process.env.NEXT_PUBLIC_APPS_SCRIPT_URL;
  });

  it("登入後只在 sessionStorage 保存 token，後續 action 會帶上 token", async () => {
    process.env.NEXT_PUBLIC_APPS_SCRIPT_URL = "https://script.google.com/macros/s/test/exec";
    const values = new Map();
    global.window = {
      sessionStorage: {
        getItem: (key) => values.get(key) ?? null,
        setItem: (key, value) => values.set(key, value),
        removeItem: (key) => values.delete(key),
      },
    };
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body), options });
      if (requests.length === 1) return response({ token: "signed-token", session: { authenticated: true, role: "team", teamId: "1" } });
      return response({ authenticated: true, role: "team", teamId: "1" });
    };
    const api = createMultiplayerApi(fetchImpl);

    await api.loginTeam({ teamId: "1", password: "secret" });
    await api.loadSession();

    expect(requests[0].url).toBe(process.env.NEXT_PUBLIC_APPS_SCRIPT_URL);
    expect(requests[0].body).toMatchObject({ action: "loginTeam", token: null });
    expect(requests[0].options.headers["Content-Type"]).toBe("text/plain;charset=utf-8");
    expect(requests[1].body).toMatchObject({ action: "loadSession", token: "signed-token" });
  });

  it("多人模式批次儲存陣容時會送出 savePlayerLineups", async () => {
    process.env.NEXT_PUBLIC_APPS_SCRIPT_URL = "https://script.google.com/macros/s/test/exec";
    global.window = {
      sessionStorage: {
        getItem: () => "signed-token",
        setItem: () => {},
        removeItem: () => {},
      },
    };
    const requests = [];
    const fetchImpl = async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return response({ ok: true, updatedChallenges: 2 });
    };
    const api = createMultiplayerApi(fetchImpl);

    await api.savePlayerLineups({
      round: 5,
      lineupUpdates: [
        { challengeId: "5-1-single", lineup: ["秦始皇", "", "", "", ""], version: 2 },
        { challengeId: "5-2-duo", lineup: ["爆李龍", "", ""], version: 3 },
      ],
    });

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe(process.env.NEXT_PUBLIC_APPS_SCRIPT_URL);
    expect(requests[0].body).toEqual({
      action: "savePlayerLineups",
      token: "signed-token",
      payload: {
        round: 5,
        lineupUpdates: [
          { challengeId: "5-1-single", lineup: ["秦始皇", "", "", "", ""], version: 2 },
          { challengeId: "5-2-duo", lineup: ["爆李龍", "", ""], version: 3 },
        ],
      },
    });
  });
});
