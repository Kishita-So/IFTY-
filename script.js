let folders = JSON.parse(localStorage.getItem("folders")) || [];
let dictionaryData = {};

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// --- 0. 辞書データ(ejdict.json)の読み込み ---
async function loadDictionary() {
  try {
    const res = await fetch("./ejdict.json");
    if (res.ok) {
      dictionaryData = await res.json();
    }
  } catch (e) {
    console.error("辞書データの読み込みに失敗しました:", e);
  }
}
loadDictionary();

// --- 1. フォルダ作成（Enter確定対応） ---
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

// --- 2. フォルダ＆単語の削除 ---
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

// --- 3. 外部翻訳API（辞書データに無かった時のフォールバック） ---
async function fallbackTranslate(word) {
  try {
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ja`);
    const data = await res.json();
    return data.responseData?.translatedText || "訳が見つかりませんでした";
  } catch (e) {
    return "訳の取得に失敗しました";
  }
}

// --- 4. 単語追加（高品質辞書 ➔ 無料翻訳の順で検索） ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim().toLowerCase();
  if(!cleanWord) return;

  let meanings = [];
  let exampleEN = "";
  let exampleJP = "";

  // ① まずは正確な辞書データ(ejdict.json)から検索
  if (dictionaryData[cleanWord]) {
    meanings = dictionaryData[cleanWord].meanings;
    exampleEN = dictionaryData[cleanWord].exampleEN || "";
    exampleJP = dictionaryData[cleanWord].exampleJP || "";
  } else {
    // ② 辞書になければ外部翻訳APIを使用
    const transResult = await fallbackTranslate(cleanWord);
    meanings = [`【訳】 ${transResult}`];
  }

  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: cleanWord,
      meanings: meanings,
      exampleEN: exampleEN,
      exampleJP: exampleJP
    });
    save();
    render();
  }
};

// --- 5. 画面描画（UI） ---
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
            <b style="font-size: 1.2em; color: #1e3a8a; text-transform: capitalize;">${w.word}</b>
            <button onclick="deleteWord(${folder.id}, ${i})" style="background-color: #94a3b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">削除</button>
          </div>
          
          <div style="margin-top: 8px; color: #334155;">
            <b>意味:</b>
            <ul style="margin: 4px 0; padding-left: 20px;">
              ${w.meanings.map(m => `<li>${m}</li>`).join("")}
            </ul>
          </div>

          ${w.exampleEN ? `
            <div style="margin-top: 8px; background: #fff; padding: 8px; border-radius: 4px; font-size: 0.9em;">
              <p style="margin: 0; color: #475569;"><b>例文:</b> ${w.exampleEN}</p>
              ${w.exampleJP ? `<p style="margin: 4px 0 0 0; color: #64748b;">${w.exampleJP}</p>` : ''}
            </div>
          ` : ''}
        </div>
      `).join("")}
    `;

    foldersEl.appendChild(div);
  });
}

render();
