let folders = JSON.parse(localStorage.getItem("folders")) || [];

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// --- 1. フォルダ作成機能 ---
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

// ボタンクリックとEnterキーの両方に対応
createBtn.onclick = createFolder;
folderInput.onkeydown = (e) => {
  if (e.key === "Enter") createFolder();
};

// --- 2. フォルダ削除機能 ---
function deleteFolder(folderId) {
  if (confirm("このフォルダと中の単語をすべて削除しますか？")) {
    folders = folders.filter(f => f.id !== folderId);
    save();
    render();
  }
}

// --- 3. データの保存 ---
function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// --- 4. 単語追加（無料翻訳APIで日本語の意味を取得） ---
async function addWord(folderId, word){
  if(!word.trim()) return;

  try {
    // 完全無料の翻訳APIを利用して英単語を日本語に翻訳
    const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(word)}&langpair=en|ja`);
    const data = await res.json();
    
    // 翻訳結果を取得（見つからない場合はメッセージ）
    const meaningJP = data.responseData?.translatedText || "意味を取得できませんでした";

    const folder = folders.find(f => f.id === folderId);

    folder.words.push({
      word: word.trim(),
      meaning: meaningJP
    });

    save();
    render();

  } catch (error) {
    console.error("APIエラー:", error);
    alert("単語の取得に失敗しました。");
  }
}

// --- 5. 単語削除機能 ---
function deleteWord(folderId, index){
  const f = folders.find(x => x.id === folderId);
  f.words.splice(index, 1);
  save();
  render();
}

// --- 6. 画面描画（UI） ---
function render(){
  foldersEl.innerHTML = "";

  folders.forEach(folder => {
    const div = document.createElement("div");
    div.className = "folder";

    div.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h2 style="margin: 0;">📁 ${folder.name}</h2>
        <button onclick="deleteFolder(${folder.id})" style="background-color: #ef4444;">🗑️ フォルダ削除</button>
      </div>

      <input placeholder="単語を入力してEnter"
        onkeydown="if(event.key==='Enter'){addWord(${folder.id}, this.value); this.value=''}"
      >

      ${folder.words.map((w, i) => `
        <div class="word">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <b style="font-size: 1.1em; color: #1e3a8a;">${w.word}</b>
            <button onclick="deleteWord(${folder.id}, ${i})" style="background-color: #64748b; font-size: 12px;">削除</button>
          </div>
          <p style="margin: 5px 0 0 0; color: #334155;"><b>意味:</b> ${w.meaning}</p>
        </div>
      `).join("")}
    `;

    foldersEl.appendChild(div);
  });
}

render();
