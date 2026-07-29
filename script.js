let folders = JSON.parse(localStorage.getItem("folders")) || [];

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

createBtn.onclick = () => {
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
};

function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// 無料の Free Dictionary API を直接呼び出すように変更
async function addWord(folderId, word){
  if(!word) return;

  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    
    let meaning = "意味が見つかりませんでした";
    let example = "";
    let audio = "";

    if (res.ok) {
      const data = await res.json();
      const firstEntry = data[0];
      
      // 最初の意味を取得
      meaning = firstEntry.meanings[0]?.definitions[0]?.definition || "意味なし";
      // 例文を取得（あれば）
      example = firstEntry.meanings[0]?.definitions[0]?.example || "";
      // 発音音声を検索
      const phoneticsWithAudio = firstEntry.phonetics?.find(p => p.audio);
      audio = phoneticsWithAudio ? phoneticsWithAudio.audio : "";
    }

    const folder = folders.find(f => f.id === folderId);

    folder.words.push({
      word,
      meaning: meaning, // 英語の定義
      example: example, // 英語の例文
      audio: audio      // 音声データURL
    });

    save();
    render();

  } catch (error) {
    console.error("APIエラー:", error);
    alert("単語の取得に失敗しました。");
  }
}

function deleteWord(folderId, index){
  const f = folders.find(x => x.id === folderId);
  f.words.splice(index,1);
  save();
  render();
}

function render(){
  foldersEl.innerHTML = "";

  folders.forEach(folder => {
    const div = document.createElement("div");
    div.className = "folder";

    div.innerHTML = `
      <h2>📁 ${folder.name}</h2>

      <input placeholder="単語を入力してEnter"
        onkeydown="if(event.key==='Enter'){addWord(${folder.id},this.value);this.value=''}"
      >

      ${folder.words.map((w,i)=>`
        <div class="word">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <b>${w.word}</b>
            ${w.audio ? `<button onclick="new Audio('${w.audio}').play()">🔊 発音</button>` : ''}
          </div>
          <p><b>意味:</b> ${w.meaning}</p>
          ${w.example ? `<p><i>例文:</i> ${w.example}</p>` : ''}

          <button onclick="deleteWord(${folder.id},${i})" style="margin-top: 5px;">削除</button>
        </div>
      `).join("")}
    `;

    foldersEl.appendChild(div);
  });
}

render();
