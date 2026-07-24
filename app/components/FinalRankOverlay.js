"use client";

function formatClearedLevels(levels = []) {
  if (!levels.length) return "無";
  const ranges = [];
  let start = levels[0];
  let previous = levels[0];
  for (const level of levels.slice(1)) {
    if (level === previous + 1) {
      previous = level;
      continue;
    }
    ranges.push(start === previous ? `Lv.${start}` : `Lv.${start}～Lv.${previous}`);
    start = level;
    previous = level;
  }
  ranges.push(start === previous ? `Lv.${start}` : `Lv.${start}～Lv.${previous}`);
  return ranges.join("、");
}

function formatChallengeResults(results = []) {
  if (!results.length) return "無";
  return results
    .map((result) => `${result.label} ${result.encounterName}: ${formatClearedLevels(result.score?.clearedLevels)}`)
    .join("；");
}

export default function FinalRankOverlay({ summary, onDismiss, onRestart }) {
  if (!summary) return null;

  return (
    <div className="final-rank-backdrop" role="dialog" aria-modal="true" aria-labelledby="final-rank-title">
      <div className="final-rank-dialog">
        <div className="final-rank-header">
          <p className="final-rank-kicker">Solo 挑戰結算</p>
          <h2 id="final-rank-title" className="final-rank-title">
            總分：{summary.totalScore.toLocaleString()}
          </h2>
          <p className="final-rank-sub">分數為各 Boss 通過等級數的總和</p>
        </div>
        <div className="final-rank-body">
          <table className="final-rank-table">
            <thead>
              <tr>
                <th scope="col">回合</th>
                <th scope="col">Boss</th>
                <th scope="col">通過等級</th>
                <th scope="col">分數</th>
              </tr>
            </thead>
            <tbody>
              {summary.roundResults.map((result) => (
                <tr key={`solo-result-${result.round}`}>
                  <td>{result.round}</td>
                  <td>{result.encounterName}</td>
                  <td>{formatChallengeResults(result.score.challengeResults)}</td>
                  <td>{result.score.total.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="final-rank-footer">
          {onRestart ? (
            <button type="button" className="final-rank-dismiss final-rank-dismiss--primary" onClick={onRestart}>
              重新開始
            </button>
          ) : null}
          <button type="button" className="final-rank-dismiss" onClick={onDismiss}>知道了</button>
        </div>
      </div>
    </div>
  );
}
