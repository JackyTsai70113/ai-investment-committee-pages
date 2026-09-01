export function createCommitteeRenderer({
  agentLink,
  agentProfiles,
  dateTime,
  decisionLabel,
  escapeHtml,
  glossaryText,
  normalizeAgentName,
  percent,
  renderAssetTags,
  renderList,
  symbolLink,
}) {
  const renderCommitteeChat = (committee, recommendation) => {
    const proposals = Array.isArray(committee.proposals) ? committee.proposals : [];
    const critiques = Array.isArray(committee.critiques) ? committee.critiques : [];
    const crossExaminationResponses = Array.isArray(committee.cross_examination_responses)
      ? committee.cross_examination_responses
      : [];
    const responses = Array.isArray(committee.reconciliation_responses)
      ? committee.reconciliation_responses
      : [];
    const resolutions = Array.isArray(committee.critique_resolutions)
      ? committee.critique_resolutions
      : [];

    const proposalMessages = proposals
      .map(
        (proposal) => `
          <article class="chat-message">
            <div class="chat-avatar" aria-hidden="true">${escapeHtml(
              (agentProfiles[normalizeAgentName(proposal.agent)]?.title || proposal.agent).slice(0, 1),
            )}</div>
            <div class="chat-bubble">
              <header>
                <strong>${agentLink(proposal.agent)}</strong>
                <span>第一輪獨立提案</span>
              </header>
              <div class="chat-meta">
                <span>立場：${escapeHtml(decisionLabel(proposal.stance))}</span>
                <span>信心：${escapeHtml(proposal.confidence)}/100</span>
                <span>現金偏好：${percent(proposal.cash_preference)}</span>
                ${
                  proposal.tone
                    ? `<span>語氣：${escapeHtml(decisionLabel(proposal.tone))}</span>`
                    : ""
                }
              </div>
              <p class="chat-opening">${escapeHtml(
                proposal.opening_statement || (proposal.arguments || [])[0] || "本輪沒有可公開摘要。",
              )}</p>
              <div class="asset-tags">${renderAssetTags(proposal.preferred_assets)}</div>
              <details class="chat-details">
                <summary>查看完整論點、風險與失效條件</summary>
                <strong>完整論點</strong>
                <ol>${renderList(proposal.arguments, "未提供", glossaryText)}</ol>
                <strong>主要風險</strong>
                <ul>${renderList(proposal.risks, "未提供", glossaryText)}</ul>
                <strong>失效條件</strong>
                <ul>${renderList(proposal.invalidation_conditions, "未提供", glossaryText)}</ul>
              </details>
            </div>
          </article>`,
      )
      .join("");

    const critiqueThreads = critiques
      .map((critique) => {
        const questions = Array.isArray(critique.direct_questions)
          ? critique.direct_questions
          : [];
        const resolution = resolutions.find((item) => item.reviewer === critique.reviewer);
        const opening = critique.opening_statement || critique.strongest_objection;
        const questionThreads = questions
          .map((question) => {
            const answer = crossExaminationResponses.find(
              (item) =>
                item.reviewer === critique.reviewer &&
                item.responding_agent === question.target_agent &&
                item.question === question.question,
            );
            return `
              <article class="chat-message reviewer-message question-message">
                <div class="chat-avatar" aria-hidden="true">問</div>
                <div class="chat-bubble">
                  <header>
                    <strong>${agentLink(critique.reviewer)}</strong>
                    <span>點名 ${agentLink(question.target_agent)}</span>
                  </header>
                  <p class="chat-opening">${escapeHtml(question.question)}</p>
                  <small class="chat-why">${escapeHtml(question.why_it_matters)}</small>
                </div>
              </article>
              ${
                answer
                  ? `
                    <article class="chat-message answer-message">
                      <div class="chat-avatar" aria-hidden="true">${escapeHtml(
                        (
                          agentProfiles[normalizeAgentName(answer.responding_agent)]?.title ||
                          answer.responding_agent
                        ).slice(0, 1),
                      )}</div>
                      <div class="chat-bubble">
                        <header>
                          <strong>${agentLink(answer.responding_agent)}</strong>
                          <span>直接回應 ${agentLink(answer.reviewer)}</span>
                        </header>
                        <div class="chat-meta">
                          <span>語氣：${escapeHtml(decisionLabel(answer.tone))}</span>
                        </div>
                        <p class="chat-opening">${escapeHtml(answer.direct_answer)}</p>
                        <details class="chat-details">
                          <summary>查看證據、承認與修正</summary>
                          <strong>使用證據</strong>
                          <ul>${renderList(answer.evidence_used, "無使用證據", glossaryText)}</ul>
                          <strong>承認的盲點</strong>
                          <ul>${renderList(answer.conceded_points, "沒有承認新的盲點", glossaryText)}</ul>
                          <strong>提出修正</strong>
                          <ul>${renderList(answer.proposed_changes, "未提供", glossaryText)}</ul>
                          ${
                            answer.unresolved_disagreement
                              ? `<strong>仍有分歧</strong><p>${escapeHtml(
                                  answer.unresolved_disagreement,
                                )}</p>`
                              : ""
                          }
                        </details>
                      </div>
                    </article>`
                  : ""
              }`;
          })
          .join("");
        const resolutionMessage = resolution
          ? `
            <article class="chat-message reviewer-message resolution-message">
              <div class="chat-avatar" aria-hidden="true">裁</div>
              <div class="chat-bubble">
                <header>
                  <strong>${agentLink(resolution.reviewer)}</strong>
                  <span>第二次裁決</span>
                </header>
                ${
                  resolution.tone
                    ? `<div class="chat-meta"><span>語氣：${escapeHtml(
                        decisionLabel(resolution.tone),
                      )}</span></div>`
                    : ""
                }
                <p class="chat-opening">${escapeHtml(resolution.resolution_summary)}</p>
                <div class="chat-status ${resolution.veto_maintained ? "veto" : ""}">
                  ${resolution.veto_maintained ? "維持否決" : "接受修正"}
                </div>
                <details class="chat-details">
                  <summary>查看採納、分歧與硬性限制</summary>
                  <strong>採納修正</strong>
                  <ul>${renderList(resolution.accepted_changes, "未提供", glossaryText)}</ul>
                  <strong>尚未消除的疑慮</strong>
                  <ul>${renderList(resolution.unresolved_objections, "沒有未解疑慮", glossaryText)}</ul>
                  <strong>交給 CIO 的硬性限制</strong>
                  <ul>${renderList(resolution.binding_constraints, "沒有未解除的硬性限制", glossaryText)}</ul>
                </details>
              </div>
            </article>`
          : "";
        return `
          <article class="chat-message reviewer-message">
            <div class="chat-avatar" aria-hidden="true">審</div>
            <div class="chat-bubble">
              <header>
                <strong>${agentLink(critique.reviewer)}</strong>
                <span>交叉質詢</span>
              </header>
              ${
                critique.tone
                  ? `<div class="chat-meta"><span>語氣：${escapeHtml(
                      decisionLabel(critique.tone),
                    )}</span></div>`
                  : ""
              }
              <p class="chat-opening">${escapeHtml(opening)}</p>
              <div class="chat-status ${critique.veto_recommended ? "veto" : ""}">
                ${critique.veto_recommended ? "建議否決" : "本輪不否決"}
              </div>
              <details class="chat-details">
                <summary>查看最強反對、隱含假設與要求修正</summary>
                <strong>最強反對意見</strong>
                <p>${escapeHtml(critique.strongest_objection)}</p>
                <strong>隱含假設</strong>
                <ul>${renderList(critique.hidden_assumptions, "未提供", glossaryText)}</ul>
                <strong>要求修正</strong>
                <ul>${renderList(critique.required_changes, "未提供", glossaryText)}</ul>
              </details>
            </div>
          </article>
          ${questionThreads}
          ${resolutionMessage}`;
      })
      .join("");

    const reconciliationMessages = responses
      .map((response, index) => {
        const resolution = resolutions[index];
        return `
          <article class="chat-message reviewer-message">
            <div class="chat-avatar" aria-hidden="true">議</div>
            <div class="chat-bubble">
              <header>
                <strong>${agentLink(response.reviewer)}</strong>
                <span>協商與第二次裁決</span>
              </header>
              <strong>提案者承認與修正</strong>
              <ul>${renderList(response.conceded_points, "未提供", glossaryText)}</ul>
              <ul>${renderList(response.proposed_changes, "未提供", glossaryText)}</ul>
              <strong>證據式反駁</strong>
              <ul>${renderList(response.rebuttals, "未提供", glossaryText)}</ul>
              <p>${escapeHtml(resolution?.resolution_summary || "尚無第二次裁決")}</p>
            </div>
          </article>`;
      })
      .join("");

    const finalDecision = committee.final_decision;
    return `
      <section class="committee-chat" aria-label="投資委員會群組對話">
        <header class="chat-room-header">
          <div>
            <span class="live-dot" aria-hidden="true"></span>
            <strong>投資委員會群組</strong>
          </div>
          <span>研究編號 ${escapeHtml(committee.run_id)}</span>
        </header>
        <article class="chat-message system-message">
          <div class="chat-bubble">
            <strong>系統訊息</strong>
            <p>
              資料已封存至 ${escapeHtml(dateTime(recommendation.data_cutoff))}。
              以下內容是各角色公開提交的結構化摘要、批判與裁決，不包含隱藏思考鏈。
            </p>
          </div>
        </article>
        <div class="chat-stage-label">第一階段 · 獨立研究</div>
        ${proposalMessages}
        <div class="chat-stage-label">第二階段 · 質詢、回應與裁決</div>
        ${critiqueThreads}
        ${
          reconciliationMessages
            ? `<div class="chat-stage-label">第三階段 · 協商修正</div>${reconciliationMessages}`
            : ""
        }
        <div class="chat-stage-label">最終階段 · 整合裁決</div>
        <article class="chat-message cio-message">
          <div class="chat-avatar" aria-hidden="true">決</div>
          <div class="chat-bubble">
            <header>
              <strong>${agentLink("cio")}</strong>
              <span>最終決策</span>
            </header>
            <div class="chat-meta">
              <span>市場立場：${escapeHtml(decisionLabel(finalDecision.market_stance))}</span>
              <span>風險：${escapeHtml(decisionLabel(finalDecision.risk_level))}</span>
              <span>共識度：${escapeHtml(finalDecision.model_score)}/100</span>
              ${
                finalDecision.tone
                  ? `<span>語氣：${escapeHtml(decisionLabel(finalDecision.tone))}</span>`
                  : ""
              }
            </div>
            <p class="chat-opening">${escapeHtml(
              finalDecision.opening_statement || finalDecision.model_score_reason,
            )}</p>
            <details class="chat-details">
              <summary>查看共識度計算</summary>
              <p>${escapeHtml(finalDecision.model_score_reason)}</p>
            </details>
            <div class="final-allocation-grid">
              ${(finalDecision.allocations || [])
                .map(
                  (item) => `
                    <article class="final-allocation">
                      ${symbolLink(item.symbol)}
                      <span>${percent(item.target_weight)}</span>
                      <small>${escapeHtml(item.note)}</small>
                    </article>`,
                )
                .join("")}
            </div>
          </div>
        </article>
      </section>`;
  };
  return renderCommitteeChat;
}
