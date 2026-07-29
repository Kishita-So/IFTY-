let folders = JSON.parse(localStorage.getItem("folders")) || [];

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// --- 1. フォルダ作成（Enterキー＆ボタン両対応） ---
function createFolder() {
  const name = folderInput.value.trim();
  if (!name) return;

  folders.push({
    id: Date.now(),
    name,
    words: []
  });

  folderInput.value = "";
  save();
  render();
}

// クリック時とEnterキー押下時の両方で発火
if (createBtn) createBtn.onclick = createFolder;
if (folderInput) {
  folderInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // フォーム送信等のデフォルト動作を防止
      createFolder();
    }
  });
}

// --- 2. フォルダ削除機能 ---
window.deleteFolder = function(folderId) {
  if (confirm("このフォルダを削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    save();
    render();
  }
};

// --- 3. 単語削除機能 ---
window.deleteWord = function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    f.words.splice(index, 1);
    save();
    render();
  }
};

// --- 4. データの保存 ---
function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// --- 5. 単語追加（無料APIで日本語訳を取得） ---
window.addWord = async function(folderId, word){
  if(!word.trim()) return;

  try {
    // MyMemory APIを使って英和翻訳を取得（完全無料・登録不要）
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ja`);
    const data = await res.json();
    
    // 翻訳結果を取得
    const meaningJP = data.responseData?.translatedText || "意味が見つかりませんでした";

    const folder = folders.find(f => f.id === folderId);
    if (folder) {
      folder.words.push({
        word: word.trim(),
        meaning: meaningJP
      });
      save();
      render();
    }

  } catch (error) {
    console.error("APIエラー:", error);
    alert("単語の意味を取得できませんでした。");
  }
};

// --- 6. 画面の描画 ---
function render(){
  if (!foldersEl) return;
  foldersEl.innerHTML = "";

  folders.forEach(folder => {
    const div = document.createElement("div");
    div.className = "folder";

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <h2 style="margin: 0;">📁 ${folder.name}</h2>
        <button onclick="deleteFolder(${folder.id})" style="background-color: #ef4444; color: white; border: none; padding: 6px 12px; border-radius: 4px; cursor: pointer;">🗑️ フォルダ削除</button>
      </div>

      <input placeholder="単語を入力してEnter"
        onkeydown="if(event.key==='Enter'){ addWord(${folder.id}, this.value); this.value=''; }"
        style="width: 100%; padding: 8px; box-sizing: border-box; margin-bottom: 10px;"
      >

      ${folder.words.map((w, i) => `
        <div class="word" style="background: #f1f5f9; padding: 10px; margin-top: 8px; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <b style="font-size: 1.1em; color: #1e293b;">${w.word}</b>
            <button onclick="deleteWord(${folder.id}, ${i})" style="background-color: #94a3b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">削除</button>
          </div>
          <p style="margin: 6px 0 0 0; color: #334155;"><b>意味:</b> ${w.meaning}</p>
        </div>
      `).join("")}
    `;

    foldersEl.appendChild(div);
  });
}

// 初期描画
render();
