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

async function addWord(folderId, word){

  if(!word) return;

  const res = await fetch("/api/word", {
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({ word })
  });

  const ai = await res.json();

  const folder = folders.find(f => f.id === folderId);

  folder.words.push({
    word,
    meaning: ai.meaning,
    past: ai.past,
    pastParticiple: ai.pastParticiple,
    presentParticiple: ai.presentParticiple,
    example: ai.example,
    exampleJP: ai.exampleJP
  });

  save();
  render();
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

      <input placeholder="単語入力してEnter"
        onkeydown="if(event.key==='Enter'){addWord(${folder.id},this.value);this.value=''}"
      >

      ${folder.words.map((w,i)=>`
        <div class="word">
          <b>${w.word}</b><br>
          ${w.meaning}<br>
          ${w.example}<br>
          ${w.exampleJP}<br>

          <small>
            ${w.past} / ${w.pastParticiple} / ${w.presentParticiple}
          </small>

          <button onclick="deleteWord(${folder.id},${i})">削除</button>
        </div>
      `).join("")}

    `;

    foldersEl.appendChild(div);
  });
}

render();
