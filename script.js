let folders = JSON.parse(localStorage.getItem("folders")) || [];

const foldersEl = document.getElementById("folders");
const createBtn = document.getElementById("createFolderBtn");
const folderInput = document.getElementById("folderName");

// 主要な不規則動詞の活用データベース
const irregularVerbs = {
  "slay": "slay - slew - slain - slaying",
  "forgive": "forgive - forgave - forgiven - forgiving",
  "do": "do - did - done - doing",
  "go": "go - went - gone - going",
  "see": "see - saw - seen - seeing",
  "take": "take - took - taken - taking",
  "have": "have - had - had - having",
  "come": "come - came - come - coming",
  "make": "make - made - made - making",
  "speak": "speak - spoke - spoken - speaking",
  "write": "write - wrote - written - writing",
  "know": "know - knew - known - knowing",
  "get": "get - got - gotten - getting",
  "give": "give - gave - given - giving",
  "find": "find - found - found - finding",
  "think": "think - thought - thought - thinking",
  "run": "run - ran - run - running",
  "eat": "eat - ate - eaten - eating",
  "drink": "drink - drank - drunk - drinking",
  "begin": "begin - began - begun - beginning",
  "break": "break - broke - broken - breaking",
  "choose": "choose - chose - chosen - choosing",
  "fly": "fly - flew - flown - flying",
  "forget": "forget - forgot - forgotten - forgetting",
  "freeze": "freeze - froze - frozen - freezing",
  "grow": "grow - grew - grown - growing",
  "hide": "hide - hid - hidden - hiding",
  "ride": "ride - rode - ridden - riding",
  "sing": "sing - sang - sung - singing",
  "swim": "swim - swam - swum - swimming"
};

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

// --- 3. 編集された訳の保存 ---
window.updateMeaning = function(folderId, wordIndex, meaningIndex, newText) {
  const f = folders.find(x => x.id === folderId);
  if (f && f.words[wordIndex]) {
    f.words[wordIndex].meanings[meaningIndex] = newText;
    save();
  }
};

function save(){
  localStorage.setItem("folders", JSON.stringify(folders));
}

// --- 4. 発音再生 ---
window.playAudio = function(audioUrl, wordText) {
  setTimeout(() => {
    if (audioUrl) {
      const audio = new Audio(audioUrl);
      audio.play().catch(() => speakFallback(wordText));
    } else {
      speakFallback(wordText);
    }
  }, 500);
};

function speakFallback(text) {
  if ('speechSynthesis' in window) {
    window.speechSynthesis.cancel();
    const uttr = new SpeechSynthesisUtterance(text);
    uttr.lang = 'en-US';
    uttr.rate = 0.9;
    window.speechSynthesis.speak(uttr);
  }
}

// --- 5. 単語直訳用ヘルパー ---
async function fetchWordTranslation(word) {
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=ja&dt=t&q=${encodeURIComponent(word)}`);
    const data = await res.json();
    let translated = data[0].map(item => item[0]).join("");
    return translated.replace(/[。、.]$/g, '').trim();
  } catch (e) {
    return word;
  }
}

// --- 6. 単語追加処理 ---
window.addWord = async function(folderId, word){
  const cleanWord = word.trim();
  if(!cleanWord) return;

  let audioUrl = "";
  let meanings = [];
  let inflections = "";
  let exampleEN = "";
  let exampleJP = "";

  const lowerWord = cleanWord.toLowerCase();

  // ① 活用変化の判定（不規則動詞 DB 優先）
  if (irregularVerbs[lowerWord]) {
    inflections = irregularVerbs[lowerWord];
  }

  try {
    const dictRes = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(cleanWord)}`);
    
    if (dictRes.ok) {
      const dictData = await dictRes.json();
      const entry = dictData[0];

      // 音声URL
      const audioObj = entry.phonetics?.find(p => p.audio && p.audio.length > 0);
      if (audioObj) audioUrl = audioObj.audio;

      // 品詞ごとの処理
      const processedParts = new Set();
      for (const m of entry.meanings) {
        let part = m.partOfSpeech;
        if (processedParts.has(part)) continue; // 品詞の重複防止
        processedParts.add(part);

        let partLabel = part;
        if (part === "verb") partLabel = "動詞";
        else if (part === "noun") partLabel = "名詞";
        else if (part === "adjective") partLabel = "形容詞";
        else if (part === "adverb") partLabel = "副詞";

        // 動詞で規則変化の場合の簡易生成
        if (part === "verb" && !inflections) {
          const ed = lowerWord.endsWith('e') ? lowerWord + 'd' : lowerWord + 'ed';
          const ing = lowerWord.endsWith('e') ? lowerWord.slice(0, -1) + 'ing' : lowerWord + 'ing';
          inflections = `${lowerWord} - ${ed} - ${ed} - ${ing}`;
        }

        // 単語そのものの簡潔な訳を取得
        const cleanJP = await fetchWordTranslation(cleanWord);
        meanings.push(`【${partLabel}】 ${cleanJP}`);

        if (!exampleEN && m.definitions[0]?.example) {
          exampleEN = m.definitions[0].example;
        }
      }
    }
  } catch (e) {
    console.error("辞書APIエラー:", e);
  }

  // フォールバック
  if (meanings.length === 0) {
    const fallbackJP = await fetchWordTranslation(cleanWord);
    meanings.push(`【訳】 ${fallbackJP}`);
  }

  if (exampleEN) {
    exampleJP = await fetchWordTranslation(exampleEN);
  }

  const folder = folders.find(f => f.id === folderId);
  if (folder) {
    folder.words.push({
      word: cleanWord,
      audio: audioUrl,
      meanings: meanings,
      inflections: inflections,
      exampleEN: exampleEN,
      exampleJP: exampleJP
    });
    save();
    render();
  }
};

// --- 7. 画面描画 ---
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

      ${folder.words.map((w, wordIndex) => `
        <div class="word" style="background: #f8fafc; border-left: 4px solid #2563eb; padding: 12px; margin-top: 10px; border-radius: 6px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <b style="font-size: 1.2em; color: #1e3a8a;">${w.word}</b>
              <button onclick="playAudio('${w.audio}', '${w.word}')" style="background:#2563eb; color:white; border:none; border-radius:50%; width:28px; height:28px; cursor:pointer;" title="発音を聞く">🔊</button>
            </div>
            <button onclick="deleteWord(${folder.id}, ${wordIndex})" style="background-color: #94a3b8; color: white; border: none; padding: 4px 8px; border-radius: 4px; cursor: pointer;">削除</button>
          </div>

          ${w.inflections ? `
            <div style="margin-top: 4px; font-size: 0.85em; color: #0284c7; font-weight: bold;">
              活用: ${w.inflections}
            </div>
          ` : ''}
          
          <div style="margin-top: 8px; color: #334155;">
            <b style="font-size: 0.9em; color: #64748b;">意味 (クリックで自由編集):</b>
            <ul style="margin: 4px 0; padding-left: 20px;">
              ${w.meanings.map((m, meaningIndex) => `
                <li 
                  contenteditable="true" 
                  onblur="updateMeaning(${folder.id}, ${wordIndex}, ${meaningIndex}, this.innerText)"
                  style="outline: none; padding: 2px 4px; border-radius: 3px; cursor: text;"
                  title="クリックして訳を直接変更できます"
                >${m}</li>
              `).join("")}
            </ul>
          </div>

          ${w.exampleEN ? `
            <div style="margin-top: 8px; background: #fff; padding: 8px; border-radius: 4px; font-size: 0.9em; border: 1px solid #e2e8f0;">
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
