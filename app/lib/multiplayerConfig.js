import { DUO_CONTRIBUTION_SIZE, TEAM_SIZE } from "./gameConfig";

/** 多人正式賽的固定規格；資料來源與登入方式由後續 API 層提供。 */
export const MULTIPLAYER_SINGLE_LINEUP_SIZE = TEAM_SIZE;
export const MULTIPLAYER_DUO_CONTRIBUTION_SIZE = DUO_CONTRIBUTION_SIZE;
export const MULTIPLAYER_DUO_LINEUP_SIZE = MULTIPLAYER_DUO_CONTRIBUTION_SIZE * 2;

/**
 * 所有編隊陣列都使用「後排 → 前排」的順序。
 * 雙人關中，排名較低隊伍提供後排，排名較高隊伍提供前排。
 */
export const LINEUP_ORDER = "back-to-front";
