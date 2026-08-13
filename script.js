// --- 🔐 ログイン状態の模倣・画面表示管理 ---
let currentUser = null;
let folders = [];
let authMode = "login";

// モーダル表示
window.showAuthModal = function(mode) {
  authMode = mode;
  const modalTitle = document.getElementById("modalTitle");
  const authSubmitBtn = document.getElementById("authSubmitBtn");
  const authGuide = document.getElementById("authGuide");
  const resetPassBtn = document.getElementById("resetPassBtn");

  if (modalTitle) modalTitle.innerText = mode === "login" ? "ログイン" : "新規アカウント登録";
  if (authSubmitBtn) authSubmitBtn.innerText = mode === "login" ? "ログイン" : "登録する";
  
  if (authGuide) {
    if (mode === "register") {
      authGuide.style.display = "block";
      authGuide.innerText = "※このアプリで今後使用するパスワードを新規作成して入力してください。";
    } else {
      authGuide.style.display = "none";
    }
  }

  if (resetPassBtn) {
    resetPassBtn.style.display = mode === "login" ? "block" : "none";
  }

  const modal = document.getElementById("authModal");
  if (modal) modal.style.display = "flex";
};

window.hideAuthModal = function() {
  const modal = document.getElementById("authModal");
  if (modal) modal.style.display = "none";
};

// 👁️ パスワード表示・非表示切り替え
window.togglePassword = function() {
  const passInput = document.getElementById("authPassword");
  const btn = document.getElementById("togglePassBtn");
  if (!passInput) return;

  if (passInput.type === "password") {
    passInput.type = "text";
    if (btn) btn.innerText = "🙈";
  } else {
    passInput.type = "password";
    if (btn) btn.innerText = "👁️";
  }
};

window.handleAuthSubmit = function() {
  const email = document.getElementById("authEmail").value.trim();
  const password = document.getElementById("authPassword").value;
  if (!email || !password) return alert("メールアドレスとパスワードを入力してください");

  // 簡易ログイン処理
  currentUser = { email: email };
  const landingEl = document.getElementById("landingPage");
  const portalEl = document.getElementById("mainPortal");
  const userDisp = document.getElementById("userDisplay");

  if (landingEl) landingEl.style.display = "none";
  if (portalEl) portalEl.style.display = "block";
  if (userDisp) userDisp.innerText = email;

  hideAuthModal();
  render();
};

window.handleResetPassword = function() {
  const email = document.getElementById("authEmail").value.trim();
  if (!email) return alert("パスワード再設定用メールを送信するため、まずメールアドレスを入力してください。");
  alert("パスワード再設定用の案内を送信しました。（デモ動作）");
};

window.logout = function() {
  location.reload();
};

// --- 🎨 テキスト装飾機能 ---
window.formatText = function(command, value = null) {
  document.execCommand(command, false, value);
};

// フォルダ作成
window.createFolder = function() {
  const input = document.getElementById("folderName");
  const name = input ? input.value.trim() : "";
  if (!name) return;
  folders.push({ id: Date.now(), name: name, isCollapsed: false, words: [] });
  if (input) input.value = "";
  render();
};

window.addBlankWord = function(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({ word: "", meanings: [""], examples: [], details: "" });
    render();
  }
};

window.addWord = function(folderId, word) {
  const cleanWord = word.trim();
  if (!cleanWord) return;
  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({ word: cleanWord, meanings: [`【訳】 ${cleanWord}`], examples: [], details: "" });
    render();
  }
};

window.toggleFolder = function(folderId) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.isCollapsed = !f.isCollapsed; render(); }
};

window.deleteFolder = function(folderId) {
  if (confirm("フォルダを削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    render();
  }
};

window.clearFolderWords = function(folderId) {
  if (confirm("一掃しますか？")) {
    const f = folders.find(x => x.id === folderId);
    if (f) { f.words = []; render(); }
  }
};

window.deleteWord = function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) { f.words.splice(index, 1); render(); }
};

window.updateWordField = function(folderId, wIdx, field, value) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wIdx]) {
    if (field === 'meanings') f.words[wIdx].meanings = [value];
    else if (field === 'details') f.words[wIdx].details = value;
    else if (field === 'word') f.words[wIdx].word = value;
  }
};

// 🎨 画面描画
function render(){
  const foldersEl = document.getElementById("folders");
  if (!foldersEl) return;
  foldersEl.innerHTML = "";

  folders.forEach((folder) => {
    const div = document.createElement("div");
    div.style.cssText = "background: white; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin-bottom: 16px;";

    const wordsHtml = folder.words.map((w, wIdx) => {
      return `
        <div style="background:#ffffff; border:1px solid #e2e8f0; border-left:5px solid #e11d48; padding:12px; margin-top:10px; border-radius:6px;">
          <div style="display:flex; justify-content:space-between; align-items:center;">
            <input value="${w.word || ''}" placeholder="単語を入力..." onchange="updateWordField(${folder.id}, ${wIdx}, 'word', this.value)" style="font-size:1.2em; font-weight:bold; border:none; outline:none; color:#0f172a; width:80%;">
            <button onclick="deleteWord(${folder.id}, ${wIdx})" style="background:none; border:none; color:#ef4444; cursor:pointer;">🗑️</button>
          </div>
          
          <div style="margin-top:8px; display:flex; gap:4px; align-items:center; background:#f8fafc; padding:4px 8px; border-radius:4px; font-size:0.75em;">
            <button onmousedown="event.preventDefault(); formatText('foreColor', '#e11d48');" style="background:#e11d48; color:white; border:none; padding:2px 6px; border-radius:3px;">赤</button>
            <button onmousedown="event.preventDefault(); formatText('foreColor', '#0284c7');" style="background:#0284c7; color:white; border:none; padding:2px 6px; border-radius:3px;">青</button>
            <button onmousedown="event.preventDefault(); formatText('hiliteColor', '#fef08a');" style="background:#fef08a; color:#0f172a; border:none; padding:2px 6px; border-radius:3px;">黄ハイライト</button>
          </div>

          <div style="margin-top:4px; background:#fff5f5; padding:8px; border-radius:4px; font-size:0.95em;">
            <div contenteditable="true" onblur="updateWordField(${folder.id}, ${wIdx}, 'meanings', this.innerHTML)" style="width:100%; outline:none;">${(w.meanings || []).join('<br>')}</div>
          </div>
        </div>
      `;
    }).join("");

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <h2 style="margin:0; font-size:1.1em; cursor:pointer;" onclick="toggleFolder(${folder.id})">📁 ${folder.name} (${folder.words.length}語)</h2>
        <div>
          <button onclick="clearFolderWords(${folder.id})" style="background:#f59e0b; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.8em;">🧹 一掃</button>
          <button onclick="deleteFolder(${folder.id})" style="background:#ef4444; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:0.8em;">削除</button>
        </div>
      </div>
      ${!folder.isCollapsed ? `
        <div style="margin-top:12px;">
          <div style="display:flex; gap:6px; margin-bottom:12px;">
            <input placeholder="英単語を入力してEnter" onkeydown="if(event.key==='Enter'){ addWord(${folder.id}, this.value); this.value=''; }" style="flex:1; padding:8px; border:1px solid #cbd5e1; border-radius:4px;">
            <button onclick="addBlankWord(${folder.id})" style="background:#475569; color:white; border:none; padding:8px 12px; border-radius:4px; font-size:0.85em;">📄 白紙追加</button>
          </div>
          ${wordsHtml}
        </div>
      ` : ''}
    `;
    foldersEl.appendChild(div);
  });
}

// ページの初期化
window.onload = function() {
  const folderInput = document.getElementById("folderName");
  if (folderInput) {
    folderInput.onkeydown = (e) => {
      if (e.key === 'Enter') window.createFolder();
    };
  }
};
