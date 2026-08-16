// ==========================================
// 完全版 スマート単語帳 & ALLIA（Cloudflare Workers / Groq連携）
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

// 3. フォルダ管理 & 単語追加
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
    container.innerHTML = `<p style="color: #94a3b8; text-align: center; padding: 20px;">フォルダがありません。</p>`;
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
      <div style="display: flex; flex-direction: column; gap: 6px;">
        ${(folder.words || []).map((w, idx) => `
          <div style="background: #f1f5f9; border: 1px solid #cbd5e1; padding: 8px 10px; border-radius: 6px; font-size: 0.9em; display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
              <div><b>${escapeHtml(w.word)}</b> : ${escapeHtml(Array.isArray(w.meanings) ? w.meanings.join(' / ') : (w.meanings || ''))}</div>
              ${w.example ? `<div style="font-size: 0.8em; color: #475569; margin-top: 2px;">例文: ${escapeHtml(w.example)}</div>` : ''}
              ${w.details ? `<div style="font-size: 0.75em; color: #0284c7; margin-top: 2px;">💡 ${escapeHtml(w.details)}</div>` : ''}
            </div>
            <div style="display: flex; gap: 4px; align-items: center;">
              ${w.word ? `<button onclick="speakWord('${escapeHtml(w.word)}')" style="background: #0284c7; color: white; border: none; padding: 2px 6px; border-radius: 4px; font-size: 0.75em; cursor: pointer;">🔊</button>` : ''}
              <button onclick="deleteWord('${folder.id}', ${idx})" style="background: none; border: none; color: #ef4444; cursor: pointer; font-weight: bold; font-size: 1.1em;">×</button>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');
}

// 4. 単語追加 & Cloudflare Workers 連携 ＆ 0.5秒後音声自動再生
window.addWordToFolder = async function(folderId) {
  const input = document.getElementById(`wordInput_${folderId}`);
  if (!input) return;
  const wordText = input.value.trim();
  
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  if (!folder.words) folder.words = [];

  if (!wordText) {
    folder.words.push({ word: '', meanings: [''], example: '', details: '', mastery: 'unfixed' });
    input.value = "";
    saveUserData();
    renderFolders();
    return;
  }

  input.value = "";
  const newWordObj = { word: wordText, meanings: ['意味を生成中...'], example: '例文生成中...', details: '', mastery: 'unfixed' };
  folder.words.push(newWordObj);
  saveUserData();
  renderFolders();

  // Cloudflare Workers へ type: "word" でリクエスト送信
  try {
    const response = await fetch(WORKER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: "word",
        word: wordText
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      newWordObj.meanings = data.meanings || [wordText];
      if (data.examples && data.examples.length > 0) {
        newWordObj.example = `${data.examples[0].en} (${data.examples[0].ja})`;
      } else {
        newWordObj.example = "";
      }
      newWordObj.details = data.details || "";
    } else {
      const fallback = generateSmartWordData(wordText);
      newWordObj.meanings = [fallback.meaning];
      newWordObj.example = fallback.example;
    }
  } catch (e) {
    const fallback = generateSmartWordData(wordText);
    newWordObj.meanings = [fallback.meaning];
    newWordObj.example = fallback.example;
  }

  saveUserData();
  renderFolders();

  // 【要望対応】追加から正確に「0.5秒後」に音声自動再生
  setTimeout(() => {
    speakWord(wordText);
  }, 500);
};

function generateSmartWordData(word) {
  const lower = word.toLowerCase().trim();
  const dict = {
    "kill": { meaning: "殺す、台無しにする", example: "He tried to kill time before the meeting." },
    "ask": { meaning: "尋ねる、頼む", example: "Let me ask you a question." },
    "slow": { meaning: "遅い、のろい", example: "The internet connection is very slow today." }
  };
  return dict[lower] || { meaning: `${word}の意味`, example: `This is an example sentence using ${word}.` };
}

// Web Speech APIによる音声読み上げ
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
    messages: [{ role: 'assistant', text: 'こんにちは！ALLIA（Cloudflare AI / Grok）アシスタントです。何でも聞いてください！' }]
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

// チャットメッセージ送信（Cloudflare Workers へ type: "agent_chat" で送信）
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

// 7. メニュー・プレイ機能
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
        <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">すべてのカードを終了しました。</p>
        <div style="display: flex; flex-direction: column; gap: 10px;">
          <button onclick="closeFlashcardModal(); openMenuModal(); openPlaySubMenu();" style="padding: 10px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">➡️ 他のモードでプレイ</button>
          <button onclick="closeFlashcardModal()" style="padding: 8px; background: #e2e8f0; color: #334155; border: none; border-radius: 6px; cursor: pointer;">閉じる</button>
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
        ${currentWord.word ? `<button onclick="event.stopPropagation(); speakWord('${escapeHtml(currentWord.word)}')" style="margin-top: 8px; background: #0284c7; color: white; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.8em; cursor: pointer;">🔊 発音</button>` : ''}
        <div style="font-size: 0.8em; color: #94a3b8; margin-top: 8px;">${isCardFlipped ? '(裏面)' : '(クリックして裏返す)'}</div>
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
      <p style="color: #475569; font-size: 0.95em; margin-bottom: 20px;">クイズ機能は現在準備中です！</p>
      <button onclick="closeFlashcardModal()" style="padding: 10px 20px; background: #0284c7; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: bold;">閉じる</button>
    </div>
  `;
};

window.logout = function() {
  localStorage.removeItem("currentUser");
  location.reload();
};
