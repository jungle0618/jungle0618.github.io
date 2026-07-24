const nameOf = (pet, fallback = "角色") => pet?.name ?? pet?.ownerName ?? fallback;

function signed(value) {
  const n = Number(value) || 0;
  return `${n >= 0 ? "+" : ""}${n}`;
}

export function describeBattleEvent(event) {
  if (!event) return null;
  const source = nameOf(event.source, "效果");
  const target = nameOf(event.target, source);
  const damage = event.damageApplied ?? event.effectiveDamageToHp;

  if (event.type === "dodge") return `${target} 閃避了 ${nameOf(event.attacker, "對手")} 的攻擊！`;
  if (event.type === "damage_redirect") return `${source} 挺身替 ${target} 承受傷害。`;
  if (event.type === "mount_dodge") return `${target} 騎上隼，獲得閃避。`;
  if (event.type === "round_front_summon") return `${source} 在前方召喚了 ${target}！`;
  if (event.type === "death_split") {
    return `${source} 分裂成兩個 ${target}（第 ${event.splitGeneration ?? 1} 代）！`;
  }
  if (typeof damage === "number" && event.target) {
    const defeated = (event.targetHpAfter ?? 1) <= 0 ? `，${target} 被擊倒了！` : "。";
    const armorNote = (event.damageReduced ?? 0) > 0 ? `（護甲減免 ${event.damageReduced}）` : "";
    return `${source} 對 ${target} 造成 ${Math.max(0, damage)} 點傷害${armorNote}${defeated}`;
  }
  if (typeof event.heal === "number" && event.heal !== 0) return `${source} 使 ${target} 回復 ${event.heal} 點生命。`;

  const changes = [];
  if (typeof event.atkDelta === "number" && event.atkDelta !== 0) changes.push(`攻擊 ${signed(event.atkDelta)}`);
  if (typeof event.hpDelta === "number" && event.hpDelta !== 0) changes.push(`生命 ${signed(event.hpDelta)}`);
  if (typeof event.armorDelta === "number" && event.armorDelta !== 0) changes.push(`護甲 ${signed(event.armorDelta)}`);
  if (changes.length) return `${source} 使 ${target} 的${changes.join("、")}。`;

  if (event.type?.endsWith("_trigger") || ["opening_missile", "death_front_percent", "death_effect_count_aoe"].includes(event.type)) {
    return `${source} 發動了效果，目標是 ${target}。`;
  }
  return null;
}

export function describeBattleSlot(slot) {
  const events = Array.isArray(slot?.events) ? slot.events : slot?.ev ? [slot.ev] : [];
  const messages = events.map(describeBattleEvent).filter(Boolean);
  return [...new Set(messages)];
}
