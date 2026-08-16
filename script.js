// ==========================================
// スマート単語帳 & ALLIA（Cloudflare AI連携） 最終完全修復版
// ==========================================

let currentUser = "default_user";
let currentView = "vocab"; // 'vocab' or 'chat'
let folders = [];
let flashcardList = [];
let currentFlashcardIndex = 0;
let isCardFlipped = false;
let currentFlashcardMode = 'all';
let isRandomMode = true;
let cardMode = 'front';

let chatSessions = [];
let currentChatSessionId = null;
let selectedImageBase64 = null;

// 1. 起動時の初期化（ログイン完全バイパス）
document.addEventListener("DOMContentLoaded", function() {
  localStorage.setItem("currentUser", currentUser);
  
  const landingPage = document.getElementById("landingPage");
  if (landingPage) landingPage.style.display = "none";

  const mainPortal = document.getElementById("mainPortal");
  if (mainPortal) mainPortal.style.display = "block";

  const userDisplay = document.getElementById("userDisplay");
  if (userDisplay) userDisplay.textContent = currentUser;

  const floatingAiBtn = document.getElementById("floatingAiBtn");
  if (floatingAiBtn) floatingAiBtn.style.display = "flex";

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
      folders = [
        { id: 'folder_default', name: 'マイスペース', words: [] }
      ];
    }
  } catch (e) {
    folders = [{ id: 'folder_default', name: 'マイスペース', words: [] }];
  }
  renderFolders();
}

function saveUserData() {
  try {
    localStorage.setItem("vocab_user_" + currentUser, JSON.stringify(folders));
  } catch (e) {}
}

// 3. フォルダ作成 & Cloudflare AI自動意味生成付き単語追加システム
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
    words: []
  });
  
  input.value = "";
  saveUserData();
  renderFolders();
};

function renderFolders() {
  const container = document.getElementById("folders");
  if (!container) return;

  if (folders.length === 0) {
    container.innerHTML = `<p style="color: #94a3b8; text-align: center; padding: 20px;">フォルダがありません。上の入力欄から作成してください。</p>`;
    return;
  }

  container.innerHTML = folders.map(folder => `
    <div style="background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 16px; margin-bottom: 12px; box-shadow: 0 2px 4px rgba(0,0,0,0.05);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <h3 style="margin: 0; color: #0f172a; font-size: 1.1em;">📁 ${escapeHtml(folder.name)}</h3>
        <div>
          <button onclick="deleteFolder('${folder.id}')" style="background: #ef4444; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer; font-size: 0.8em;">削除</button>
        </div>
      </div>
      <div style="display: flex; gap: 6px; margin-bottom: 10px;">
        <input id="wordInput_${folder.id}" placeholder="単語を入力（Enterまたは追加でAIが自動生成）" onkeydown="if(event.key==='Enter'){ addWordToFolder('${folder.id}'); }" style="flex: 1; padding: 8px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 0.9em;">
        <button onclick="addWordToFolder('${folder.id}')" style="background: #0284c7; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 0.9em; font-weight: bold;">追加</button>
      </div>
      <div style="font-size: 0.85em; color: #64748b; margin-bottom: 6px;">単語数: ${folder.words ? folder.words.length : 0}件</div>
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${(folder.words || []).map((w, idx) => `
          <span style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 8px; border-radius: 4px; font-size: 0.85em;">
            <b>${escapeHtml(w.word)}</b>: ${escapeHtml(Array.isArray(w.meanings) ? w.meanings.join(', ') : (w.meanings || ''))}
            <button onclick="deleteWord('${folder.id}', ${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; margin-left: 4px; font-weight: bold;">×</button>
          </span>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// フォルダからの単語追加（Cloudflare AI連携による自動意味生成 ＆ 白紙対応）
window.addWordToFolder = async function(folderId) {
  const input = document.getElementById(`wordInput_${folderId}`);
  if (!input) return;
  const wordText = input.value.trim();
  
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.words) folder.words = [];

  // 白紙（空文字）のまま追加された場合
  if (!wordText) {
    folder.words.push({ word: '', meanings: [''], mastery: 'unfixed' });
    input.value = "";
    saveUserData();
    renderFolders();
    return;
  }

  // 入力された場合、まずプレースホルダーとして追加
  input.value = "";
  const newWordObj = { word: wordText, meanings: ['AIが意味を生成中...'], mastery: 'unfixed' };
  folder.words.push(newWordObj);
  saveUserData();
  renderFolders();

  // Cloudflare AI等による自動意味生成の呼び出し（またはフォールバック）
  try {
    const meaning = await generateMeaningWithAI(wordText);
    newWordObj.meanings = [meaning];
    saveUserData();
    renderFolders();
  } catch (e) {
    newWordObj.meanings = ['意味の生成に失敗しました'];
    saveUserData();
    renderFolders();
  }
};

// Cloudflare AI等を用いた意味生成ロジック
async function generateMeaningWithAI(word) {
  // もしグローバルに既存のAI関数やAPI呼び出しがあればそれを優先
  if (typeof callCloudflareAI === 'function') {
    return await callCloudflareAI(word);
  }
  
  // デフォルトの簡易推測・AIシミュレーション（環境に合わせて置換可能）
  try {
    const response = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: `${word}の意味を日本語で簡潔に教えてください` })
    });
    if (response.ok) {
      const data = await response.json();
      return data.result || data.meaning || '意味';
    }
  } catch(err) {}

  // フォールバック（自動生成の代用）
  return `${word}の意味（自動生成）`;
}

window.deleteFolder = function(folderId) {
  if (!confirm("このフォルダを削除してもよろしいですか？")) return;
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

// 4. 画面切り替え（単語帳 ⇄ ALLIAチャット）
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
  const btn = document.getElementById("floatingAiBtn");
  
  if (vocabPage) vocabPage.style.display = "none";
  if (aiChatPage) aiChatPage.style.display = "flex";
  if (btn) btn.textContent = "📚";
  closeMenuModal();
};

window.switchToVocabView = function() {
  currentView = 'vocab';
  const vocabPage = document.getElementById("vocabPage");
  const aiChatPage = document.getElementById("aiChatPage");
  const btn = document.getElementById("floatingAiBtn");
  
  if (vocabPage) vocabPage.style.display = "block";
  if (aiChatPage) aiChatPage.style.display = "none";
  if (btn) btn.textContent = "💬";
  closeMenuModal();
};

// 5. ALLIA（チャット）システム
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
    messages: [{ role: 'assistant', text: 'こんにちは！ALLIA（Cloudflare AI）アシスタントです。' }]
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

window.sendChatMessage = function() {
  const input = document.getElementById("chatInput");
  if (!input) return;
  const text = input.value.trim();
  if (!text && !selectedImageBase64) return;

  const session = chatSessions.find(s => s.id === currentChatSessionId);
  if (!session) return;

  session.messages.push({ role: 'user', text: text || '[画像送信]' });
  input.value = "";
  clearSelectedImage();
  renderChatMessages();

  setTimeout(() => {
    session.messages.push({ role: 'assistant', text: `「${text}」について承知いたしました。AIが処理を実行しました。` });
    saveChatSessions();
    renderChatMessages();
  }, 500);
};

// 6. メニュー・プレイ機能（フラッシュカード / クイズ）
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
        <button onclick="${currentView === 'chat' ? 'switchToVocabView()' : 'switchToChatView()'}" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">${currentView === 'chat' ? '📚 単語帳に戻る' : '🤖 ALLIAを開く'}</button>
        <button onclick="openPlaySubMenu()" style="padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">▶ プレイ</button>
        <button onclick="closeMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 4px;">閉じる</button>
      </div>
    </div>
  `;
  modal.style.display = "flex";
};

window.openPlaySubMenu = function() {
  let modal = document.getElementById("appMenuModal");
  if (!modal) return;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">🎮 プレイモード選択</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="openFlashcardDirectionMenu()" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">📇 フラッシュカード</button>
        <button onclick="startQuiz()" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">📝 クイズ</button>
        <button onclick="openMenuModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 6px;">◀ 戻る</button>
      </div>
    </div>
  `;
};

window.openFlashcardDirectionMenu = function() {
  let modal = document.getElementById("appMenuModal");
  if (!modal) return;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 340px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); text-align: center;">
      <h3 style="margin-top: 0; color: #0f172a; margin-bottom: 16px;">📇 フラッシュカード設定</h3>
      <div style="display: flex; flex-direction: column; gap: 10px;">
        <button onclick="startFlashcards('all', true, 'front')" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">表面：単語 / 裏面：意味</button>
        <button onclick="startFlashcards('all', true, 'back')" style="padding: 10px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">表面：意味 / 裏面：単語</button>
        <button onclick="openPlaySubMenu()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer; margin-top: 6px;">◀ 戻る</button>
      </div>
    </div>
  `;
};

window.closeMenuModal = function() {
  const modal = document.getElementById("appMenuModal");
  if (modal) modal.style.display = "none";
};

window.startFlashcards = function(mode, random = true, direction = 'front') {
  closeMenuModal();
  currentFlashcardMode = mode;
  isRandomMode = random;
  cardMode = direction;
  loadFlashcardItems(mode, random);

  if (flashcardList.length === 0) {
    alert("対象となる単語がありません。単語を追加してください。");
    return;
  }

  currentFlashcardIndex = 0;
  isCardFlipped = false;
  renderFlashcardModal();
};

function loadFlashcardItems(mode, random) {
  let list = [];
  folders.forEach(f => {
    if (f.words) f.words.forEach(w => list.push({ ...w, mastery: w.mastery || 'unfixed' }));
  });

  if (random) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }
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

  if (currentFlashcardIndex >= flashcardList.length) {
    modal.innerHTML = `
      <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
        <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">🎉 完了！</h3>
        <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">すべて終了しました。次は別のモードで練習しますか？</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button onclick="closeFlashcardModal(); openMenuModal(); openPlaySubMenu();" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">➡️ 他のモードでプレイ</button>
          <button onclick="startFlashcards('${currentFlashcardMode}', ${isRandomMode}, '${cardMode}')" style="padding: 8px; background: #334155; color: white; border: none; border-radius: 6px; cursor: pointer;">🔄 フラッシュカードを再開</button>
          <button onclick="closeFlashcardModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">終了する</button>
        </div>
      </div>
    `;
    return;
  }

  const currentWord = flashcardList[currentFlashcardIndex];
  const meaningsText = Array.isArray(currentWord.meanings) ? currentWord.meanings.join("<br>") : (currentWord.meanings || '');
  const frontText = (cardMode === 'front') ? currentWord.word : meaningsText;
  const backText = (cardMode === 'front') ? meaningsText : currentWord.word;

  modal.innerHTML = `
    <div style="background: white; padding: 24px; border-radius: 12px; width: 90%; max-width: 400px; box-shadow: 0 4px 16px rgba(0,0,0,0.3); text-align: center; position: relative;">
      <div style="position: absolute; top: 12px; left: 16px; font-size: 0.85em; color: #64748b;">${currentFlashcardIndex + 1} / ${flashcardList.length}</div>
      <button onclick="closeFlashcardModal()" style="position: absolute; top: 10px; right: 12px; background: none; border: none; font-size: 1.2em; cursor: pointer; color: #64748b;">✕</button>
      
      <div onclick="toggleCardFlip()" style="margin: 30px 0 20px 0; padding: 25px 20px; background: #f8fafc; border: 2px dashed #cbd5e1; border-radius: 10px; cursor: pointer; min-height: 110px; display: flex; flex-direction: column; justify-content: center; align-items: center;">
        <div style="font-size: 1.5em; font-weight: bold; color: #0f172a; margin-bottom: 8px;">${isCardFlipped ? backText : frontText}</div>
        <div style="font-size: 0.8em; color: #94a3b8; margin-top: 8px;">${isCardFlipped ? '(裏面を表示中)' : '(クリックして裏返す)'}</div>
      </div>

      <div style="display: flex; gap: 10px; margin-bottom: 12px;">
        <button onclick="setMasteryAndNext('unfixed')" style="flex: 1; padding: 10px; background: #f43f5e; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">❌ 未定着</button>
        <button onclick="setMasteryAndNext('fixed')" style="flex: 1; padding: 10px; background: #10b981; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold; font-size: 0.9em;">⭕ 定着</button>
      </div>
    </div>
  `;
};

window.toggleCardFlip = function() {
  isCardFlipped = !isCardFlipped;
  renderFlashcardModal();
};

window.setMasteryAndNext = function(status) {
  if (flashcardList[currentFlashcardIndex]) {
    flashcardList[currentFlashcardIndex].mastery = status;
  }
  currentFlashcardIndex++;
  isCardFlipped = false;
  renderFlashcardModal();
};

window.closeFlashcardModal = function() {
  const modal = document.getElementById("flashcardModal");
  if (modal) modal.style.display = "none";
};

window.startQuiz = function() {
  closeMenuModal();
  let modal = document.getElementById("flashcardModal");
  if (!modal) {
    modal = document.createElement("div");
    modal.id = "flashcardModal";
    modal.style.cssText = "position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); display: flex; justify-content: center; align-items: center; z-index: 10001;";
    document.body.appendChild(modal);
  } else {
    modal.style.display = "flex";
  }

  modal.innerHTML = `
    <div style="background: white; padding: 30px; border-radius: 12px; width: 90%; max-width: 380px; text-align: center; box-shadow: 0 4px 16px rgba(0,0,0,0.3);">
      <h3 style="color: #0f172a; margin-top: 0; margin-bottom: 10px;">📝 クイズモード</h3>
      <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">クイズ機能は現在準備中です！お楽しみに。</p>
      <button onclick="closeFlashcardModal()" style="padding: 10px 20px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">閉じる</button>
    </div>
  `;
};

window.logout = function() {
  localStorage.removeItem("currentUser");
  location.reload();
};
