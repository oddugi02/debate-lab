/**
 * Debate Platform - Logic
 */

const CHARACTERS = [
  "키티", "도비", "스누피", "코난", "케로로", "짱구", "라이언", "제리", 
  "뽀로로", "펭수", "피카츄", "스폰지밥", "미키마우스", "푸우", "짱아",
  "루피", "포비", "둘리", "마리오", "요시", "커비", "토토로", "가오나시", "도라에몽", "춘식이"
];

function getCharacterName(nickname) {
  if (!nickname) return CHARACTERS[0];
  let hash = 0;
  for (let i = 0; i < nickname.length; i++) {
    hash = nickname.charCodeAt(i) + ((hash << 5) - hash);
  }
  hash = Math.abs(hash);
  return CHARACTERS[hash % CHARACTERS.length];
}

// State
let myInfo = null;
let isReadonly = true;

// Payloads
let allOpinions = [];
let allRebuttals = [];
let allPersuadedEvents = [];

// For the UI rendering
let threadedCards = []; // roots
let proIndex = 0;
let conIndex = 0;

// Modal target state
let currentTargetId = null; 
let currentTargetAuthorNickname = null;
let _currentTargetSelectedText = "";
let _currentTargetReasonIndex = -1;
let _selectedReasonIndices = []; // Multi-select state for persuaded modal
let _selectedKeyword = null; // Single select keyword state

// Initialization
window.DebateCore.onReady(function (info) {
  myInfo = info;

  if (!info.nickname) {
    showMessage("토론 플랫폼을 통해 다시 접속하세요.");
    return;
  }

  if (info.status === "pending") {
    showMessage("토론이 아직 시작되지 않았습니다.");
    return;
  }

  isReadonly = info.status !== "active" || info.role !== "participant";

  document.getElementById("app").style.display = "block";
  document.getElementById("debate-title").textContent = info.title || "(제목 없음)";
  
  // Set Nickname mapping
  const myCharName = getCharacterName(info.nickname);
  document.getElementById("nickname").textContent = myCharName;
  
  var sideBadge = document.getElementById("side-badge");
  sideBadge.textContent = info.side === "pro" ? "(찬성)" : "(반대)";
  sideBadge.className = "side-badge " + info.side;

  if (!isReadonly) {
    document.getElementById("open-modal-btn").style.display = "block";
    document.getElementById("leaderboard-btn").style.display = "block";
  }

  // Initial Data Load
  loadAllData();

  // Bind Nav Buttons
  document.getElementById("pro-prev-btn").addEventListener("click", () => movePro(-1));
  document.getElementById("pro-next-btn").addEventListener("click", () => movePro(1));
  document.getElementById("con-prev-btn").addEventListener("click", () => moveCon(-1));
  document.getElementById("con-next-btn").addEventListener("click", () => moveCon(1));
});

function movePro(dir) {
  const pros = allOpinions.filter(op => op.side === "pro");
  proIndex = Math.max(0, Math.min(pros.length - 1, proIndex + dir));
  renderStream();
}

function moveCon(dir) {
  const cons = allOpinions.filter(op => op.side === "con");
  conIndex = Math.max(0, Math.min(cons.length - 1, conIndex + dir));
  renderStream();
}

function showMessage(text) {
  document.getElementById("message").textContent = text;
  document.getElementById("message").style.display = "flex";
  document.getElementById("app").style.display = "none";
}

/* ── Data Fetching & Processing ── */

function loadAllData() {
  myInfo.loadPayloads().then(function (payloads) {
    allOpinions = [];
    allRebuttals = [];
    allPersuadedEvents = [];
    coinsMap = {};

    Object.keys(payloads).forEach(function (nickname) {
      var payload = payloads[nickname];
      if (!payload) return;
      
      const charName = getCharacterName(nickname);

      if (payload.opinions) {
        payload.opinions.forEach(op => {
          allOpinions.push({ 
            ...op,
            id: op.id || "op-dummy-" + op.timestamp,
            coreClaim: op.coreClaim || op.text || "(내용 없음)",
            realNickname: nickname, 
            nickname: charName, 
            side: op.side || "pro",
            reasons: op.reasons || [
              { title: "현실적인 실행 가능성 문제", description: "현재 제안된 주장은 이상적이지만, 제한된 시간과 자원을 고려했을 때 당장 실현하기에는 여러 제약이 존재합니다." },
              { title: "구체적인 기준 부족", description: "객관적인 검증 절차나 명확한 가이드라인이 부족하여 사람마다 다르게 해석할 여지가 충분히 있습니다." }
            ]
          });
        });
      }
      if (payload.rebuttals) {
        payload.rebuttals.forEach(reb => {
          allRebuttals.push({ 
            ...reb,
            id: reb.id || "reb-dummy-" + reb.timestamp,
            coreClaim: reb.coreClaim || reb.text || "(내용 없음)",
            realNickname: nickname, 
            nickname: charName, 
            side: reb.side || "pro",
            reasons: reb.reasons || [
              { title: "다른 시각에서 본 한계점", description: "말씀하신 부분도 어느 정도 일리가 있지만, 장기적인 관점에서 접근하면 예상치 못한 부작용이 발생할 수 있습니다." }
            ]
          });
        });
      }
      if (payload.persuadedEvents) {
        payload.persuadedEvents.forEach(ev => {
          allPersuadedEvents.push({ 
            realNickname: nickname, 
            nickname: charName, 
            ...ev 
          });
        });
      }
    });

    // -- Dynamic Dummy Rebuttal against User's Opinion --
    if (myInfo && myInfo.nickname) {
      const myOpinions = allOpinions.filter(op => op.realNickname === myInfo.nickname);
      if (myOpinions.length > 0) {
        const myFirstOp = myOpinions[myOpinions.length - 1]; // Oldest
        const alreadyHasDummyReb = allRebuttals.some(reb => reb.id === "reb-dynamic-opponent-1");
        
        if (!alreadyHasDummyReb) {
          const opponentSide = myInfo.side === "pro" ? "con" : "pro";
          const _selText = myFirstOp.reasons && myFirstOp.reasons.length > 0 
              ? myFirstOp.reasons[0].description 
              : "(사용자님의 근거 전체 내용)";
              
          allRebuttals.push({
            id: "reb-dynamic-opponent-1",
            targetId: myFirstOp.id,
            targetReasonIndex: 0,
            targetAuthorNickname: myInfo.nickname,
            selectedText: _selText,
            side: opponentSide,
            coreClaim: "반대 입장에서 봤을 때, 그 의견은 일리가 있지만 치명적인 한계가 뚜렷합니다.",
            reasons: [
              { title: "예상치 못한 부작용", description: "실제 적용 시에는 긍정적 측면보다 현장에서 겪는 마찰과 부작용의 빈도가 훨씬 높습니다. 보수적인 접근이 필요합니다." }
            ],
            realNickname: "dummy_opponent_123",
            nickname: "냉철한 셜록",
            timestamp: myFirstOp.timestamp + 10000
          });
        }
      }
    }
    // ----------------------------------------------------

    calculateCoins();
    buildThreads();
    renderStream();
  });
}

let coinsMap = {};

function calculateCoins() {
  coinsMap = {};
  
  allPersuadedEvents.forEach(ev => {
    // Reward the persuader (targetAuthorNickname)
    const persuader = ev.targetAuthorNickname;
    if (persuader) {
      coinsMap[persuader] = (coinsMap[persuader] || 0) + 100;
    }
    
    // Reward the persuaded person (realNickname)
    const persuaded = ev.realNickname;
    if (persuaded) {
      coinsMap[persuaded] = (coinsMap[persuaded] || 0) + 50;
    }
  });

  // Update My Coins in UI
  if (myInfo && myInfo.nickname) {
    const myCoins = coinsMap[myInfo.nickname] || 0;
    const coinDisplay = document.getElementById("coin-display");
    const myCoinsEl = document.getElementById("my-coins");
    
    if (coinDisplay && myCoinsEl) {
      coinDisplay.style.display = "flex";
      myCoinsEl.textContent = myCoins.toLocaleString();
    }
  }

  // Also update leaderboard modal content
  renderLeaderboard();
}

window.rebuttalsByTarget = {};

function buildThreads() {
  window.rebuttalsByTarget = {};
  
  allOpinions.sort((a,b) => b.timestamp - a.timestamp);
  allRebuttals.sort((a,b) => a.timestamp - b.timestamp);

  allRebuttals.forEach(reb => {
    if (!window.rebuttalsByTarget[reb.targetId]) {
      window.rebuttalsByTarget[reb.targetId] = [];
    }
    window.rebuttalsByTarget[reb.targetId].push(reb);
  });
}

/* ── DOM Rendering ── */

function escapeHtml(text) {
  var div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function getOrdinalText(index) {
  return "의견 " + (index + 1);
}

function renderLeaderboard() {
  const container = document.getElementById("leaderboard-container");
  if (!container) return;

  // Convert coinsMap to sorted array
  const sortedEntries = Object.entries(coinsMap)
    .sort((a, b) => b[1] - a[1]);

  if (sortedEntries.length === 0) {
    container.innerHTML = '<p class="empty-text">아직 보상을 받은 사람이 없습니다.</p>';
    return;
  }

  container.innerHTML = sortedEntries.map(([realName, coins], idx) => {
    const charName = getCharacterName(realName);
    const isMe = myInfo && realName === myInfo.nickname;
    return `
      <div class="rank-item ${isMe ? 'is-me' : ''}">
        <div class="rank-number">${idx + 1}</div>
        <div class="rank-nickname">${escapeHtml(charName)} ${isMe ? '(나)' : ''}</div>
        <div class="rank-coins">${coins.toLocaleString()}</div>
      </div>
    `;
  }).join("");
}

function renderCardInner(item, type, index) {
  const isMine = myInfo && item.realNickname === myInfo.nickname;
  const cardPersuadedEvents = allPersuadedEvents.filter(ev => ev.targetId === item.id);

  let html = `
    <div class="card-inner ${type === 'rebuttal' ? 'inner-rebuttal' : 'inner-opinion'}" id="${item.id}">
      <div class="card-header">
        <div class="card-author">
          <span class="author-name">${escapeHtml(item.nickname)}</span>
          ${cardPersuadedEvents.length > 0 ? `<span class="reward-badge">+${cardPersuadedEvents.length * 100}</span>` : ""}
        </div>
        ${index !== undefined ? `<div class="card-index-label">${getOrdinalText(index)}</div>` : ""}
      </div>
  `;

    if (type === "rebuttal") {
      html += `
        <div class="rebuttal-target-quote">
          “${escapeHtml(item.selectedText)}”
        </div>
      `;
    }

  html += `
      <div class="card-body">
        <p class="core-claim">${escapeHtml(item.coreClaim)}</p>
        ${item.rebuttalContent ? `<p class="rebuttal-detailed-content">${escapeHtml(item.rebuttalContent)}</p>` : ""}
        <div class="reasons-list">
  `;

  if (item.reasons && item.reasons.length > 0) {
    const childrenRebuttals = window.rebuttalsByTarget[item.id] || [];
    
    item.reasons.forEach((r, idx) => {
      html += `
        <div class="reason-item">
          <div class="reason-number-label-view">근거 ${idx + 1}</div>
          <h4 class="reason-title">${escapeHtml(r.title)}</h4>
          <p class="reason-desc">${escapeHtml(r.description)}</p>
      `;

      // Render recursive rebuttals that target this specific reason
      const reasonRebuttals = childrenRebuttals.filter(reb => {
        const tIndex = (reb.targetReasonIndex !== undefined) ? reb.targetReasonIndex : 0;
        return tIndex === idx;
      });

      if (reasonRebuttals.length > 0) {
        html += `<div class="reason-thread-replies">`;
        reasonRebuttals.forEach(reb => {
          html += renderCardInner(reb, "rebuttal");
        });
        html += `</div>`;
      }

      html += `
        </div>
      `;
    });
  }

  html += `
        </div>
  `;

  if (cardPersuadedEvents.length > 0) {
    const persuadedSide = item.side === "pro" ? "con" : "pro"; 
    const recordClass = persuadedSide === "pro" ? "persuaded-records-pro" : "persuaded-records-con";
    
    html += `
        <div class="card-persuaded-records ${recordClass}">
          <div class="persuaded-records-title">이렇게 설득되었어요!</div>
          <div class="persuaded-list">
    `;
    cardPersuadedEvents.forEach(ev => {
      let displayContent = "";
      
      const hasIndices = ev.targetReasonIndices && ev.targetReasonIndices.length > 0;
      const hasTitles = ev.selectedReasonTitles && ev.selectedReasonTitles.length > 0;

      if (hasIndices) {
        const labels = ev.targetReasonIndices.map(i => `근거 ${i + 1}`).join(", ");
        const titlePart = hasTitles ? ` (${ev.selectedReasonTitles.join(", ")})` : "";
        displayContent = `<div class="persuaded-multi-reasons">설득 포인트: ${labels}${titlePart}</div>`;
      } else if (hasTitles) {
        displayContent = `<div class="persuaded-multi-reasons">설득된 근거: ${ev.selectedReasonTitles.join(", ")}</div>`;
      } else if (ev.selectedText) {
        displayContent = `<div class="persuaded-quote">“${escapeHtml(ev.selectedText)}”</div>`;
      }

      html += `
            <div class="persuaded-item">
              ${displayContent}
              <div class="persuaded-meta">
                <strong>${escapeHtml(ev.nickname)}</strong>
                <span class="persuaded-reward-point">+50</span>
                ${ev.selectedKeyword ? `<span class="persuaded-keyword-tag">${escapeHtml(ev.selectedKeyword)}</span>` : ""}
              </div>
              <div class="persuaded-reason-text">
                ${escapeHtml(ev.reason)}
              </div>
            </div>
      `;
    });
    html += `
          </div>
        </div>
    `;
  }

  const isSameSide = myInfo && item.side === myInfo.side;
  const hideActions = isMine || isSameSide;

  if (!hideActions) {
    html += `
      <div class="card-actions">
        <button class="action-btn" onclick="openRebuttalModal('${item.id}', '${item.realNickname}')">설득하기</button>
        <button class="action-btn" onclick="openPersuadedModal('${item.id}', '${item.realNickname}')">설득됐어요</button>
      </div>
    `;
  }

  html += `</div>`;
  return html;
}

function renderStream() {
  const proListContainer = document.getElementById("pro-opinions-list");
  const conListContainer = document.getElementById("con-opinions-list");
  const proCountBadge = document.getElementById("pro-count");
  const conCountBadge = document.getElementById("con-count");
  const proSlider = document.getElementById("pro-slider-controls");
  const conSlider = document.getElementById("con-slider-controls");

  const pros = allOpinions.filter(op => op.side === "pro");
  const cons = allOpinions.filter(op => op.side === "con");

  proCountBadge.textContent = pros.length;
  conCountBadge.textContent = cons.length;

  proSlider.style.display = pros.length > 0 ? "flex" : "none";
  conSlider.style.display = cons.length > 0 ? "flex" : "none";

  // Bounds check
  if (proIndex >= pros.length) proIndex = Math.max(0, pros.length - 1);
  if (conIndex >= cons.length) conIndex = Math.max(0, cons.length - 1);

  proListContainer.innerHTML = pros.length > 0
    ? `<div class="card thread-container">${renderCardInner(pros[proIndex], "opinion", proIndex)}</div>`
    : '<p class="empty-text">아직 찬성 의견이 없습니다.</p>';

  conListContainer.innerHTML = cons.length > 0
    ? `<div class="card thread-container">${renderCardInner(cons[conIndex], "opinion", conIndex)}</div>`
    : '<p class="empty-text">아직 반대 의견이 없습니다.</p>';

  document.getElementById("pro-prev-btn").disabled = proIndex <= 0;
  document.getElementById("pro-next-btn").disabled = proIndex >= pros.length - 1;
  document.getElementById("con-prev-btn").disabled = conIndex <= 0;
  document.getElementById("con-next-btn").disabled = conIndex >= cons.length - 1;
}

/* ── UI Logic (Reason Blocks) ── */

function setupReasonBlocks(containerId, addBtnId) {
  const container = document.getElementById(containerId);
  const addBtn = document.getElementById(addBtnId);
  const template = document.getElementById("reason-block-template");

  function updateNumbers() {
    const blocks = container.querySelectorAll(".reason-block");
    blocks.forEach((b, index) => {
      const label = b.querySelector(".reason-number-label");
      if (label) {
        label.textContent = `근거 ${index + 1}`;
      }
    });
  }

  function addReason() {
    const clone = template.content.cloneNode(true);
    const block = clone.querySelector(".reason-block");
    const removeBtn = clone.querySelector(".remove-reason-btn");
    const descArea = clone.querySelector(".reason-desc");
    const charCount = clone.querySelector(".char-count");

    removeBtn.addEventListener("click", () => {
      // Must have at least 1 reason
      if (container.children.length > 1) {
        block.remove();
        updateNumbers();
      } else {
        alert("최소 1개의 근거가 필요합니다.");
      }
    });

    descArea.addEventListener("input", (e) => {
      const len = e.target.value.length;
      charCount.textContent = `${len} / 200`;
    });

    container.appendChild(block);
    updateNumbers();
  }

  addBtn.addEventListener("click", addReason);
  
  // Expose reset function
  return function reset() {
    container.innerHTML = "";
    addReason(); // Ensure 1 reason is present
  };
}

const resetOpinionReasons = setupReasonBlocks("opinion-reasons-container", "opinion-add-reason-btn");
const resetRebuttalReasons = setupReasonBlocks("rebuttal-reasons-container", "rebuttal-add-reason-btn");
// Opinion & Rebuttal both use multi-reason system.

/* ── Modal Handling ── */

const overlays = {
  opinion: document.getElementById("opinion-modal-overlay"),
  rebuttal: document.getElementById("rebuttal-modal-overlay"),
  persuaded: document.getElementById("persuaded-modal-overlay"),
};

function closeAllModals() {
  Object.values(overlays).forEach(el => el.style.display = "none");
}

document.querySelectorAll(".modal-close").forEach(btn => {
  btn.addEventListener("click", closeAllModals);
});

// Click outside to close
Object.values(overlays).forEach(overlay => {
  document.getElementById("leaderboard-btn").addEventListener("click", () => {
    document.getElementById("leaderboard-modal-overlay").style.display = "flex";
  });

  document.getElementById("close-leaderboard-btn").addEventListener("click", () => {
    document.getElementById("leaderboard-modal-overlay").style.display = "none";
  });

  window.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.style.display = "none";
    }
  });
});

document.getElementById("open-modal-btn").addEventListener("click", () => {
  if (isReadonly) return;
  document.getElementById("opinion-core-claim").value = "";
  resetOpinionReasons();
  overlays.opinion.style.display = "flex";
});

// Opinion Submission
document.getElementById("submit-opinion-btn").addEventListener("click", async () => {
  if (isReadonly) return;
  
  const coreClaim = document.getElementById("opinion-core-claim").value.trim();
  if (!coreClaim) {
    alert("핵심 주장을 입력해주세요.");
    return;
  }

  const container = document.getElementById("opinion-reasons-container");
  const reasons = [];
  for (let block of container.querySelectorAll(".reason-block")) {
    const title = block.querySelector(".reason-title").value.trim();
    const desc = block.querySelector(".reason-desc").value.trim();
    if (title || desc) {
      if (!title) { alert("근거 제목을 입력해주세요."); return; }
      if (!desc) { alert("근거 설명을 입력해주세요."); return; }
      reasons.push({ title, description: desc });
    }
  }

  if (reasons.length === 0) {
    alert("최소 1개의 근거가 필요합니다.");
    return;
  }

  const btn = document.getElementById("submit-opinion-btn");
  btn.disabled = true;

  const id = "op-" + Date.now() + "-" + Math.floor(Math.random()*1000);
  
  // Extract my previous payload data
  const myData = await myInfo.loadPayloads();
  const myPayload = myData[myInfo.nickname] || { opinions: [], rebuttals: [], persuadedEvents: [] };
  if (!myPayload.opinions) myPayload.opinions = [];

  myPayload.opinions.push({
    id: id,
    side: myInfo.side,
    coreClaim: coreClaim,
    reasons: reasons,
    timestamp: Date.now()
  });

  myInfo.savePayload(myPayload).then(() => {
    btn.disabled = false;
    closeAllModals();
    loadAllData();
  }).catch(() => btn.disabled = false);
});

// Persuaded Modal
window.openPersuadedModal = function(targetId, targetAuthorNickname) {
  if (isReadonly) return alert("현재 토론에 참여할 수 없는 상태입니다.");
  if (targetAuthorNickname === myInfo.nickname) {
    return alert("자신의 글에는 설득당할 수 없습니다!");
  }
  
  currentTargetId = targetId;
  currentTargetAuthorNickname = targetAuthorNickname;

  let targetItem = allOpinions.find(op => op.id === targetId) || allRebuttals.find(reb => reb.id === targetId);
  if (!targetItem) return;

  const sourceDiv = document.getElementById("persuaded-source-text");
  let sourceHtml = "";
  if (targetItem.reasons && targetItem.reasons.length > 0) {
    targetItem.reasons.forEach((r, idx) => {
      sourceHtml += `<div class="reason-item source-reason selectable-reason" data-reason-index="${idx}">
        <div class="reason-number-label-view source-reason-label">근거 ${idx + 1}</div>
        <h4 class="reason-title">${escapeHtml(r.title)}</h4>
        <p class="reason-desc">${escapeHtml(r.description)}</p>
      </div>`;
    });
  }
  sourceDiv.innerHTML = sourceHtml;

  // Multi-select logic
  _selectedReasonIndices = [];
  sourceDiv.querySelectorAll(".selectable-reason").forEach(el => {
    el.addEventListener("click", () => {
      const idx = parseInt(el.getAttribute("data-reason-index"), 10);
      if (_selectedReasonIndices.includes(idx)) {
        _selectedReasonIndices = _selectedReasonIndices.filter(i => i !== idx);
        el.classList.remove("selected");
      } else {
        _selectedReasonIndices.push(idx);
        el.classList.add("selected");
      }
      
      const hasSelection = _selectedReasonIndices.length > 0;
      document.getElementById("persuaded-step-2").classList.toggle("disabled-section", !hasSelection);
      document.getElementById("persuaded-reason").disabled = !hasSelection;
      document.getElementById("submit-persuaded-btn").disabled = !hasSelection;
      
      const preview = document.getElementById("persuaded-selected-preview");
      const display = document.getElementById("persuaded-selected-text-display");
      preview.style.display = hasSelection ? "block" : "none";
      display.textContent = `${_selectedReasonIndices.length}개 선택됨`;
    });
  });

  document.getElementById("persuaded-step-2").classList.add("disabled-section");
  document.getElementById("persuaded-reason").disabled = true;
  document.getElementById("submit-persuaded-btn").disabled = true;
  document.getElementById("persuaded-selected-preview").style.display = "none";
  document.getElementById("persuaded-reason").value = "";

  // Keyword Chips initialization
  _selectedKeyword = null;
  const chips = overlays.persuaded.querySelectorAll(".keyword-chip");
  chips.forEach(chip => {
    chip.classList.remove("selected");
    chip.onclick = function() {
      chips.forEach(c => c.classList.remove("selected"));
      this.classList.add("selected");
      _selectedKeyword = this.getAttribute("data-keyword");
    };
  });

  overlays.persuaded.style.display = "flex";
};

document.getElementById("submit-persuaded-btn").addEventListener("click", async () => {
  const reason = document.getElementById("persuaded-reason").value.trim();
  if (!reason) return alert("설득된 이유를 남겨주세요!");

  const btn = document.getElementById("submit-persuaded-btn");
  btn.disabled = true;

  const myData = await myInfo.loadPayloads();
  const myPayload = myData[myInfo.nickname] || { opinions: [], rebuttals: [], persuadedEvents: [] };
  if (!myPayload.persuadedEvents) myPayload.persuadedEvents = [];

  const targetItem = allOpinions.find(op => op.id === currentTargetId) || allRebuttals.find(reb => reb.id === currentTargetId);
  const selectedTitles = _selectedReasonIndices.map(idx => targetItem.reasons[idx].title);

  myPayload.persuadedEvents.push({
    targetId: currentTargetId,
    targetReasonIndices: _selectedReasonIndices,
    selectedReasonTitles: selectedTitles,
    targetAuthorNickname: currentTargetAuthorNickname,
    selectedKeyword: _selectedKeyword,
    reason: reason,
    timestamp: Date.now()
  });

  myInfo.savePayload(myPayload).then(() => {
    btn.disabled = false;
    closeAllModals();
    loadAllData();
  }).catch(() => btn.disabled = false);
});

// Rebuttal Text Selection Logic
window.openRebuttalModal = function(targetId, targetAuthorNickname) {
  if (isReadonly) return alert("현재 참여할 수 없습니다.");
  currentTargetId = targetId;
  currentTargetAuthorNickname = targetAuthorNickname;

  // Find the target text
  let targetItem = allOpinions.find(op => op.id === targetId) || allRebuttals.find(reb => reb.id === targetId);
  if (!targetItem) return;

  // Render the source text so user can select
  const sourceDiv = document.getElementById("rebuttal-source-text");
  
  let sourceHtml = `<p class="source-core"><strong>${escapeHtml(targetItem.coreClaim)}</strong></p>`;
  if (targetItem.reasons && targetItem.reasons.length > 0) {
    targetItem.reasons.forEach((r, idx) => {
      sourceHtml += `<div class="reason-item source-reason" data-reason-index="${idx}">
        <div class="reason-number-label-view source-reason-label">근거 ${idx + 1}</div>
        <h4 class="reason-title">${escapeHtml(r.title)}</h4>
        <p class="reason-desc">${escapeHtml(r.description)}</p>
      </div>`;
    });
  }
  sourceDiv.innerHTML = sourceHtml;

  // Reset states
  document.getElementById("rebuttal-step-2").classList.add("disabled-section");
  document.getElementById("rebuttal-core-claim").disabled = true;
  document.getElementById("rebuttal-add-reason-btn").disabled = true;
  document.getElementById("submit-rebuttal-btn").disabled = true;
  document.getElementById("rebuttal-selected-preview").style.display = "none";
  document.getElementById("rebuttal-core-claim").value = "";
  resetRebuttalReasons();

  overlays.rebuttal.style.display = "flex";
};

// Listen for selection changes inside the source text box
document.addEventListener("selectionchange", () => {
  const isRebuttalOpen = overlays.rebuttal.style.display === "flex";
  const isPersuadedOpen = overlays.persuaded.style.display === "flex";
  
  if (!isRebuttalOpen && !isPersuadedOpen) return;
  
  const selection = window.getSelection();
  const sourceBox = isRebuttalOpen ? document.getElementById("rebuttal-source-text") : document.getElementById("persuaded-source-text");
  
  // Check if selection is inside source box and not empty
  if (selection.rangeCount > 0) {
    if (sourceBox.contains(selection.anchorNode) && sourceBox.contains(selection.focusNode)) {
      const selectedText = selection.toString().trim();
      if (selectedText.length > 0) {
        let node = selection.anchorNode;
        if (node.nodeType === 3) node = node.parentNode;
        
        // Find if selection is in a reason or just in the core claim
        const reasonElement = node.closest('.source-reason');
        const coreClaim = node.closest('.source-core');

        if (reasonElement || coreClaim) {
          const rIdx = reasonElement ? parseInt(reasonElement.getAttribute("data-reason-index"), 10) : -1;
          if (isRebuttalOpen) {
            enableRebuttalStep2(selectedText, rIdx);
          }
        } else {
          // If they selected something outside a reason (like core claim), disable it
          if (isRebuttalOpen) {
            document.getElementById("rebuttal-step-2").classList.add("disabled-section");
            document.getElementById("rebuttal-content").disabled = true;
            document.getElementById("submit-rebuttal-btn").disabled = true;
            document.getElementById("rebuttal-selected-preview").style.display = "none";
          } else {
            document.getElementById("persuaded-step-2").classList.add("disabled-section");
            document.getElementById("persuaded-reason").disabled = true;
            document.getElementById("submit-persuaded-btn").disabled = true;
            document.getElementById("persuaded-selected-preview").style.display = "none";
          }
        }
      }
    }
  }
});

// Rebuttal Submission
document.getElementById("submit-rebuttal-btn").addEventListener("click", async () => {
  if (isReadonly) return;
  const coreClaim = document.getElementById("rebuttal-core-claim").value.trim();
  
  if (!coreClaim) return alert("핵심 주장을 입력해주세요.");

  const container = document.getElementById("rebuttal-reasons-container");
  const reasons = [];
  for (let block of container.querySelectorAll(".reason-block")) {
    const title = block.querySelector(".reason-title").value.trim();
    const desc = block.querySelector(".reason-desc").value.trim();
    if (title || desc) {
      if (!title) { alert("근거 제목을 입력해주세요."); return; }
      if (!desc) { alert("근거 설명을 입력해주세요."); return; }
      reasons.push({ title, description: desc });
    }
  }

  if (reasons.length === 0) {
    alert("최소 1개의 근거가 필요합니다.");
    return;
  }

  const btn = document.getElementById("submit-rebuttal-btn");
  btn.disabled = true;

  const id = "reb-" + Date.now() + "-" + Math.floor(Math.random()*1000);

  const myData = await myInfo.loadPayloads();
  const myPayload = myData[myInfo.nickname] || { opinions: [], rebuttals: [], persuadedEvents: [] };
  if (!myPayload.rebuttals) myPayload.rebuttals = [];

  myPayload.rebuttals.push({
    id: id,
    targetId: currentTargetId,
    targetReasonIndex: _currentTargetReasonIndex,
    targetAuthorNickname: currentTargetAuthorNickname,
    selectedText: _currentTargetSelectedText,
    side: myInfo.side,
    coreClaim: coreClaim,
    reasons: reasons, 
    timestamp: Date.now()
  });

  myInfo.savePayload(myPayload).then(() => {
    btn.disabled = false;
    closeAllModals();
    loadAllData();
  }).catch(() => btn.disabled = false);
});

// Helper functions for enabling steps
function enableRebuttalStep2(text, reasonIndex) {
  _currentTargetSelectedText = text;
  _currentTargetReasonIndex = reasonIndex;
  
  document.getElementById("rebuttal-step-2").classList.remove("disabled-section");
  document.getElementById("rebuttal-core-claim").disabled = false;
  document.getElementById("rebuttal-add-reason-btn").disabled = false;
  document.getElementById("submit-rebuttal-btn").disabled = false;
  
  document.getElementById("rebuttal-selected-preview").style.display = "block";
  document.getElementById("rebuttal-selected-text-display").textContent = text;
}
