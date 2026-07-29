let folders = JSON.parse(localStorage.getItem("folders")) || [];
let dictionaryData = {};

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// --- 0. 辞書データの読み込み ---
async function loadDictionary() {
  try {
    const res = await fetch("./ejdict.json");
    if (res.ok) {
      dictionaryData = await res.json();
    }
  } catch (e) {
    console.error("辞書の読み込みに失敗しました:", e);
  }
}
loadDictionary();

// --- 1. フォルダ作成 ---
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

if (createBtn) createBtn.onclick = createFolder;
if (folderInput) {
  folderInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      createFolder();
    }
  });
}

// --- 2. 削除機能 ---
window.deleteFolder = function(folderId) {
  if (confirm("このフォルダを削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    save();
    render();
  }
};

window.deleteWord = function(folderId, index) {
  const f = folders.find(x => x.id === folderId);
  if (f) {
    f.words.splice(index, 1);
    save();
    render();
  }
};

function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// バックアップ用無料翻訳（Google経由）
async function translateFallback(text) {
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(text)}`);
    const data = await res.json();
    return data[0][0][0]; 
  } catch(e) {
    return "訳が見つかりませんでした";
  }
}

// --- 3. 単語追加（ハイブリッド検索） ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  let meanings = [];
  const lowerWord = cleanWord.toLowerCase();
  
  // ① まずはEJDictから検索
  if (dictionaryData[lowerWord]) {
    meanings = dictionaryData[lowerWord].meanings || [dictionaryData[lowerWord]];
  } else {
    // ② 辞書になかった超難単語・固有名詞は無料翻訳APIで自動取得
    const translated = await translateFallback(cleanWord);
    meanings = [`【訳】 ${translated}`];
  }

  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: cleanWord,
      meanings: meanings
    });
    
    // 💡 重要：保存して画面を再描画する
    save();
    render();
  }
};

// --- 4. 画面描画 ---
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
        <div class="word" style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px; margin-top: 10px; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <b style="font-size: 1.2em; color: #1e3a8a;">${w.word}</b>
            <button onclick="deleteWord(${folder.id}, ${i})" style="background-color: #94a3b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">削除</button>
          </div>
          
          <div style="margin-top: 8px; color: #334155;">
            <b>意味:</b>
            <ul style="margin: 4px 0; padding-left: 20px;">
              ${Array.isArray(w.meanings) ? w.meanings.map(m => `<li>${m}</li>`).join("") : `<li>${w.meanings}</li>`}
            </ul>
          </div>
        </div>
      `).join("")}
    `;

    foldersEl.appendChild(div);
  });
}

render();
