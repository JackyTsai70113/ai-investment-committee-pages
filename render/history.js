export function createHistoryRenderer({
  agentLink,
  dateTime,
  decisionLabel,
  escapeHtml,
  glossaryText,
  money,
  percent,
  renderList,
}) {
  return (record) => {
    const archivedCommittee = record.committee;
    const archivedRecommendation = record.recommendation;
    const review = record.decision_review;
    const timestamp =
      record.generated_at ||
      review?.generated_at ||
      archivedCommittee?.generated_at ||
      archivedRecommendation?.generated_at;

    return `
      <details class="archive-card" data-history-id="${escapeHtml(record.archive_id)}">
        <summary>
          <span>
            <strong>${escapeHtml(record.archive_id)}</strong>
            <small>${escapeHtml(dateTime(timestamp))}</small>
          </span>
          <span class="archive-types">
            ${record.status ? escapeHtml(record.status) : ""}
            ${review ? "績效驗證" : ""}
            ${archivedCommittee ? "委員會討論" : ""}
            ${archivedRecommendation ? "決策配置" : ""}
          </span>
        </summary>
        <div class="archive-body">${record.allocation_summary ? `
          <p class="methodology-note">${escapeHtml(record.reason_title_digest || "公開歷史紀錄")}<br />展開後載入完整公開紀錄。</p>` : ""}
          ${
            review
              ? `
                <section class="archive-review">
                  <div class="archive-review-metrics">
                    <span>起始 <strong>${money(review.starting_value_usd)}</strong></span>
                    <span>期末 <strong>${money(review.ending_value_usd)}</strong></span>
                    <span>損益 <strong>${escapeHtml(review.profit_loss_usd)} USD</strong></span>
                    <span>報酬 <strong>${escapeHtml(review.return_percent)}%</strong></span>
                  </div>
                  <p>${escapeHtml(review.assessment?.summary)}</p>
                  <div class="committee-columns">
                    <section class="committee-block">
                      <h3>支持原決策的證據</h3>
                      <ul>${renderList(review.assessment?.supported_points, "未提供", glossaryText)}</ul>
                    </section>
                    <section class="committee-block">
                      <h3>挑戰原決策的證據</h3>
                      <ul>${renderList(review.assessment?.challenged_points, "未提供", glossaryText)}</ul>
                    </section>
                    <section class="committee-block">
                      <h3>公開方法與限制</h3>
                      <ul>${renderList(review.methodology?.warnings, "未提供", glossaryText)}</ul>
                    </section>
                  </div>
                </section>`
              : ""
          }
          ${
            archivedRecommendation
              ? `
                <section class="archive-allocation">
                  <h3>當時最終配置</h3>
                  <div class="final-allocation-grid">
                    ${archivedRecommendation.allocations
                      .map(
                        (item) => `
                          <article class="final-allocation">
                            <strong>${escapeHtml(item.symbol)}</strong>
                            <span>${money(item.target_amount_usd)} · ${percent(item.target_weight)}</span>
                            <small>${escapeHtml(item.note)}</small>
                          </article>`,
                      )
                      .join("")}
                  </div>
                </section>`
              : ""
          }
          ${
            archivedCommittee
              ? `
                <section class="archive-discussion">
                  <h3>完整結構化討論</h3>
                  ${archivedCommittee.proposals
                    .map(
                      (proposal) => `
                        <article class="archive-agent">
                          <header>
                            ${agentLink(proposal.agent)}
                            <span>${escapeHtml(proposal.stance)} · ${escapeHtml(proposal.confidence)}/100</span>
                          </header>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>論點</h3>
                              <ol>${renderList(proposal.arguments, "未提供", glossaryText)}</ol>
                            </section>
                            <section class="committee-block">
                              <h3>風險</h3>
                              <ul>${renderList(proposal.risks, "未提供", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>失效條件</h3>
                              <ul>${renderList(proposal.invalidation_conditions, "未提供", glossaryText)}</ul>
                            </section>
                          </div>
                        </article>`,
                    )
                    .join("")}
                  ${archivedCommittee.critiques
                    .map(
                      (critique) => `
                        <article class="archive-agent critique">
                          <header>
                            ${agentLink(critique.reviewer)}
                            <span>${critique.veto_recommended ? "建議否決" : "不否決"}</span>
                          </header>
                          <p>${escapeHtml(critique.strongest_objection)}</p>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>隱含假設</h3>
                              <ul>${renderList(critique.hidden_assumptions, "未提供", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>要求修正</h3>
                              <ul>${renderList(critique.required_changes, "未提供", glossaryText)}</ul>
                            </section>
                          </div>
                        </article>`,
                    )
                    .join("")}
                  ${(archivedCommittee.cross_examination_responses || [])
                    .map(
                      (response) => `
                        <article class="archive-agent response">
                          <header>
                            ${agentLink(response.responding_agent)}
                            <span>回應 ${agentLink(response.reviewer)} · ${escapeHtml(
                              decisionLabel(response.tone),
                            )}</span>
                          </header>
                          <p><strong>問題：</strong>${escapeHtml(response.question)}</p>
                          <p>${escapeHtml(response.direct_answer)}</p>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>使用證據</h3>
                              <ul>${renderList(response.evidence_used, "未提供", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>承認的盲點</h3>
                              <ul>${renderList(response.conceded_points, "沒有承認新的盲點")}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>提出修正</h3>
                              <ul>${renderList(response.proposed_changes, "未提供", glossaryText)}</ul>
                            </section>
                          </div>
                        </article>`,
                    )
                    .join("")}
                  ${(archivedCommittee.critique_resolutions || [])
                    .map(
                      (resolution) => `
                        <article class="archive-agent critique">
                          <header>
                            ${agentLink(resolution.reviewer)}
                            <span>${resolution.veto_maintained ? "維持否決" : "接受修正"}</span>
                          </header>
                          <p>${escapeHtml(resolution.resolution_summary)}</p>
                          <div class="committee-columns">
                            <section class="committee-block">
                              <h3>採納修正</h3>
                              <ul>${renderList(resolution.accepted_changes, "未提供", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>尚未消除的疑慮</h3>
                              <ul>${renderList(resolution.unresolved_objections, "沒有未解疑慮", glossaryText)}</ul>
                            </section>
                            <section class="committee-block">
                              <h3>硬性限制</h3>
                              <ul>${renderList(
                                resolution.binding_constraints,
                                "沒有未解除的硬性限制",
                              )}</ul>
                            </section>
                          </div>
                        </article>`,
                    )
                    .join("")}
                </section>`
              : ""
          }
        </div>
      </details>`;
  };
}
