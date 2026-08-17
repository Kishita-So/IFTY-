// ==========================================
// 完全版 スマート単語帳 & ALLIA（意味生成バグ修正・プレイメニュー完全対応）
// ==========================================

let currentUser = "default_user";
let currentView = "vocab"; // 'vocab' or 'chat'
let folders = [];

// フラッシュカード用の状態変数
let flashcardList = [];
let flashcardOriginalList = [];
let currentFlashcardIndex = 0;
let isCardFlipped = false;
let flashcardSettings = {
  target: 'all', // 'all', 'checked_folders', 'checked_words'
  order: 'random', // 'random', 'sequential'
  direction: 'front' // 'front' (単語→意味), 'back' (意味→単語)
};
let isFlashcardPaused = false;

let chatSessions = [];
let currentChatSessionId = null;
let selectedImageBase64 = null;

const WORKER_URL = 'https://ifty.humbleflail205.workers.dev/';

// 1. 初期化処理
document.addEventListener("DOMContentLoaded", function() {
  localStorage.setItem("currentUser", currentUser);
  
  const landingPage = document.getElementById("landingPage");
  if (landingPage) landingPage.style.display = "none";

  const mainPortal = document.getElementById("mainPortal");
  if (mainPortal) mainPortal.style.display = "block";

  const userDisplay = document.getElementById("userDisplay");
  if (userDisplay) userDisplay.textContent = currentUser;

  // 右下のボタンを必ずメニュー（≡）として機能させる設定
  const floatingAiBtn = document.getElementById("floatingAiBtn");
  if (floatingAiBtn) {
    floatingAiBtn.style.display = "flex";
    floatingAiBtn.onclick = openMenuModal; 
    floatingAiBtn.textContent = "≡"; 
    floatingAiBtn.title = "メニュー（プレイ・ALLIA）";
  }

  loadUserData(currentUser);
  initChatSystem();
});

// 2. ユーザーデータ管理
function loadUserData(username) {
  try {
    const saved = localStorage.getItem("vocab_user_" + username);
    if (saved) {
      folders = JSON.parse(saved);
    } else {
      folders = [];
    }
  } catch (e) {
    folders = [];
  }
  renderFolders();
}

function saveUserData() {
  try {
    localStorage.setItem("vocab_user_" + currentUser, JSON.stringify(folders));
  } catch (e) {}
}

// 3. フォルダ管理 & チェック機能
window.createFolder = function() {
  const input = document.getElementById("folderName");
  if (!input) return;
  const name = input.value.trim();
  if (!name) {
    alert("フォルダ名を入力してください。");
    return;
  }

  folders.push({
    id: 'folder_' + Date.now(),
    name: name,
    checked: false,
    collapsed: false,
    words: []
  });
  
  input.value = "";
  saveUserData();
  renderFolders();
};

window.toggleFolderCheck = function(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.checked = !folder.checked;
    saveUserData();
  }
};

window.toggleWordCheck = function(folderId, wordIndex) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words && folder.words[wordIndex]) {
    folder.words[wordIndex].checked = !folder.words[wordIndex].checked;
    saveUserData();
  }
};

window.toggleFolderCollapse = function(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.collapsed = !folder.collapsed;
    saveUserData();
    renderFolders();
  }
};

window.moveFolder = function(index, direction) {
  const newIndex = index + direction;
  if (newIndex < 0 || newIndex >= folders.length) return;
  const temp = folders[index];
  folders[index] = folders[newIndex];
  folders[newIndex] = temp;
  saveUserData();
  renderFolders();
};

window.clearFolderWords = function(folderId) {
  if (!confirm("このフォルダ内の単語をすべて削除しますか？")) return;
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words = [];
    saveUserData();
    renderFolders();
  }
};

function renderFolders() {
  const container = document.getElementById("folders");
  if (!container) return;

  if (folders.length === 0) {
    container.innerHTML = `<p style="color: #94a3b8; text-align: center; padding: 30px; background: white; border-radius: 8px; border: 1px dashed #cbd5e1;">フォルダがありません。下のフォームからフォルダを作成してください。</p>`;
    return;
  }

  container.innerHTML = folders.map((folder, fIndex) => `
    <div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: ${folder.collapsed ? '0' : '8px'};">
        <div style="display: flex; align-items: center; gap: 8px;">
          <input type="checkbox" ${folder.checked ? 'checked' : ''} onchange="toggleFolderCheck('${folder.id}')" title="フラッシュカード用チェック" style="width: 16px; height: 16px; cursor: pointer;">
          <span style="font-size: 0.9em; color: #64748b; cursor: pointer;" onclick="toggleFolderCollapse('${folder.id}')">${folder.collapsed ? '▶' : '▼'}</span>
          <h3 style="margin: 0; color: #0f172a; font-size: 1.1em; cursor: pointer;" onclick="toggleFolderCollapse('${folder.id}')">📁 ${escapeHtml(folder.name)} (${folder.words ? folder.words.length : 0}件)</h3>
        </div>
        <div style="display: flex; gap: 4px; align-items: center;">
          <button onclick="moveFolder(${fIndex}, -1)" title="上に移動" style="background: #e2e8f0; border: none; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 0.8em;">⬆️</button>
          <button onclick="moveFolder(${fIndex}, 1)" title="下に移動" style="background: #e2e8f0; border: none; padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 0.8em;">⬇️</button>
          <button onclick="clearFolderWords('${folder.id}')" title="全消し" style="background: #f59e0b; color: white; border: none; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 0.75em;">全消し</button>
          <button onclick="deleteFolder('${folder.id}')" title="削除" style="background: #ef4444; color: white; border: none; padding: 3px 6px; border-radius: 4px; cursor: pointer; font-size: 0.75em;">削除</button>
        </div>
      </div>

      ${folder.collapsed ? '' : `
        <div style="display: flex; gap: 6px; margin-bottom: 10px; margin-top: 8px;">
          <input id="wordInput_${folder.id}" placeholder="単語を入力（Enterまたは追加でAI自動生成）" onkeydown="if(event.key==='Enter'){ addWordToFolder('${folder.id}'); }" style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.9em;">
          <button onclick="addWordToFolder('${folder.id}')" style="background: #0284c7; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; font-weight: bold;">追加</button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(folder.words || []).map((w, wIndex) => `
            <div style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 10px; border-radius: 6px; font-size: 0.9em;">
              <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; align-items: flex-start; gap: 8px; flex: 1;">
                  <input type="checkbox" ${w.checked ? 'checked' : ''} onchange="toggleWordCheck('${folder.id}', ${wIndex})" title="フラッシュカード用チェック" style="margin-top: 4px; width: 15px; height: 15px; cursor: pointer;">
                  <div>
                    <div style="font-size: 1.05em;"><b>${escapeHtml(w.word)}</b> <span style="font-size: 0.85em; color: #475569;">${escapeHtml(Array.isArray(w.meanings) ? w.meanings.join(' / ') : (w.meanings || ''))}</span></div>
                    ${w.examples && w.examples.length > 0 ? `
                      <div style="margin-top: 4px; font-size: 0.85em; color: #334155;">
                        ${w.examples.map((ex) => `
                          <div style="margin-bottom: 2px; display: flex; align-items: center; gap: 6px;">
                            <span>• ${escapeHtml(ex.en)} (${escapeHtml(ex.ja)})</span>
                            <button onclick="speakWord('${escapeHtml(ex.en.replace(/'/g, "\\'"))}')" style="background: #0284c7; color: white; border: none; padding: 1px 4px; border-radius: 3px; font-size: 0.7em; cursor: pointer;" title="発音">🔊</button>
                          </div>
                        `).join('')}
                      </div>
                    ` : (w.example ? `<div style="font-size: 0.85em; color: #334155; margin-top: 2px;">例文: ${escapeHtml(w.example)} <button onclick="speakWord('${escapeHtml(w.example.replace(/'/g, "\\'"))}')" style="background: #0284c7; color: white; border: none; padding: 1px 4px; border-radius: 3px; font-size: 0.7em; cursor: pointer;">🔊</button></div>` : '')}
                    ${w.details ? `<div style="font-size: 0.8em; color: #0284c7; margin-top: 3px;">💡 ${escapeHtml(w.details)}</div>` : ''}
                  </div>
                </div>
                <div style="display: flex; gap: 3px; align-items: center;">
                  ${w.word ? `<button onclick="speakWord('${escapeHtml(w.word)}')" style="background: #0284c7; color: white; border: none; padding: 3px 6px; border-radius: 4px; font-size: 0.75em; cursor: pointer;" title="単語を発音">🔊</button>` : ''}
                  <button onclick="openEditWordModal('${folder.id}', ${wIndex})" style="background: #64748b; color: white; border: none; padding: 3px 6px; border-radius: 4px; font-size: 0.75em; cursor: pointer;">編集</button>
                  <button onclick="moveWordWithinFolder('${folder.id}', ${wIndex}, -1)" style="background: #e2e8f0; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 0.75em;" title="上へ">⬆️</button>
                  <button onclick="moveWordWithinFolder('${folder.id}', ${wIndex}, 1)" style="background: #e2e8f0; border: none; padding: 2px 5px; border-radius: 3px; cursor: pointer; font-size: 0.75em;" title="下へ">⬇️</button>
                  <button onclick="deleteWord('${folder.id}', ${wIndex})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold; font-size: 1.1em;" title="削除">×</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      `}
    </div>
  `).join('');
}

// 4. 単語追加・編集処理（意味が崩れないよう調整）
window.addWordToFolder = async function(folderId) {
  const input = document.getElementById(`wordInput_${folderId}`);
  if (!input) return;
  const wordText = input.value.trim();
  
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.words) folder.words = [];

  if (!wordText) {
    folder.words.push({ word: '', checked: false, meanings: [''], examples: [], details: '', mastery: 'unfixed' });
    input.value = "";
    saveUserData();
    renderFolders();
    return;
  }

  input.value = "";
  const newWordObj = { 
    word: wordText, 
    checked: false,
    meanings: ['意味を生成中...'], 
    examples: [], 
    details: 'AIが情報を生成しています...', 
    mastery: 'unfixed' 
  };
  folder.words.push(newWordObj);
  saveUserData();
  renderFolders();

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: "word", word: wordText })
    });
    
    if (response.ok) {
      const data = await response.json();
      // 配列でない場合や不適切な場合のフォールバック対策
      if (Array.isArray(data.meanings) && data.meanings.length > 0) {
        newWordObj.meanings = data.meanings;
      } else if (typeof data.meanings === 'string') {
        newWordObj.meanings = [data.meanings];
      } else {
        newWordObj.meanings = [`${wordText}の意味`];
      }
      newWordObj.examples = data.examples || [];
      newWordObj.details = data.details || "";
    } else {
      newWordObj.meanings = [`${wordText}の意味`];
      newWordObj.examples = [{ en: `This is ${wordText}.`, ja: "例文の和訳" }];
    }
  } catch (e) {
    newWordObj.meanings = [`${wordText}の意味`];
    newWordObj.examples = [{ en: `This is ${wordText}.`, ja: "例文の和訳" }];
  }

  saveUserData();
  renderFolders();
  setTimeout(() => speakWord(wordText), 500);
};

window.moveWordWithinFolder = function(folderId, wordIndex, direction) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words) return;
  const newIndex = wordIndex + direction;
  if (newIndex < 0 || newIndex >= folder.words.length) return;
  const temp = folder.words[wordIndex];
  folder.words[wordIndex] = folder.words[newIndex];
  folder.words[newIndex] = temp;
  saveUserData();
  renderFolders();
};

window.openEditWordModal = function(folderId, wordIndex) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words[wordIndex]) return;
  const w = folder.words[wordIndex];

  let modal = document.getElementById("editWordModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "editWordModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10005;";
    document.body.appendChild(modal);
  }

  const meaningsStr = Array.isArray(w.meanings) ? w.meanings.join('\n') : (w.meanings || '');
  const examplesStr = w.examples ? w.examples.map(ex => `${ex.en} | ${ex.ja}`).join('\n') : '';

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 420px; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 12px;">✏️ 単語の編集</h3>
      <div style="display: flex; flex-direction: column; gap: 10px; text-align: left;">
        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">単語</label>
          <input id="editWordText" value="${escapeHtml(w.word)}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
        </div>
        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">意味（改行区切り）</label>
          <textarea id="editMeaningsText" rows="4" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.9em;">${escapeHtml(meaningsStr)}</textarea>
        </div>
        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">例文 (英語 | 和訳を改行)</label>
          <textarea id="editExamplesText" rows="3" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box; font-size: 0.9em;">${escapeHtml(examplesStr)}</textarea>
        </div>
        <div>
          <label style="font-size: 0.85em; font-weight: bold; color: #475569;">詳細・コツ</label>
          <input id="editDetailsText" value="${escapeHtml(w.details || '')}" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; box-sizing: border-box;">
        </div>
        <div style="display: flex; gap: 10px; margin-top: 10px;">
          <button onclick="saveEditedWord('${folder.id}', ${wordIndex})" style="flex: 1; padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">保存</button>
          <button onclick="closeEditWordModal()" style="padding: 10px 16px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">キャンセル</button>
        </div>
      </div>
    </div>
  `;
  modal.style.display = "flex";
};

window.saveEditedWord = function(folderId, wordIndex) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.words[wordIndex]) return;

  const wordVal = document.getElementById("editWordText").value.trim();
  const meaningsVal = document.getElementById("editMeaningsText").value.split('\n').map(s => s.trim()).filter(Boolean);
  const examplesRaw = document.getElementById("editExamplesText").value.split('\n').map(s => s.trim()).filter(Boolean);
  const detailsVal = document.getElementById("editDetailsText").value.trim();

  const newExamples = examplesRaw.map(line => {
    const parts = line.split('|');
    return {
      en: parts[0] ? parts[0].trim() : line,
      ja: parts[1] ? parts[1].trim() : ''
    };
  });

  folder.words[wordIndex].word = wordVal;
  folder.words[wordIndex].meanings = meaningsVal;
  folder.words[wordIndex].examples = newExamples;
  folder.words[wordIndex].details = detailsVal;

  saveUserData();
  renderFolders();
  closeEditWordModal();
};

window.closeEditWordModal = function() {
  const modal = document.getElementById("editWordModal");
  if (modal) modal.style.display = "none";
};

window.speakWord = function(text) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'en-US';
  utterance.rate = 1.0;
  window.speechSynthesis.speak(utterance);
};

window.deleteFolder = function(folderId) {
  if (!confirm("このフォルダを削除しますか？")) return;
  folders = folders.filter(f => f.id !== folderId);
  saveUserData();
  renderFolders();
};

window.deleteWord = function(folderId, wordIndex) {
  const folder = folders.find(f => f.id === folderId);
  if (folder && folder.words) {
    folder.words.splice(wordIndex, 1);
    saveUserData();
    renderFolders();
  }
};

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 5. 画面切り替え（単語帳 ⇔ ALLIAチャット）
window.toggleViewMode = function() {
  if (currentView === 'vocab') {
    switchToChatView();
  } else {
    switchToVocabView();
  }
};

window.switchToChatView = function() {
  currentView = 'chat';
  const vocabPage = document.getElementById("vocabPage");
  const aiChatPage = document.getElementById("aiChatPage");
  
  if (vocabPage) vocabPage.style.display = "none";
  if (aiChatPage) aiChatPage.style.display = "flex";
  closeMenuModal();
};

window.switchToVocabView = function() {
  currentView = 'vocab';
  const vocabPage = document.getElementById("vocabPage");
  const aiChatPage = document.getElementById("aiChatPage");
  
  if (vocabPage) vocabPage.style.display = "block";
  if (aiChatPage) aiChatPage.style.display = "none";
  closeMenuModal();
};

// 6. ALLIAチャットシステム
function initChatSystem() {
  try {
    const savedSessions = localStorage.getItem("chat_sessions_" + currentUser);
    if (savedSessions) chatSessions = JSON.parse(savedSessions);
  } catch(e) { chatSessions = []; }

  if (chatSessions.length === 0) {
    createNewChatSession();
  } else {
    currentChatSessionId = chatSessions[0].id;
    updateChatSessionSelect();
    renderChatMessages();
  }
}

window.createNewChatSession = function() {
  const newSession = {
    id: 'session_' + Date.now(),
    title: '新しいチャット',
    messages: [{ role: 'assistant', text: 'こんにちは！ALLIAアシスタントです。何でも聞いてください！' }]
  };
  chatSessions.unshift(newSession);
  currentChatSessionId = newSession.id;
  saveChatSessions();
  updateChatSessionSelect();
  renderChatMessages();
};

window.switchChatSession = function(sessionId) {
  currentChatSessionId = sessionId;
  renderChatMessages();
  const session = chatSessions.find(s => s.id === sessionId);
  const titleInput = document.getElementById("chatTitleInput");
  if (titleInput && session) titleInput.value = session.title;
};

window.updateChatTitle = function(newTitle) {
  const session = chatSessions.find(s => s.id === currentChatSessionId);
  if (session) {
    session.title = newTitle;
    saveChatSessions();
    updateChatSessionSelect();
  }
};

window.moveChatSession = function(direction) {
  const index = chatSessions.findIndex(s => s.id === currentChatSessionId);
  if (index === -1) return;
  const newIndex = index + direction;
  if (newIndex >= 0 && newIndex < chatSessions.length) {
    const temp = chatSessions[index];
    chatSessions[index] = chatSessions[newIndex];
    chatSessions[newIndex] = temp;
    saveChatSessions();
    updateChatSessionSelect();
  }
};

window.deleteCurrentChatSession = function() {
  if (chatSessions.length <= 1) {
    alert("最後のチャットセッションは削除できません。");
    return;
  }
  if (!confirm("このチャットを削除しますか？")) return;
  chatSessions = chatSessions.filter(s => s.id !== currentChatSessionId);
  currentChatSessionId = chatSessions[0].id;
  saveChatSessions();
  updateChatSessionSelect();
  renderChatMessages();
};

function saveChatSessions() {
  try {
    localStorage.setItem("chat_sessions_" + currentUser, JSON.stringify(chatSessions));
  } catch(e) {}
}

function updateChatSessionSelect() {
  const select = document.getElementById("chatSessionSelect");
  if (!select) return;
  select.innerHTML = chatSessions.map(s => `
    <option value="${s.id}" ${s.id === currentChatSessionId ? 'selected' : ''}>${escapeHtml(s.title)}</option>
  `).join('');
  const session = chatSessions.find(s => s.id === currentChatSessionId);
  const titleInput = document.getElementById("chatTitleInput");
  if (titleInput && session) titleInput.value = session.title;
}

function renderChatMessages() {
  const container = document.getElementById("chatMessages");
  if (!container) return;
  const session = chatSessions.find(s => s.id === currentChatSessionId);
  if (!session || !session.messages) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = session.messages.map(m => `
    <div style="display: flex; justify-content: ${m.role === 'user' ? 'flex-end' : 'flex-start'}; margin-bottom: 8px;">
      <div style="background: ${m.role === 'user' ? '#0284c7' : '#e2e8f0'}; color: ${m.role === 'user' ? 'white' : '#0f172a'}; padding: 10px 14px; border-radius: 8px; max-width: 80%; word-break: break-all; font-size: 0.95em;">
        ${escapeHtml(m.text)}
      </div>
    </div>
  `).join('');
  container.scrollTop = container.scrollHeight;
}

window.handleImageSelect = function(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = function(e) {
    selectedImageBase64 = e.target.result;
    const previewContainer = document.getElementById("imagePreviewContainer");
    const previewImg = document.getElementById("imagePreview");
    if (previewContainer && previewImg) {
      previewImg.src = selectedImageBase64;
      previewContainer.style.display = "flex";
    }
  };
  reader.readAsDataURL(file);
};

window.clearSelectedImage = function() {
  selectedImageBase64 = null;
  const previewContainer = document.getElementById("imagePreviewContainer");
  if (previewContainer) previewContainer.style.display = "none";
  const fileInput = document.getElementById("imageInput");
  if (fileInput) fileInput.value = "";
};

window.sendChatMessage = async function() {
  const input = document.getElementById("chatInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text && !selectedImageBase64) return;

  const session = chatSessions.find(s => s.id === currentChatSessionId);
  if (!session) return;

  const userMsg = text || '[画像を送信しました]';
  session.messages.push({ role: 'user', text: userMsg });
  input.value = "";
  const currentImg = selectedImageBase64;
  clearSelectedImage();
  renderChatMessages();

  let replyText = "処理を実行しました。";

  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: "agent_chat",
        prompt: userMsg,
        currentFolders: folders,
        image: currentImg
      })
    });

    if (response.ok) {
      const data = await response.json();
      replyText = data.reply || "応答を取得しました。";
      if (data.updatedFolders) {
        folders = data.updatedFolders;
        saveUserData();
        renderFolders();
      }
    } else {
      replyText = "AIからの応答に失敗しました。";
    }
  } catch (e) {
    replyText = "通信エラーが発生しました: " + e.message;
  }

  session.messages.push({ role: 'assistant', text: replyText });
  saveChatSessions();
  renderChatMessages();
};

// 7. 右下メニューモーダル（「ALLIAを開く」「プレイ」）
window.openMenuModal = function() {
  let modal = document.getElementById("appMenuModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "appMenuModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.6); display: flex; justify-content: center; align-items: center; z-index: 10000;";
    document.body.appendChild(modal);
  }
  
  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">メニュー</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="${currentView === 'chat' ? 'switchToVocabView()' : 'switchToChatView()'}" style="padding: 12px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1em;">${currentView === 'chat' ? '📚 単語帳に戻る' : '🤖 ALLIAを開く'}</button>
        <button onclick="openPlaySubMenu()" style="padding: 12px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1em;">▶ プレイ</button>
        <button onclick="closeMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 4px;">閉じる</button>
      </div>
    </div>
  `;
  modal.style.display = "flex";
};

window.closeMenuModal = function() {
  const modal = document.getElementById("appMenuModal");
  if (modal) modal.style.display = "none";
};

window.openPlaySubMenu = function() {
  let modal = document.getElementById("appMenuModal");
  if (!modal) return;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">🎮 プレイモード選択</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="openFlashcardConfigModal()" style="padding: 12px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1em;">📇 フラッシュカード</button>
        <button onclick="openMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 6px;">◀ 戻る</button>
      </div>
    </div>
  `;
};

// 8. フラッシュカードの設定・詳細オプション
window.openFlashcardConfigModal = function() {
  let modal = document.getElementById("appMenuModal");
  if (!modal) return;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 380px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); text-align: left;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 14px; text-align: center;">📇 フラッシュカード設定</h3>
      
      <div style="margin-bottom: 12px;">
        <label style="font-size: 0.85em; font-weight: bold; color: #475569;">対象選択:</label>
        <select id="fcTarget" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; margin-top: 4px; font-size: 0.9em;">
          <option value="all">全ての単語</option>
          <option value="checked_folders">チェックしたフォルダの単語</option>
          <option value="checked_words">チェックした単語のみ</option>
        </select>
      </div>

      <div style="margin-bottom: 12px;">
        <label style="font-size: 0.85em; font-weight: bold; color: #475569;">順番:</label>
        <select id="fcOrder" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; margin-top: 4px; font-size: 0.9em;">
          <option value="random">ランダム</option>
          <option value="sequential">上から順</option>
        </select>
      </div>

      <div style="margin-bottom: 16px;">
        <label style="font-size: 0.85em; font-weight: bold; color: #475569;">カードの表面:</label>
        <select id="fcDirection" style="width: 100%; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; margin-top: 4px; font-size: 0.9em;">
          <option value="front">表面：単語 / 裏面：意味</option>
          <option value="back">表面：意味 / 裏面：単語</option>
        </select>
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button onclick="startFlashcardsFromConfig()" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 1em;">スタート</button>
        <button onclick="openPlaySubMenu()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">◀ 戻る</button>
      </div>
    </div>
  `;
};

window.startFlashcardsFromConfig = function() {
  flashcardSettings.target = document.getElementById("fcTarget").value;
  flashcardSettings.order = document.getElementById("fcOrder").value;
  flashcardSettings.direction = document.getElementById("fcDirection").value;

  closeMenuModal();
  prepareFlashcardList();

  if (flashcardList.length === 0) {
    alert("対象となる単語が選択されていません。単語やフォルダにチェックを入れるか、単語を追加してください。");
    openPlaySubMenu();
    openMenuModal();
    return;
  }

  currentFlashcardIndex = 0;
  isCardFlipped = false;
  isFlashcardPaused = false;
  renderFlashcardModal();
};

function prepareFlashcardList() {
  let list = [];
  if (flashcardSettings.target === 'all') {
    folders.forEach(f => {
      if (f.words) f.words.forEach(w => list.push({ ...w, mastery: w.mastery || 'unfixed' }));
    });
  } else if (flashcardSettings.target === 'checked_folders') {
    folders.forEach(f => {
      if (f.checked && f.words) {
        f.words.forEach(w => list.push({ ...w, mastery: w.mastery || 'unfixed' }));
      }
    });
  } else if (flashcardSettings.target === 'checked_words') {
    folders.forEach(f => {
      if (f.words) {
        f.words.forEach(w => {
          if (w.checked) list.push({ ...w, mastery: w.mastery || 'unfixed' });
        });
      }
    });
  }

  if (flashcardSettings.order === 'random') {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  flashcardOriginalList = [...list];
  flashcardList = list;
}

window.renderFlashcardModal = function() {
  let modal = document.getElementById("flashcardModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "flashcardModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;";
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  if (isFlashcardPaused) {
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 360px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 15px;">⏸️ 一時中断中</h3>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button onclick="resumeFlashcards()" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">▶ 再開する</button>
          <button onclick="restartFlashcards()" style="padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">🔄 最初からやり直す</button>
          <button onclick="closeFlashcardModal(); openMenuModal(); openPlaySubMenu(); openFlashcardConfigModal();" style="padding: 10px; background: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">⚙️ 設定し直し</button>
          <button onclick="closeFlashcardModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">終了する</button>
        </div>
      </div>
    `;
    return;
  }

  if (currentFlashcardIndex >= flashcardList.length) {
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">🎉 完了！</h3>
        <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">すべてのカードを終了しました。</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button onclick="restartFlashcards()" style="padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">🔄 もう一度プレイ</button>
          <button onclick="closeFlashcardModal(); openMenuModal(); openPlaySubMenu();" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">➡️ プレイメニューへ</button>
          <button onclick="closeFlashcardModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">閉じる</button>
        </div>
      </div>
    `;
    return;
  }

  const currentWord = flashcardList[currentFlashcardIndex];
  const meaningsText = Array.isArray(currentWord.meanings) ? currentWord.meanings.join("<br>") : (currentWord.meanings || '');
  const frontText = (flashcardSettings.direction === 'front') ? currentWord.word : meaningsText;
  const backText = (flashcardSettings.direction === 'front') ? meaningsText : currentWord.word;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); text-align: center; position: relative;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <span style="font-size: 0.85em; color: #64748b;">${currentFlashcardIndex + 1} / ${flashcardList.length}</span>
        <button onclick="pauseFlashcards()" style="background: #e2e8f0; border: none; padding: 4px 8px; border-radius: 4px; font-size: 0.8em; cursor: pointer; font-weight: bold; color: #334155;">⏸ 一時中断</button>
      </div>

      <div onclick="toggleCardFlip()" style="margin: 10px 0 16px 0; padding: 25px 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; cursor: pointer; min-height: 110px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <div style="font-size: 1.4em; font-weight: bold; color: #0f172a; margin-bottom: 8px;">${isCardFlipped ? backText : frontText}</div>
        ${currentWord.word ? `<button onclick="event.stopPropagation(); speakWord('${escapeHtml(currentWord.word)}')" style="margin-top: 6px; background: #0284c7; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.8em; cursor: pointer;">🔊 発音</button>` : ''}
        <div style="font-size: 0.8em; color: #94a3b8; margin-top: 6px;">${isCardFlipped ? '(裏面)' : '(クリックして裏返す)'}</div>
      </div>

      <div style="display: flex; gap: 6px; margin-bottom: 8px;">
        <button onclick="flashcardAction('unfixed')" style="flex: 1; padding: 9px; background: #f43f5e; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.85em;">❌ 未定着</button>
        <button onclick="flashcardAction('fixed')" style="flex: 1; padding: 9px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.85em;">⭕ 覚えた</button>
      </div>

      <div style="display: flex; gap: 6px;">
        <button onclick="flashcardPrev()" style="flex: 1; padding: 8px; background: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85em;" ${currentFlashcardIndex === 0 ? 'disabled style="opacity:0.5; cursor:not-allowed;"' : ''}>⬅️ 1つ戻る</button>
        <button onclick="flashcardSkip()" style="flex: 1; padding: 8px; background: #64748b; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 0.85em;">⏩ スキップ</button>
      </div>
    </div>
  `;
};

window.toggleCardFlip = function() {
  isCardFlipped = !isCardFlipped;
  renderFlashcardModal();
};

window.flashcardAction = function(status) {
  if (flashcardList[currentFlashcardIndex]) {
    flashcardList[currentFlashcardIndex].mastery = status;
  }
  currentFlashcardIndex++;
  isCardFlipped = false;
  renderFlashcardModal();
};

window.flashcardPrev = function() {
  if (currentFlashcardIndex > 0) {
    currentFlashcardIndex--;
    isCardFlipped = false;
    renderFlashcardModal();
  }
};

window.flashcardSkip = function() {
  currentFlashcardIndex++;
  isCardFlipped = false;
  renderFlashcardModal();
};

window.pauseFlashcards = function() {
  isFlashcardPaused = true;
  renderFlashcardModal();
};

window.resumeFlashcards = function() {
  isFlashcardPaused = false;
  renderFlashcardModal();
};

window.restartFlashcards = function() {
  isFlashcardPaused = false;
  currentFlashcardIndex = 0;
  isCardFlipped = false;
  flashcardList = [...flashcardOriginalList];
  if (flashcardSettings.order === 'random') {
    for (let i = flashcardList.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [flashcardList[i], flashcardList[j]] = [flashcardList[j], flashcardList[i]];
    }
  }
  renderFlashcardModal();
};

window.closeFlashcardModal = function() {
  const modal = document.getElementById("flashcardModal");
  if (modal) modal.style.display = "none";
  isFlashcardPaused = false;
};

window.logout = function() {
  localStorage.removeItem("currentUser");
  location.reload();
};
